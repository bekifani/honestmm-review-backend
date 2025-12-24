import { Request, Response } from "express";
import { SubscriptionService } from "../services/subscriptionService";
import { stripe, SUBSCRIPTION_PLANS } from "../config/stripe";
import Stripe from "stripe";
import prisma from "../config/prisma";

const subscriptionService = new SubscriptionService();

/**
 * Get available subscription plans
 */
export const getPlans = async (req: Request, res: Response) => {
  try {
    res.json({
      plans: SUBSCRIPTION_PLANS,
    });
  } catch (error) {
    console.error("Get plans error:", error);
    res.status(500).json({ error: "Failed to fetch plans" });
  }
};

/**
 * Verify checkout session (fallback verification in addition to webhook)
 * Frontend should send the Stripe Checkout session_id from success URL.
 */
export const verifyCheckoutSession = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { sessionId, checkoutSessionId } = req.body as { sessionId?: string; checkoutSessionId?: string };
    const sid = sessionId || checkoutSessionId;
    if (!sid) {
      return res.status(400).json({ error: "Missing sessionId" });
    }

    // Retrieve Checkout Session
    const session = await stripe.checkout.sessions.retrieve(sid);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Ensure session belongs to this user via metadata or customer match
    const metaUserId = session.metadata?.userId ? parseInt(session.metadata.userId) : undefined;
    if (metaUserId && metaUserId !== userId) {
      return res.status(403).json({ error: "Session metadata does not match user" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true } });
    if (user?.stripeCustomerId && session.customer && typeof session.customer === "string" && session.customer !== user.stripeCustomerId) {
      return res.status(403).json({ error: "Session does not belong to this user" });
    }

    // Validate subscription on session
    const subscriptionId = session.subscription as string | null;
    if (!subscriptionId) {
      return res.status(400).json({ error: "Session has no subscription" });
    }

    const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
    const firstItem = stripeSub.items.data[0];
    const priceId = firstItem?.price?.id as string | undefined;
    const productId = firstItem?.price?.product as string | undefined;

    // Resolve plan from metadata or price id mapping
    let plan = (session.metadata?.plan as keyof typeof SUBSCRIPTION_PLANS | undefined) || undefined;
    if (!plan && priceId) {
      for (const [p, cfg] of Object.entries(SUBSCRIPTION_PLANS)) {
        if ((cfg as any).priceId && (cfg as any).priceId === priceId) {
          plan = p as keyof typeof SUBSCRIPTION_PLANS;
          break;
        }
      }
    }
    if (!plan) {
      return res.status(400).json({ error: "Unable to resolve plan from session" });
    }

    const now = new Date();
    let currentPeriodStart = new Date(((stripeSub as any).current_period_start || 0) * 1000);
    let currentPeriodEnd = new Date(((stripeSub as any).current_period_end || 0) * 1000);

    // Fix 1970 date issue: if dates are invalid (epoch 0), set defaults
    if (currentPeriodEnd.getFullYear() === 1970) {
      console.warn(`Invalid Stripe period for ${stripeSub.id}, defaulting to now + 30 days`);
      currentPeriodStart = new Date();
      currentPeriodEnd = new Date();
      currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);
    }

    // Idempotent create/update
    const existingByStripe = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: stripeSub.id } });
    const planCfg = SUBSCRIPTION_PLANS[plan];

    if (!existingByStripe) {
      const existingByUser = await prisma.subscription.findUnique({ where: { userId } });
      if (existingByUser) {
        await prisma.subscription.update({
          where: { userId },
          data: {
            stripeSubscriptionId: stripeSub.id,
            stripePriceId: priceId || existingByUser.stripePriceId,
            stripeProductId: productId || existingByUser.stripeProductId,
            plan: plan as string,
            status: stripeSub.status,
            currentPeriodStart,
            currentPeriodEnd,
            maxFileAnalyses: planCfg.maxFileAnalyses,
            maxChatMessages: planCfg.maxChatMessages,
            usageResetAt: currentPeriodEnd,
            cancelAtPeriodEnd: false,
          },
        });
      } else {
        await subscriptionService.createSubscription(
          userId,
          stripeSub.id,
          priceId || "",
          productId || "",
          plan as any,
          currentPeriodStart,
          currentPeriodEnd
        );
      }
    }

    return res.json({ verified: true, status: stripeSub.status, plan, stripeSubscriptionId: stripeSub.id });
  } catch (error) {
    console.error("Verify checkout session error:", error);
    return res.status(500).json({ error: "Failed to verify session" });
  }
};

