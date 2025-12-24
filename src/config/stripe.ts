import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not defined in environment variables");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Subscription plan configurations
// Subscription plan configurations
export const SUBSCRIPTION_PLANS = {
  tier1: {
    name: "QuickScan",
    priceId: process.env.TIER1_PRICE_ID || "price_quickscan_placeholder",
    mode: "payment" as const,
    maxFileAnalyses: 3,
    maxChatMessages: 10,
    features: [
      "Manual Contract analysis",
      "Risk assessment report",
      "Red flag identification",
      "Comparison vs. industry standards",
      "Written recommendations & advice",
      "48-hour turnaround",
    ],
  },
  tier2: {
    name: "Professional Review",
    priceId: process.env.TIER2_PRICE_ID || "price_professional_placeholder",
    mode: "payment" as const,
    maxFileAnalyses: 10,
    maxChatMessages: 20,
    features: [
      "Everything in QuickScan",
      "3 manual reviews by experts",
      "Consultation call",
      "Negotiation talking points",
      "Term-by-term recommendations",
      "Intro to +60 vetted market makers",
    ],
  },
  tier3: {
    name: "Strategic Package",
    priceId: process.env.TIER3_PRICE_ID || "price_strategic_placeholder",
    mode: "payment" as const,
    maxFileAnalyses: -1,
    maxChatMessages: -1,
    features: [
      "Everything in Professional Review",
      "Bidding process (3-5 MMs)",
      "Custom liquidity strategy",
      "Token unlock schedule optimization",
      "Market maker selection criteria",
      "Performance KPI framework",
      "Fee benchmarking report",
      "Priority Slack/Telegram support",
    ],
  },
  tier4: {
    name: "Advisory Retainer",
    priceId: process.env.TIER4_PRICE_ID || "price_advisory_placeholder",
    mode: "subscription" as const,
    maxFileAnalyses: -1, // Unlimited
    maxChatMessages: -1, // Unlimited
    features: [
      "Dedicated advisors",
      "Unlimited contract reviews",
      "Monthly liquidity performance reviews",
      "Quarterly performance audits",
      "Intro to full MM ecosystem",
      "Weekly check-in calls",
      "Custom trading analytics dashboard",
      "Post-TGE market oversight",
    ],
  },
};

export type PlanType = keyof typeof SUBSCRIPTION_PLANS;
