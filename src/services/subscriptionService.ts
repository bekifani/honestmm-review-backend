import { stripe, SUBSCRIPTION_PLANS, PlanType } from "../config/stripe";
import prisma from "../config/prisma";
import Stripe from "stripe";

export class SubscriptionService {
  private readonly FREE_FILE_ANALYSES = Number(process.env.FREE_FILE_ANALYSES ?? 3);
  private readonly FREE_CHAT_MESSAGES = Number(process.env.FREE_CHAT_MESSAGES ?? 5);
  /**
   * Create or retrieve Stripe customer for user
   */
  async getOrCreateCustomer(userId: number, email: string, name: string): Promise<string> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });

    if (user?.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    // Create new Stripe customer
    const customer = await stripe.customers.create({
      email,
      name,
      metadata: { userId: userId.toString() },
    });

    // Save customer ID to database
    await prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

  /**
   * Create checkout session for subscription
   */
  async createCheckoutSession(
    userId: number,
    email: string,
    name: string,
    plan: PlanType,
    stripePriceId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<Stripe.Checkout.Session> {
    const customerId = await this.getOrCreateCustomer(userId, email, name);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId: userId.toString(),
        plan,
      },
    });

    return session;
  }

  /**
   * Create subscription in database after successful payment
   */
  async createSubscription(
    userId: number,
    stripeSubscriptionId: string,
    stripePriceId: string,
    stripeProductId: string,
    plan: PlanType,
    currentPeriodStart: Date,
    currentPeriodEnd: Date
  ) {
    const planConfig = SUBSCRIPTION_PLANS[plan];

    return await prisma.subscription.create({
      data: {
        userId,
        stripeSubscriptionId,
        stripePriceId,
        stripeProductId,
        plan,
        status: "active",
        currentPeriodStart,
        currentPeriodEnd,
        maxFileAnalyses: planConfig.maxFileAnalyses,
        maxChatMessages: planConfig.maxChatMessages,
        usageResetAt: currentPeriodEnd,
      },
    });
  }

  /**
   * Update subscription status
   */
  async updateSubscriptionStatus(
    stripeSubscriptionId: string,
    status: string,
    currentPeriodStart?: Date,
    currentPeriodEnd?: Date
  ) {
    const updateData: any = { status };

    if (currentPeriodStart) updateData.currentPeriodStart = currentPeriodStart;
    if (currentPeriodEnd) updateData.currentPeriodEnd = currentPeriodEnd;

    return await prisma.subscription.update({
      where: { stripeSubscriptionId },
      data: updateData,
    });
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(userId: number, cancelAtPeriodEnd: boolean = true) {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      throw new Error("No active subscription found");
    }

    if (cancelAtPeriodEnd) {
      // Cancel at period end
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      await prisma.subscription.update({
        where: { userId },
        data: { cancelAtPeriodEnd: true },
      });
    } else {
      // Cancel immediately
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);

      await prisma.subscription.update({
        where: { userId },
        data: { status: "canceled" },
      });
    }

    return subscription;
  }

  /**
   * Check if user has reached usage limit
   */
  async checkUsageLimit(userId: number, usageType: "file_analysis" | "chat_message"): Promise<{
    allowed: boolean;
    remaining: number;
    limit: number;
  }> {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    // No active subscription -> apply FREE plan limits using UsageLog counts (lifetime)
    if (!subscription || subscription.status !== "active") {
      const freeLimit =
        usageType === "file_analysis"
          ? this.FREE_FILE_ANALYSES
          : this.FREE_CHAT_MESSAGES;

      if (!freeLimit || freeLimit <= 0) {
        return { allowed: false, remaining: 0, limit: 0 };
      }

      const used = await prisma.usageLog.count({
        where: { userId, usageType },
      });

      const remaining = Math.max(0, freeLimit - used);
      return { allowed: remaining > 0, remaining, limit: freeLimit };
    }

    // Check if usage needs to be reset (new billing period)
    const now = new Date();
    if (now > subscription.usageResetAt) {
      await this.resetUsage(userId, subscription.currentPeriodEnd);
      // Refresh subscription data
      const updatedSub = await prisma.subscription.findUnique({
        where: { userId },
      });
      if (!updatedSub) {
        return { allowed: false, remaining: 0, limit: 0 };
      }
      return this.calculateUsageLimit(updatedSub, usageType);
    }

    return this.calculateUsageLimit(subscription, usageType);
  }

  /**
   * Calculate usage limit
   */
  private calculateUsageLimit(
    subscription: any,
    usageType: "file_analysis" | "chat_message"
  ): {
    allowed: boolean;
    remaining: number;
    limit: number;
  } {
    if (usageType === "file_analysis") {
      const limit = subscription.maxFileAnalyses;
      const used = subscription.usedFileAnalyses;

      // Unlimited plan
      if (limit === -1) {
        return { allowed: true, remaining: -1, limit: -1 };
      }

      const remaining = limit - used;
      return {
        allowed: remaining > 0,
        remaining: Math.max(0, remaining),
        limit,
      };
    } else {
      const limit = subscription.maxChatMessages;
      const used = subscription.usedChatMessages;

      // Unlimited plan
      if (limit === -1) {
        return { allowed: true, remaining: -1, limit: -1 };
      }

      const remaining = limit - used;
      return {
        allowed: remaining > 0,
        remaining: Math.max(0, remaining),
        limit,
      };
    }
  }

  /**
   * Track usage
   */
  async trackUsage(
    userId: number,
    usageType: "file_analysis" | "chat_message",
    fileId?: number,
    chatLogId?: number,
    metadata?: any
  ) {
    // Create usage log with conditional properties
    const usageData: any = {
      userId,
      usageType,
    };

    // Only add optional fields if they have values
    if (fileId !== undefined) usageData.fileId = fileId;
    if (chatLogId !== undefined) usageData.chatLogId = chatLogId;
    if (metadata !== undefined) usageData.metadata = metadata;

    await prisma.usageLog.create({
      data: usageData,
    });

    // Update subscription usage counter
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (subscription) {
      if (usageType === "file_analysis") {
        await prisma.subscription.update({
          where: { userId },
          data: { usedFileAnalyses: { increment: 1 } },
        });
      } else {
        await prisma.subscription.update({
          where: { userId },
          data: { usedChatMessages: { increment: 1 } },
        });
      }
    }
  }

  /**
   * Reset usage counters for new billing period
   */
  async resetUsage(userId: number, nextResetDate: Date) {
    await prisma.subscription.update({
      where: { userId },
      data: {
        usedFileAnalyses: 0,
        usedChatMessages: 0,
        usageResetAt: nextResetDate,
      },
    });
  }

  /**
   * Get user subscription with usage stats
   */
  async getUserSubscription(userId: number) {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      return null;
    }

    const planConfig = SUBSCRIPTION_PLANS[subscription.plan as PlanType];

    return {
      ...subscription,
      planName: planConfig.name,
      features: planConfig.features,
      fileAnalysesRemaining:
        subscription.maxFileAnalyses === -1
          ? -1
          : subscription.maxFileAnalyses - subscription.usedFileAnalyses,
      chatMessagesRemaining:
        subscription.maxChatMessages === -1
          ? -1
          : subscription.maxChatMessages - subscription.usedChatMessages,
    };
  }

  /**
   * Create billing portal session
   */
  async createBillingPortalSession(userId: number, returnUrl: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });

    if (!user?.stripeCustomerId) {
      throw new Error("No Stripe customer found");
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl,
    });

    return session;
  }
}
