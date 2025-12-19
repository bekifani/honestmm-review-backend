import { Request, Response } from "express";
import { SubscriptionService } from "../services/subscriptionService";
import { stripe, SUBSCRIPTION_PLANS } from "../config/stripe";
import Stripe from "stripe";

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

    if (!SUBSCRIPTION_PLANS[plan as keyof typeof SUBSCRIPTION_PLANS]) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    const successUrl = `${process.env.CLIENT_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${process.env.CLIENT_URL}/subscription/cancel`;

    const session = await subscriptionService.createCheckoutSession(
      userId,
      email,
      name,
      plan,
      stripePriceId,
      successUrl,
      cancelUrl
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

  const subscriptionId = session.subscription as string;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  const firstItem = subscription.items.data[0];
  if (!firstItem || !firstItem.price) {
    console.error("No subscription items found");
    return;
  }

  const priceId = firstItem.price.id;
  const productId = firstItem.price.product as string;

  await subscriptionService.createSubscription(
    userId,
    subscription.id,
    priceId,
    productId,
    plan as any,
    new Date(((subscription as any).current_period_start || 0) * 1000),
    new Date(((subscription as any).current_period_end || 0) * 1000)
  );

  console.log(`Subscription created for user ${userId}, plan: ${plan}`);
}

/**
 * Handle subscription updated
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  await subscriptionService.updateSubscriptionStatus(
    subscription.id,
    subscription.status,
    new Date(((subscription as any).current_period_start || 0) * 1000),
    new Date(((subscription as any).current_period_end || 0) * 1000)
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
      return res.json({
        hasSubscription: false,
        fileAnalyses: { used: 0, limit: 0, remaining: 0 },
        chatMessages: { used: 0, limit: 0, remaining: 0 },
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