/**
 * Create checkout session for subscription
 */
export const createCheckoutSession = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const email = (req.user as any)?.email;
    const name = (req.user as any)?.name;

    if (!userId || !email) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { plan, stripePriceId } = req.body;

    if (!plan || !stripePriceId) {
      return res.status(400).json({ error: "Plan and price ID are required" });
    }

    const planConfig = SUBSCRIPTION_PLANS[plan as keyof typeof SUBSCRIPTION_PLANS];
    if (!planConfig) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    const successUrl = `${process.env.CLIENT_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${process.env.CLIENT_URL}/subscription/cancel`;

    // Determine mode from plan config (default to subscription for safety)
    const mode = (planConfig as any).mode || "subscription";

    const session = await subscriptionService.createCheckoutSession(
      userId,
      email,
      name,
      plan,
      stripePriceId,
      successUrl,
      cancelUrl,
      mode
    );

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error("Create checkout session error:", error);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
};

/**
 * Get user's current subscription
 */
export const getCurrentSubscription = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const subscription = await subscriptionService.getUserSubscription(userId);

    if (!subscription) {
      return res.json({ subscription: null });
    }

    res.json({ subscription });
  } catch (error) {
    console.error("Get subscription error:", error);
    res.status(500).json({ error: "Failed to fetch subscription" });
  }
};

/**
 * Cancel subscription
 */
