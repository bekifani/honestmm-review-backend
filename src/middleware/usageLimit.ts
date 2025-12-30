import { Request, Response, NextFunction } from "express";
import { SubscriptionService } from "../services/subscriptionService";

const subscriptionService = new SubscriptionService();

/**
 * Middleware to check usage limits before allowing file analysis
 */
export const checkFileAnalysisLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req.user as any)?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const usageCheck = await subscriptionService.checkUsageLimit(userId, "file_analysis");

    if (!usageCheck.allowed) {
      return res.status(403).json({
        error: "File analysis limit reached",
        message: "You have reached your monthly file analysis limit. Please upgrade your plan.",
        limit: usageCheck.limit,
        remaining: usageCheck.remaining,
      });
    }

    // Attach usage info to request for later use
    (req as any).usageInfo = usageCheck;

    next();
  } catch (error) {
    res.status(500).json({ error: "Failed to check usage limits" });
  }
};

/**
 * Middleware to check usage limits before allowing chat messages
 */
export const checkChatMessageLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req.user as any)?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const usageCheck = await subscriptionService.checkUsageLimit(userId, "chat_message");

    if (!usageCheck.allowed) {
      return res.status(403).json({
        error: "Chat message limit reached",
        message: "You have reached your monthly chat message limit. Please upgrade your plan.",
        limit: usageCheck.limit,
        remaining: usageCheck.remaining,
      });
    }

    // Attach usage info to request for later use
    (req as any).usageInfo = usageCheck;

    next();
  } catch (error) {
    res.status(500).json({ error: "Failed to check usage limits" });
  }
};

/**
 * Middleware to check if user has active subscription
 */
export const requireActiveSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req.user as any)?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const subscription = await subscriptionService.getUserSubscription(userId);

    if (!subscription || subscription.status !== "active") {
      return res.status(403).json({
        error: "No active subscription",
        message: "You need an active subscription to access this feature.",
      });
    }

    // Attach subscription to request
    (req as any).subscription = subscription;

    next();
  } catch (error) {
    res.status(500).json({ error: "Failed to check subscription" });
  }
};
