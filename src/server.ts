import dotenv from "dotenv";
dotenv.config();

import path from "path";
import cors from "cors";
import helmet from "helmet";
import express, { type Request, type Response, type NextFunction } from "express";
import passport from "passport";
import { createServer } from "http";
import compression from "compression";
import cookieParser from "cookie-parser";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

import prisma from "./config/prisma";
import swaggerOptions from "./config/swagger";
import credentials from "./middleware/credentials";
import { globalLimiter } from "./middleware/rateLimiter";
import { handleWebhook } from "./controllers/subscriptionController";
import {
  jwtStrategy,
  telegramStrategy,
  googleStrategy,
  twitterStrategy,
} from "./config/passport";
import authRoute from "./routes/authRoute";
import apiRoute from "./routes/apiRoute";
import subscriptionRoutes from "./routes/subscriptionRoutes";
import shareRoute from "./routes/shareRoute";
import contactRoute from "./routes/contactRoute";


import websocketService from "./services/websocketService";

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;

const isDev = process.env.NODE_ENV !== "production";

// Trust proxy settings - required when running behind reverse proxy (Nginx, etc.)
// This allows express-rate-limit to correctly identify users via X-Forwarded-For header
if (!isDev) {
  // Trust first proxy - common for Nginx, Cloudflare, etc.
  app.set("trust proxy", 1);
} else {
  // In development, we might still need this if testing with a proxy
  // You can set TRUST_PROXY=true in development if needed
  if (process.env.TRUST_PROXY === "true") {
    app.set("trust proxy", true);
  }
}

// set security HTTP headers
app.use(
  helmet({
    hidePoweredBy: true,
    ...(isDev && {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"], // 'unsafe-inline' is needed for swagger
          styleSrc: ["'self'", "'unsafe-inline'"], // 'unsafe-inline' is needed for swagger
          imgSrc: ["'self'", "data:"], // 'data:' is needed for swagger
          objectSrc: ["'none'"],
        },
      },
    }),
  })
);

// Stripe webhook MUST be mounted BEFORE any body parsers to preserve the raw body
app.post(
  "/api/subscription/webhook",
  express.raw({ type: "application/json" }),
  handleWebhook
);

// parse json request body
app.use(express.json());

// parse urlencoded request body
app.use(express.urlencoded({ extended: true }));

// gzip compression
app.use(compression());

// Handle options credentials check - before CORS!
// and fetch cookies credentials requirement
app.use(credentials);
const allowedOrigins = (process.env.FRONTEND_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const corsOptions = {
  origin: function (origin: any, callback: any) {
    // allow requests with no origin (like mobile apps or curl)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true, // Allow cookies
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

//middleware for cookies
app.use(cookieParser());

// Expose build-time public assets for frontend access (e.g., /public/globx_card.svg)
app.use("/public", express.static(path.join(__dirname, "public")));

// Session configuration (Required for Twitter OAuth 2.0 PKCE)
import session from "express-session";
app.use(session({
  secret: process.env.SESSION_SECRET || 'super_secret_session_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: !isDev, // Secure in production
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 1 day
  }
}));

// jwt authentication
app.use(passport.initialize());
// app.use(passport.session()); // Not strictly needed if we don't serialize users, but good for completeness if needed later
passport.use("jwt", jwtStrategy);
passport.use("telegram-login", telegramStrategy);
passport.use("google-login", googleStrategy);
passport.use("twitter-login", twitterStrategy);

// Swagger setup
const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// limit repeated failed requests to all endpoints
if (!isDev && process.env.ENABLE_RATE_LIMITING !== "false") {
  app.use("/api", globalLimiter);
}

/**
 * @swagger
 * /:
 *   get:
 *     tags: [Health Check]
 *     summary: Health check endpoint
 *     description: Returns a simple message if the backend is running
 *     responses:
 *       200:
 *         description: Backend is running
 */
app.get("/api", (req, res) => res.send("Backend is running"));

app.use("/api/auth", authRoute);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/share", shareRoute);
app.use("/api/contact", contactRoute);
app.use("/api", apiRoute);
// Serve uploads with relaxed Cross-Origin-Resource-Policy so the frontend (different origin) can embed images
app.use(
  "/api/uploads",
  helmet.crossOriginResourcePolicy({ policy: "cross-origin" }),
  express.static("uploads")
);

// Global Error Handler for JSON parsing and other body-parsing errors
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError && 'status' in err && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: "Invalid JSON payload",
      message: err.message,
    });
  }
  next(err);
});

// Initialize WebSocket service
websocketService.initialize(httpServer);

httpServer.listen(PORT, () => {
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
