import crypto from "crypto";
import bcrypt from "bcryptjs";
import prisma from "../config/prisma";
import { Request, Response } from "express";
import { sendResetPasswordEmail } from "../services/emailService";
import { getUserByEmail, logout, refreshAuth } from "../services/authService";
import { sendVerificationEmail as sendEmailVerify } from "../services/emailService";
import { generateAuthTokens } from "../services/tokenService";

/**
 * @swagger
 * /api/auth/send-verification-email:
 *   post:
 *     summary: Send email verification OTP to user's email
 *     description: Generates a 6-digit OTP and sends it to the specified user's email for email verification.
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: aynuman19@gmail.com
 *     responses:
 *       204:
 *         description: Verification OTP sent successfully
 *       404:
 *         description: No users found with this email
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: No users found with this email
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */

// Register new user
export const register = async (req: Request, res: Response) => {
  try {
    const role = (req.query as any).role;
    const { name, email, password } = req.body as {
      name: string;
      email: string;
      password: string;
    };

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, Email and password are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({
        status: "error",
        message: "New password must be at least 8 characters long",
      });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        name,
        email,
        role: (role as string) ?? "USER",
        password: hashedPassword,
      },
    });

    return res.sendStatus(201);
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// Login with email and password
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email: string; password: string };

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    if (!user.password) {
      return res
        .status(400)
        .json({ message: "This email is associated with OAuth. Please use social login!" });
    }

    const isPasswordValid = await bcrypt.compare(password.toString(), user.password.toString());
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const tokens = await generateAuthTokens(user.id, user.name, user.email || null, user.role);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.refreshToken.upsert({
      where: { userId: user.id },
      update: { token: tokens.refreshToken, expiresAt },
      create: { userId: user.id, token: tokens.refreshToken, expiresAt },
    });

    res.cookie("jwt", tokens.refreshToken, {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "development" ? "lax" : "none",
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000,
    });

    const { password: _userPassword, ...userData } = user as any;
    return res.json({ status: "success", token: tokens.accessToken, user: userData });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
};

