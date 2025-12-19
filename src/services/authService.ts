import { RefreshToken, User } from "@prisma/client";
import prisma from "../config/prisma";
import { generateAuthTokens, verifyToken } from "./tokenService";

/**
 * Get user by email
 * @param {string} email
 * @returns {Promise<User | null>}
 */
export const getUserByEmail = async (email: string): Promise<User | null> => {
    return prisma.user.findUnique({ where: { email } });
};

/**
 * Get user by id
 * @param {string} id
 * @returns {Promise<User | null>}
 */
export const getUserById = async (id: number): Promise<User | null> => {
    return prisma.user.findUnique({ where: { id } });
};

/**
 * Refresh auth tokens
 * @param {string} refreshToken
 * @returns {Promise<{ user: User; accessToken: string; refreshToken: string } | null>}
 */
export const refreshAuth = async (
  refreshToken: string
): Promise<{ user: User; accessToken: string; refreshToken: string } | null> => {
  // verify refresh token
  const refreshTokenDoc = await verifyToken(refreshToken);
  if (!refreshTokenDoc) {
    return null;
  }
  const user = await getUserById(refreshTokenDoc.userId);
  if (!user) {
    return null;
  }

  // rotate refresh token: invalidate the old token and persist a new one
  try {
    await prisma.refreshToken.delete({ where: { id: refreshTokenDoc.id } });
  } catch {}
  const tokens = await generateAuthTokens(
    user.id,
    user.name,
    user.email,
    user.role
  );

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.refreshToken.upsert({
    where: { userId: user.id },
    update: { token: tokens.refreshToken, expiresAt },
    create: { userId: user.id, token: tokens.refreshToken, expiresAt },
  });

  return { user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
};


/**
 * Logout
 * @param {string} refreshToken
 * @returns {Promise<RefreshToken | null>}
 */
// logout
export const logout = async (refreshToken: string): Promise<RefreshToken | null> => {
  const refreshTokenDoc = await prisma.refreshToken.findFirst({
    where: {
      token: refreshToken,
    },
  });
  if (refreshTokenDoc) {
    return await prisma.refreshToken.delete({ where: { id: refreshTokenDoc.id } });
  }
  return null;
};