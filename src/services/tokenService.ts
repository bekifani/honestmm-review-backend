import jwt, { JwtPayload } from 'jsonwebtoken';
import prisma from '../config/prisma';
import { RefreshToken } from '@prisma/client';

interface RefreshTokenPayload extends JwtPayload {
    userInfo: {
        id: number;
        name: string;
        email: string | null;
        role: string;
    };
}

const isRefreshTokenPayload = (payload: string | JwtPayload): payload is RefreshTokenPayload => {
    return (
        typeof payload !== 'string' &&
        typeof (payload as any).userInfo?.id === 'number'
    );
};

/**
 * Verify token and return token doc (or return null if it is not valid)
 * @param {string} token
 * @returns {Promise<RefreshToken | null>}
 */
export const verifyToken = async (token: string): Promise<RefreshToken | null> => {
  try {
    const payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET as string);

    if (!isRefreshTokenPayload(payload)) {
      return null;
    }

    const tokenDoc = await prisma.refreshToken.findFirst({ where: { token, userId: payload.userInfo.id } });
    if (!tokenDoc) {
      return null;
    }
    return tokenDoc;
  } catch (err) {
    // Any verification error (expired, invalid, malformed) should be treated as unauthorized
    return null;
  }
};

export const generateAuthTokens = async (userId: number, name: string, email: string | null, role: string) => {
    const accessToken = jwt.sign(
        { userInfo: { id: userId, name, email, role } },
        process.env.ACCESS_TOKEN_SECRET as string,
        { expiresIn: "1h" }
    );
    const refreshToken = jwt.sign(
        { userInfo: { id: userId, name, email, role } },
        process.env.REFRESH_TOKEN_SECRET as string,
        { expiresIn: "3d" }
    );
    return { accessToken, refreshToken };
};