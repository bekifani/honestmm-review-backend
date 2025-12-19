import prisma from "../config/prisma";
import passport from "passport";
// import { requireAuth } from "../middleware/auth";
import { loginLimiter } from "../middleware/rateLimiter";
import { generateAuthTokens } from "../services/tokenService";
import express from "express";
import { validate, isSignatureInvalidError } from "@telegram-apps/init-data-node";
import { forgotPassword, handleLogout, refreshToken, resetPassword, sendVerificationEmail, verifyEmail, verifyOtp, updatePassword, register, login } from "../controllers/authController";
// import websocketService from "../services/websocketService";

const router = express.Router();

// limit repeated failed requests to all endpoints
if (process.env.NODE_ENV === 'production') {
  router.use('/', loginLimiter);
}

router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })
);
router.get(
  "/google/callback",
  passport.authenticate("google", {
    scope: ["profile", "email"],

    failureRedirect: "/login",
    session: false,
  }),
  async (req, res) => {
    const user = req.user as {
      id: number;
      email?: string | null;
      name: string;
      role: string;
    };

    if (!user) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Use unified token service, set refresh cookie, and redirect with access token
    const tokens = await generateAuthTokens(user.id, user.name, user.email || null, user.role);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.refreshToken.upsert({
      where: { userId: user.id },
      update: { token: tokens.refreshToken, expiresAt },
      create: { userId: user.id, token: tokens.refreshToken, expiresAt },
    });
    res.cookie('jwt', tokens.refreshToken, {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'development' ? 'lax' : 'none',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
    });

    const userData = user;
    const origins = (process.env.FRONTEND_ORIGINS || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    const clientUrl = origins[0];
    if (clientUrl) {
      res.redirect(
        `${clientUrl}/?token=${tokens.accessToken}&user=${encodeURIComponent(
          JSON.stringify(userData)
        )}`
      );
    } else {
      res.json({
        success: true,
        token: tokens.accessToken,
        user: userData,
      });
    }
  }
);

router.get("/twitter", passport.authenticate("twitter-login", {
  scope: ["tweet.read", "users.read", "offline.access"],
  session: false
}));

router.get(
  "/twitter/callback",
  passport.authenticate("twitter-login", {
    failureRedirect: "/login",
    session: false,
  }),
  async (req, res) => {
    const user = req.user as {
      id: number;
      email?: string | null;
      name: string;
      role: string;
    };

    if (!user) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const tokens = await generateAuthTokens(user.id, user.name, user.email || null, user.role);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.refreshToken.upsert({
      where: { userId: user.id },
      update: { token: tokens.refreshToken, expiresAt },
      create: { userId: user.id, token: tokens.refreshToken, expiresAt },
    });
    res.cookie('jwt', tokens.refreshToken, {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'development' ? 'lax' : 'none',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
    });

    const userData = user;
    const origins = (process.env.FRONTEND_ORIGINS || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    const clientUrl = origins[0];
    if (clientUrl) {
      res.redirect(
        `${clientUrl}/?token=${tokens.accessToken}&user=${encodeURIComponent(
          JSON.stringify(userData)
        )}`
      );
    } else {
      res.json({
        success: true,
        token: tokens.accessToken,
        user: userData,
      });
    }
  }
);

router.get('/telegram',
  async (req, res, next) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    // Always reconstruct rawInitData from all query params (Mini App and Widget)
    // ✅ use the exact query string for validation
    const rawInitData = req.url.split('?')[1] || '';

    // Always require hash for both cases
    if (!('hash' in req.query)) {
      return res.status(400).json({ error: 'Missing hash' });
    }

    // Additional security: Check for suspicious patterns
    if (rawInitData.length > 10000) { // Prevent extremely long payloads
      return res.status(400).json({ error: 'Invalid request size' });
    }

    // Validate bot token exists
    if (!botToken) {
      console.error('TELEGRAM_BOT_TOKEN not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    // Mini App: has both user and hash
    if ('user' in req.query) {
      try {
        validate(rawInitData, botToken as string);
        // Extract user info from rawInitData (query string)
        const tgUser: any = { ...req.query };
        if (tgUser.user && typeof tgUser.user === 'string') {
          try {
            Object.assign(tgUser, JSON.parse(tgUser.user));
            delete tgUser.user;
          } catch { }
        }

        // 🔒 SECURITY: Never trust role from frontend - always default to USER
        const role = "USER"; // Force all Telegram users to USER role
        // Admin roles must be assigned manually in database by existing admins

        // ✅ Check DB - first by telegramId, then by username if it's a placeholder
        let dbUser = await prisma.user.findUnique({
          where: { telegramId: tgUser.id.toString() },
        });

        const photoUrl = (tgUser.photo_url as string) || (tgUser.photo as string) || null;
        const username = tgUser.username || null;
        let wasNewUser = !dbUser;

        // Note: No need for separate claim logic since we use claimPendingTransfersForUser below
        // The claim function properly handles merging placeholder users into existing real users

        if (!dbUser) {
          // Create completely new user (no placeholder existed)
          dbUser = await prisma.user.create({
            data: {
              telegramId: tgUser.id.toString(),
              name:
                [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") ||
                tgUser.username ||
                "Unnamed User",
              username: username,
              email: tgUser.email || null,
              isEmailVerified: tgUser.email ? true : false,
              role,
            },
          });

        } else if (dbUser.telegramId) {
          // Update existing real user's username and avatar on login
          dbUser = await prisma.user.update({
            where: { id: dbUser.id },
            data: {
              username: username,
              name: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") ||
                tgUser.username ||
                dbUser.name, // Keep existing name if no new name available
            },
          });
        }

        // ✅ Attach to req.user (like Passport would)
        (req as any).user = dbUser;

        // ✅ Issue JWT
        // Issue access + refresh tokens using the unified token service
        const tokens = await generateAuthTokens(dbUser.id, dbUser.name, dbUser.email || null, dbUser.role);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await prisma.refreshToken.upsert({
          where: { userId: dbUser.id },
          update: { token: tokens.refreshToken, expiresAt },
          create: { userId: dbUser.id, token: tokens.refreshToken, expiresAt },
        });
        res.cookie('jwt', tokens.refreshToken, {
          httpOnly: true,
          sameSite: process.env.NODE_ENV === 'development' ? 'lax' : 'none',
          secure: process.env.NODE_ENV === 'production',
          maxAge: 24 * 60 * 60 * 1000,
        });

        const { password: userPassword, ...userData } = dbUser;
        // const avatar = (tgUser.photo_url as string) || (tgUser.photo as string) || null;
        // const username = (tgUser.username as string) || null;
        return res.json({
          success: true,
          token: tokens.accessToken,
          user: { ...userData, avatar: photoUrl, username },
          wasNewUser,
          message: "Authentication successful",
        });
      } catch (e) {
        if (isSignatureInvalidError(e)) {
        }
        console.log({ e });
        return res.status(401).json({ error: 'Invalid initData or signature' });
      }
    }
    else {
      next();
    }
  },
  passport.authenticate('telegram-login', {
    session: false,
    // failureRedirect: '/login'
  }),
  async (req, res) => {
    const user = await prisma.user.findUnique({ where: { telegramId: (req.user as any)?.telegramId } });

    if (!user) {
      console.log({ error: "User not authenticated" });
      return res.status(401).json({ error: "User not authenticated" });
    }

    const tokens = await generateAuthTokens(user.id, user.name, user.email || null, user.role);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.refreshToken.upsert({
      where: { userId: user.id },
      update: { token: tokens.refreshToken, expiresAt },
      create: { userId: user.id, token: tokens.refreshToken, expiresAt },
    });
    res.cookie('jwt', tokens.refreshToken, {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'development' ? 'lax' : 'none',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
    });

    const { password: userPassword, ...userData } = user;
    const avatar = (req.user as any)?.photo_url || (req.user as any)?.photo || null;
    const username = (req.user as any)?.username || null;
    res.json({
      success: true,
      token: tokens.accessToken,
      user: { ...userData, avatar, username },
      wasNewUser: false,
      message: 'Authentication successful'
    });
  }
);


// router.post("/register", register);
// router.post("/login", login);

// router.post("/forgot-password", forgotPassword);
// router.post("/verify-otp", verifyOtp); // Original pw reset verify
// router.post('/reset-password', resetPassword);
// router.post('/send-verification-email', sendVerificationEmail);
// router.post('/verify-email', verifyEmail);
// router.put('/update-password', requireAuth, updatePassword);

// Unified OTP Login/Signup Routes
router.post('/email', sendVerificationEmail);
router.post('/verify-otp', verifyEmail); // Mapping verify-otp to verifyEmail as requested
router.get('/refresh-token', refreshToken);
router.get("/logout", handleLogout);

export default router;
