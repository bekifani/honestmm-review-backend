import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not defined in environment variables");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-12-15.clover",
  typescript: true,
});

// Subscription plan configurations
export const SUBSCRIPTION_PLANS = {
  basic: {
    name: "Basic",
    priceId: process.env.BASIC_PRICE_ID || "price_1Sg49YLpI5TdrxfFaAbDZHrk",
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
    priceId: process.env.PRO_PRICE_ID || "price_1Sg4K5LpI5TdrxfFDQscX99Q",
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
    priceId: process.env.PREMIUM_PRICE_ID || "price_1Sg4KpLpI5TdrxfF1kBiqCGK",
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
