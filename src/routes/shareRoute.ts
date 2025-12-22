import express from "express";
import { requireAuth } from "../middleware/auth";
import { createShareLink, getSharedContent } from "../controllers/shareController";

const router = express.Router();

// Protected: Create a share link (user must be logged in and own the file)
router.post("/create", requireAuth, createShareLink);

// Public: View shared content (no authentication required)
router.get("/:token", getSharedContent);

export default router;
