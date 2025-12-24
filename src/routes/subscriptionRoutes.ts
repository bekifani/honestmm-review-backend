import express from "express";
import {
  getPlans,
  createCheckoutSession,
  getCurrentSubscription,
  cancelSubscription,
  createBillingPortalSession,
  handleWebhook,
  getUsageStats,
  verifyCheckoutSession,
} from "../controllers/subscriptionController";
import { requireAuth } from "../middleware/auth";

const router = express.Router();

// Public routes
router.get("/plans", getPlans);

// Webhook route (must be public)
router.post("/webhook", handleWebhook);

// Protected routes (require authentication)
router.post("/checkout", requireAuth, createCheckoutSession);
router.post("/verify", requireAuth, verifyCheckoutSession);
router.get("/current", requireAuth, getCurrentSubscription);
router.post("/cancel", requireAuth, cancelSubscription);
router.post("/billing-portal", requireAuth, createBillingPortalSession);
router.get("/usage", requireAuth, getUsageStats);

export default router;
