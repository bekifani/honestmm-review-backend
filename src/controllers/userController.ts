import { Request, Response } from "express";
import prisma from "../config/prisma";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

// GET /api/users - list users (exclude admins by default)
export const getUsers = async (req: Request, res: Response) => {
  try {
    const page = Math.max(parseInt((req.query.page as string) || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt((req.query.limit as string) || "10", 10), 1), 100);
    const skip = (page - 1) * limit;

    // By default exclude admins; allow includeAdmins=true to include
    const includeAdmins = String(req.query.includeAdmins || "false").toLowerCase() === "true";
    const roleFilter = includeAdmins ? {} : { role: { not: "ADMIN" } };

    // Optional search query: q
    const qRaw = String((req.query.q as string) || "").trim();
    const idSearch = parseInt(qRaw, 10);
    const searchFilter = qRaw
      ? {
        OR: [
          { name: { contains: qRaw, mode: "insensitive" as const } },
          { email: { contains: qRaw, mode: "insensitive" as const } },
          ...(isNaN(idSearch) ? [] : [{ id: idSearch }]),
        ],
      }
      : {};

    const where = { ...roleFilter, ...searchFilter } as any;

    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          telegramId: true,
          googleId: true,
          role: true,
          createdAt: true,
          isEmailVerified: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      status: "success",
      data: users,
      meta: { page, limit, totalPages: Math.max(Math.ceil(totalCount / limit), 1), totalCount },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

// GET /api/users/:id - get single user (safe fields)
export const getUserById = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (!id) return res.status(400).json({ error: "Invalid user id" });

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        telegramId: true,
        googleId: true,
        role: true,
        createdAt: true,
        isEmailVerified: true,
      },
    });

    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ status: "success", data: user });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
};

/**
 * CREATE - POST /api/users
 * Create a new user
 */
export const createUser = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role = "USER" } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long" });
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: "Email already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    res.status(201).json({
      status: "success",
      message: "User created successfully",
      data: user,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to create user" });
  }
};

/**
 * UPDATE - PUT /api/users/:id
 * Update user details
 */
export const updateUser = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (!id) return res.status(400).json({ error: "Invalid user id" });

    const { name, email, role } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if email is being changed and if it already exists
    if (email && email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({ where: { email } });
      if (emailExists) {
        return res.status(409).json({ error: "Email already exists" });
      }
    }

    // Build update data
    const updateData: any = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (role) updateData.role = role;

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    res.json({
      status: "success",
      message: "User updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to update user" });
  }
};

/**
 * DELETE - DELETE /api/users/:id
 * Delete a user and associated data
 */
export const deleteUser = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (!id) return res.status(400).json({ error: "Invalid user id" });

    // Check if user exists
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Delete user (cascade delete will handle related records)
    await prisma.user.delete({
      where: { id },
    });

    res.json({
      status: "success",
      message: "User deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete user" });
  }
};