export const sendVerificationEmail = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    const otp = crypto.randomInt(100000, 999999).toString();

    let user = await getUserByEmail(email);
    if (!user) {
      // Create user if not exists
      user = await prisma.user.create({
        data: {
          email,
          name: email.split('@')[0],
          role: 'USER',
          isEmailVerified: false
        }
      });
    }
    const otpData = await prisma.otp.findUnique({ where: { userId: user.id } });
    if (otpData) {
      await prisma.otp.delete({ where: { id: otpData.id } });
    }
    await prisma.otp.create({
      data: {
        otp,
        userId: user.id,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    await sendEmailVerify(email, otp);
    return res.sendStatus(204);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * @swagger
 * /api/auth/verify-email:
 *   post:
 *     summary: Verify user's email using OTP
 *     description: Verifies the provided OTP for the user's email during email verification.
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: aynuman19@gmail.com
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       204:
 *         description: Email verified successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: User or OTP not found
 *       410:
 *         description: OTP expired
 *       500:
 *         description: Server error
 */

export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required" });
    }
    let user = await getUserByEmail(email);
    if (!user) {
      return res.status(404).json({ error: 'No users found with this email' });
    }
    const otpData = await prisma.otp.findFirst({
      where: { userId: user.id, otp },
    });
    if (!otpData) {
      return res.status(404).json({ error: "No OTP found for this user" });
    }
    if (otpData.expiresAt < new Date()) {
      await prisma.otp.delete({ where: { id: otpData.id } });
      return res.status(410).json({ error: "OTP expired" });
    }
    user = await prisma.user.update({
      where: { id: user.id },
      data: { isEmailVerified: true },
    });
    await prisma.otp.delete({ where: { id: otpData.id } });

    // Generate Tokens for Login
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

    const { password: userPassword, ...userData } = user as any;
    return res.json({
      success: true,
      token: tokens.accessToken,
      user: userData
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
};


/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Send password reset OTP to user's email
 *     description: Generates a 6-digit OTP and sends it to the specified user's email for password reset.
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: aynuman19@gmail.com
 *     responses:
 *       204:
 *         description: OTP sent successfully
 *       404:
 *         description: No users found with this email
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: No users found with this email
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const otp = crypto.randomInt(100000, 999999).toString();

    const user = await getUserByEmail(email);
    if (!user) {
      return res.status(404).json({ error: 'No users found with this email' });
    }
    const otpData = await prisma.otp.findUnique({ where: { userId: user.id } });
    if (otpData) {
      await prisma.otp.delete({ where: { id: otpData.id } });
    }
    await prisma.otp.create({
      data: {
        otp,
        userId: user.id,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    await sendResetPasswordEmail(email, otp);
    res.status(204).send();
  } catch (error) {
    console.log({ error });
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * @swagger
 * /api/auth/verify-otp:
 *   post:
 *     summary: Verify password reset OTP
 *     description: Verifies the provided OTP for the given user's email.
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: aynuman19@gmail.com
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       204:
 *         description: OTP verified successfully
 *       404:
 *         description: No users or OTP found, or OTP expired
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: No OTP found for this user
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */
export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;
    const user = await getUserByEmail(email);
    if (!user) {
      return res.status(404).json({ error: 'No users found with this email' });
    }

    const otpData = await prisma.otp.findFirst({ where: { userId: user.id, otp } });
    if (!otpData) {
      return res.status(404).json({ error: 'No OTP found for this user' });
    }

    if (otpData.expiresAt < new Date()) {
      await prisma.otp.delete({ where: { id: otpData.id } });
      return res.status(404).json({ error: 'OTP has expired' });
    }
    await prisma.otp.delete({ where: { id: otpData.id } });
    res.status(204).send();
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset user's password using OTP
 *     description: Resets the password for a user if a valid OTP is provided.
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: aynuman19@gmail.com
 *               otp:
 *                 type: string
 *                 example: "123456"
 *               newPassword:
 *                 type: string
 *                 example: "newpassword123"
 *     responses:
 *       204:
 *         description: Password reset successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: User or OTP not found
 *       500:
 *         description: Server error
 */
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, newPassword } = req.body;
    // const { email, otp, newPassword } = req.body;
    // if (!email || !otp || !newPassword) {
    //     return res.status(400).json({ error: "Email, OTP and new password are required" });
    // }
    if (newPassword.length < 8) {
      return res.status(400).json({
        status: 'error',
        message: 'New password must be at least 8 characters long'
      });
    }

    const user = await getUserByEmail(email);
    if (!user) {
      return res.status(404).json({ error: 'No users found with this email' });
    }

    // const otpData = await prisma.otp.findFirst({ where: { userId: user.id, otp } });
    // if (!otpData) {
    //     return res.status(404).json({ error: 'No OTP found for this user' });
    // }

    // if (otpData.expiresAt < new Date()) {
    //     return res.status(404).json({ error: 'OTP has expired' });
    // }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedNewPassword },
    });

    // await prisma.otp.delete({ where: { id: otpData.id } });

    res.status(204).send();
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Server error" });
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  try {
    const cookies = req.cookies;
    if (!cookies?.jwt) return res.status(401).send();
    const refreshToken = cookies.jwt;

    const result = await refreshAuth(refreshToken);
    if (!result) {
      // Clear invalid/expired refresh token cookie and return 401
      res.clearCookie("jwt", {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === "development" ? "lax" : "none",
        secure: process.env.NODE_ENV === "production",
      });
      return res.status(401).send();
    }
    const { user, accessToken, refreshToken: newRefreshToken } = result;

    const { password: userPassword, ...userData } = user;
    res.cookie("jwt", newRefreshToken, {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "development" ? "lax" : "none",
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.send({ user: userData, token: accessToken });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Server error" });
  }
};

export const handleLogout = async (req: Request, res: Response) => {
  // On client, also delete the accessToken
  const cookies = req.cookies;
  if (!cookies?.jwt) return res.status(204).send();
  const refreshToken = cookies.jwt;

  await logout(refreshToken);
  res.clearCookie("jwt", {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === "development" ? "lax" : "none",
    secure: process.env.NODE_ENV === "production",
  });
  res.status(204).send();
};

/**
 * @swagger
 * /api/auth/update-password:
 *   put:
 *     summary: Update user password
 *     description: Updates the authenticated user's password
 *     tags:
 *       - Auth
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 description: Current password
 *               newPassword:
 *                 type: string
 *                 description: New password (minimum 6 characters)
 *                 minLength: 6
 *             required:
 *               - currentPassword
 *               - newPassword
 *     responses:
 *       200:
 *         description: Password updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Password updated successfully
 *       400:
 *         description: Invalid input or current password incorrect
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export const updatePassword = async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized",
      });
    }

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        status: "error",
        message: "Current password and new password are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        status: "error",
        message: "New password must be at least 8 characters long",
      });
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.password) {
      return res.status(404).json({
        status: "error",
        message: "User not found or password not set",
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password
    );
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        status: "error",
        message: "Current password is incorrect",
      });
    }

    // Hash new password
    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password in database
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    res.status(200).json({
      status: "success",
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("Update password error:", error);
    res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
};
