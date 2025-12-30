import prisma from "./prisma";
import { Request } from "express";
import logger from "../config/logger";
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";
// @ts-ignore
import { Strategy as TelegramLoginStrategy } from 'passport-telegram-login';
import { Strategy as GoogleStrategy, type StrategyOptionsWithRequest } from "passport-google-oauth20";
import { Strategy as TwitterStrategy } from "@superfaceai/passport-twitter-oauth2";

const jwtOptions = {
  secretOrKey: process.env.ACCESS_TOKEN_SECRET as string,
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
};

const telegramOptions = {
  botToken: process.env.TELEGRAM_BOT_TOKEN as string,
  passReqToCallback: true
  // clientID: process.env.TELEGRAM_APP_ID,
  // clientSecret: process.env.TELEGRAM_APP_SECRET,
  // callbackURL: process.env.TELEGRAM_CALLBACK_URL
};

const googleOptions: StrategyOptionsWithRequest = {
  clientID: process.env.GOOGLE_CLIENT_ID as string,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
  callbackURL: process.env.GOOGLE_CALLBACK_URL as string,
  passReqToCallback: true,
};

const twitterOptions = {
  clientID: process.env.TWITTER_CLIENT_ID as string,
  clientSecret: process.env.TWITTER_CLIENT_SECRET as string,
  callbackURL: process.env.TWITTER_CALLBACK_URL as string,
  clientType: 'confidential' as const,
  passReqToCallback: true as true,
  pkce: true, // Re-enabled for security (requires session)
  state: true, // Re-enabled
};

const jwtVerify = async (payload: any, done: any) => {
  try {
    // if (payload.type !== tokenTypes.ACCESS) {
    //   throw new Error('Invalid token type');
    // }
    const user = await prisma.user.findUnique({
      where: {
        id: payload.sub,
      },
    });

    if (!user) {
      return done(null, false);
    }
    done(null, user);
  } catch (error) {
    logger.error(error);
    done(error, false);
  }
};

const telegramVerify = async (req: Request,
  user: any,
  done: any) => {
  try {
    const rawState = req.query?.state;
    let stateString: string | undefined;
    if (typeof rawState === "string") {
      stateString = rawState;
    } else if (Array.isArray(rawState) && typeof rawState[0] === "string") {
      stateString = rawState[0];
    }
    // 🔒 SECURITY: Never trust role from frontend - always default to USER
    // Admin roles must be assigned manually in database by existing admins

    let findUser = await prisma.user.findUnique({
      where: { telegramId: String(user.id) },
    });

    const username = user.username || null;
    const wasNewUser = !findUser;

    if (!findUser) {
      findUser = await prisma.user.create({
        data: {
          telegramId: String(user.id),
          name: [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "Unnamed User",
          username: username,
          email: user.emails?.[0]?.value || null,
          role: "USER", // Force all Telegram users to USER role
        },
      });

    } else {
      // Update existing user's username on login
      findUser = await prisma.user.update({
        where: { id: findUser.id },
        data: {
          username: username,
          name: [user.first_name, user.last_name].filter(Boolean).join(" ") ||
            user.username ||
            findUser.name, // Keep existing name if no new name available
        },
      });
    }

    return done(null, findUser);
  } catch (error) {
    return done(error as Error, false);
  }
};

const googleVerify = async (req: Request, accessToken: string, refreshToken: string, profile: any, done: any) => {
  try {
    const email = profile.emails?.[0]?.value;
    const name = profile.displayName || profile.name?.givenName + ' ' + profile.name?.familyName || 'Unnamed User';

    let user = await prisma.user.findUnique({
      where: { googleId: profile.id }
    });

    const wasNewUser = !user;

    if (!user) {
      // Check if user exists with same email
      const existingUser = await prisma.user.findUnique({
        where: { email: email }
      });

      if (existingUser) {
        // Link Google account to existing user
        user = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            googleId: profile.id,
            name: name,
          }
        });
      } else {
        // Create new user
        user = await prisma.user.create({
          data: {
            googleId: profile.id,
            email: email,
            name: name,
            isEmailVerified: true,
            role: "USER",
          }
        });

      }
    } else {
      // Update existing user
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: name,
        }
      });
    }

    return done(null, user);
  } catch (error) {
    return done(error, false);
  }
};

const twitterVerify = async (req: Request, accessToken: string, refreshToken: string, profile: any, done: any) => {
  try {
    const email = profile.emails?.[0]?.value; // Twitter might not return email without special permissions
    const name = profile.displayName || profile.username || 'Unnamed User';

    let user = await prisma.user.findUnique({
      where: { twitterId: profile.id }
    });

    if (!user) {
      // Check if user exists with same email (if email is available)
      if (email) {
        const existingUser = await prisma.user.findUnique({
          where: { email: email }
        });

        if (existingUser) {
          user = await prisma.user.update({
            where: { id: existingUser.id },
            data: {
              twitterId: profile.id,
              // don't overwrite name if it exists?
            }
          });
        }
      }

      if (!user) {
        // Create new user
        user = await prisma.user.create({
          data: {
            twitterId: profile.id,
            email: email || null, // Might be null
            name: name,
            isEmailVerified: !!email,
            role: "USER",
          }
        });
      }
    } else {
      // Update user info if needed
      // user = await prisma.user.update({...})
    }

    return done(null, user);
  } catch (error) {
    return done(error, false);
  }
};

export const jwtStrategy = new JwtStrategy(jwtOptions, jwtVerify);
export const telegramStrategy = new TelegramLoginStrategy(telegramOptions, telegramVerify);
export const googleStrategy = new GoogleStrategy(googleOptions, googleVerify);
export const twitterStrategy = new TwitterStrategy(twitterOptions, twitterVerify);
