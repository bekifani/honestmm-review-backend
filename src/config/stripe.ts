import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not defined in environment variables");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Subscription plan configurations
export const SUBSCRIPTION_PLANS = {
  basic: {
    name: "Basic",
    maxFileAnalyses: 10,
    maxChatMessages: 50,
    features: [
      "10 file analyses per month",
      "50 chat messages per month",
      "Basic AI analysis",
      "Email support",
    ],
  },
  pro: {
    name: "Pro",
    maxFileAnalyses: 50,
    maxChatMessages: 300,
    features: [
      "50 file analyses per month",
      "300 chat messages per month",
      "Advanced AI analysis",
      "Priority email support",
      "Export reports",
    ],
  },
  premium: {
    name: "Premium",
    maxFileAnalyses: -1, // Unlimited
    maxChatMessages: -1, // Unlimited
    features: [
      "Unlimited file analyses",
      "Unlimited chat messages",
      "Premium AI analysis",
      "24/7 priority support",
      "Export reports",
      "Custom integrations",
      "Dedicated account manager",
    ],
  },
};

export type PlanType = keyof typeof SUBSCRIPTION_PLANS;