export const cancelSubscription = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { cancelAtPeriodEnd = true } = req.body;

    const subscription = await subscriptionService.cancelSubscription(
      userId,
      cancelAtPeriodEnd
    );

    res.json({
      message: cancelAtPeriodEnd
        ? "Subscription will be canceled at the end of the billing period"
        : "Subscription canceled immediately",
      subscription,
    });
  } catch (error) {
    console.error("Cancel subscription error:", error);
    res.status(500).json({
      error: "Failed to cancel subscription",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Create billing portal session
 */
export const createBillingPortalSession = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const returnUrl = `${process.env.CLIENT_URL}/subscription`;

    const session = await subscriptionService.createBillingPortalSession(userId, returnUrl);

    res.json({ url: session.url });
  } catch (error) {
    console.error("Create billing portal session error:", error);
    res.status(500).json({
      error: "Failed to create billing portal session",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Stripe webhook handler
 */
export const handleWebhook = async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"];

  if (!sig) {
    return res.status(400).json({ error: "No signature" });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return res.status(400).json({ error: "Invalid signature" });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(session);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentSucceeded(invoice);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentFailed(invoice);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    res.status(500).json({ error: "Webhook handler failed" });
  }
};

/**
 * Handle checkout session completed
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const userId = parseInt(session.metadata?.userId || "0");
  const plan = session.metadata?.plan;

  if (!userId || !plan) {
    console.error("Missing userId or plan in session metadata");
    return;
  }

  let subscriptionId: string;
  let priceId: string;
  let productId: string;
  let currentPeriodStart: Date;
  let currentPeriodEnd: Date;

  if (session.subscription) {
    // Recurring Subscription
    subscriptionId = session.subscription as string;
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    const firstItem = subscription.items.data[0];
    if (!firstItem || !firstItem.price) {
      console.error("No subscription items found");
      return;
    }

    priceId = firstItem.price.id;
    productId = firstItem.price.product as string;

    currentPeriodStart = new Date(((subscription as any).current_period_start || 0) * 1000);
    currentPeriodEnd = new Date(((subscription as any).current_period_end || 0) * 1000);

    // Fix 1970 date issue
    if (currentPeriodEnd.getFullYear() === 1970) {
      currentPeriodStart = new Date();
      currentPeriodEnd = new Date();
      currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);
    }
  } else {
    // One-Time Payment
    // Retrieve full session to get line items
    const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ["line_items"],
    });

    const firstItem = fullSession.line_items?.data[0];
    if (!firstItem || !firstItem.price) {
      console.error("No line items found in session");
      return;
    }

    priceId = firstItem.price.id;
    productId = firstItem.price.product as string;
    // Use Payment Intent or Session ID as the "subscription" ID for DB consistency
    subscriptionId = (fullSession.payment_intent as string) || fullSession.id;

    currentPeriodStart = new Date();
    currentPeriodEnd = new Date();
    currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30); // Grant 30 days access
  }

  await subscriptionService.createSubscription(
    userId,
    subscriptionId,
    priceId,
    productId,
    plan as any,
    currentPeriodStart,
    currentPeriodEnd
  );

  console.log(`Subscription created for user ${userId}, plan: ${plan}`);
}

/**
 * Handle subscription updated
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  // Calculate dates safely
  let currentPeriodStart = new Date(((subscription as any).current_period_start || 0) * 1000);
  let currentPeriodEnd = new Date(((subscription as any).current_period_end || 0) * 1000);

  // Fix 1970 date issue
  if (currentPeriodEnd.getFullYear() === 1970) {
    currentPeriodStart = new Date();
    currentPeriodEnd = new Date();
    currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);
  }

  await subscriptionService.updateSubscriptionStatus(
    subscription.id,
    subscription.status,
    currentPeriodStart,
    currentPeriodEnd
  );

  console.log(`Subscription ${subscription.id} updated to status: ${subscription.status}`);
}

/**
 * Handle subscription deleted
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  await subscriptionService.updateSubscriptionStatus(subscription.id, "canceled");

  console.log(`Subscription ${subscription.id} canceled`);
}

/**
 * Handle invoice payment succeeded
 */
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = (invoice as any).subscription;

  if (subscriptionId && typeof subscriptionId === 'string') {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Reset usage for new billing period
    const userId = parseInt(subscription.metadata?.userId || "0");
    if (userId) {
      await subscriptionService.resetUsage(
        userId,
        new Date(((subscription as any).current_period_end || 0) * 1000)
      );
    }

    console.log(`Invoice paid for subscription ${subscriptionId}, usage reset`);
  }
}

/**
 * Handle invoice payment failed
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = (invoice as any).subscription;

  if (subscriptionId && typeof subscriptionId === 'string') {
    await subscriptionService.updateSubscriptionStatus(subscriptionId, "past_due");

    console.log(`Payment failed for subscription ${subscriptionId}`);
  }
}

/**
 * Get usage statistics
 */
export const getUsageStats = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const subscription = await subscriptionService.getUserSubscription(userId);

    if (!subscription) {
      // Free plan usage: one-time trial limits from env (default 3 files, 5 chats)
      const FREE_FILE_ANALYSES = Number(process.env.FREE_FILE_ANALYSES ?? 3);
      const FREE_CHAT_MESSAGES = Number(process.env.FREE_CHAT_MESSAGES ?? 5);

      const usedFiles = await prisma.usageLog.count({
        where: { userId, usageType: "file_analysis" },
      });
      const usedChats = await prisma.usageLog.count({
        where: { userId, usageType: "chat_message" },
      });

      const remainingFiles = Math.max(0, FREE_FILE_ANALYSES - usedFiles);
      const remainingChats = Math.max(0, FREE_CHAT_MESSAGES - usedChats);

      return res.json({
        hasSubscription: false,
        plan: "free",
        status: "trial",
        fileAnalyses: {
          used: usedFiles,
          limit: FREE_FILE_ANALYSES,
          remaining: remainingFiles,
        },
        chatMessages: {
          used: usedChats,
          limit: FREE_CHAT_MESSAGES,
          remaining: remainingChats,
        },
      });
    }

    res.json({
      hasSubscription: true,
      plan: subscription.plan,
      status: subscription.status,
      fileAnalyses: {
        used: subscription.usedFileAnalyses,
        limit: subscription.maxFileAnalyses,
        remaining: subscription.fileAnalysesRemaining,
      },
      chatMessages: {
        used: subscription.usedChatMessages,
        limit: subscription.maxChatMessages,
        remaining: subscription.chatMessagesRemaining,
      },
      currentPeriodEnd: subscription.currentPeriodEnd,
      usageResetAt: subscription.usageResetAt,
    });
  } catch (error) {
    console.error("Get usage stats error:", error);
    res.status(500).json({ error: "Failed to fetch usage statistics" });
  }
};
