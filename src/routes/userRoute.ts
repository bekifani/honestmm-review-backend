import express from "express";
import { 
  getUsers, 
  getUserById,
  createUser,
  updateUser,
  deleteUser
} from "../controllers/userController";
import { requireAuth } from "../middleware/auth";

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User CRUD operations and admin endpoints
 */

/**
 * @swagger
 * /users:
 *   get:
 *     summary: List users (paginated)
 *     description: Returns a paginated list of users. Requires admin.
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number (default 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Page size (default 10)
 *     responses:
 *       200:
 *         description: List of users
 *   post:
 *     summary: Create a new user
 *     description: Create a new user with email and password. Requires admin.
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               role: { type: string, enum: [USER, ADMIN], default: USER }
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Email already exists
 */

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Get user by id
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: User details
 *       404:
 *         description: User not found
 *   put:
 *     summary: Update user details
 *     description: Update user information. Requires admin.
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               avatar: { type: string }
 *               role: { type: string, enum: [USER, ADMIN] }
 *     responses:
 *       200:
 *         description: User updated successfully
 *       404:
 *         description: User not found
 *       409:
 *         description: Email already exists
 *   delete:
 *     summary: Delete a user
 *     description: Delete a user and all associated data. Requires admin.
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       404:
 *         description: User not found
 */

const router = express.Router();

// READ operations
router.get("/", requireAuth, getUsers);
router.get("/:id", requireAuth, getUserById);

// CREATE operation
router.post("/", requireAuth, createUser);

// UPDATE operation
router.put("/:id", requireAuth, updateUser);

// DELETE operation
router.delete("/:id", requireAuth, deleteUser);

export default router;

