import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

interface JwtPayload {
  userInfo: {
    id: number;
    name: string;
    email: string;
    role: string;
  };
  iat: number;
  exp: number;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as any).user as { id: number; role: string } | undefined;
    if (!user || !user.role) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (user.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden: Admins only" });
    }
    next();
  } catch (e) {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing token" });
    }

    const token = authHeader.split(" ")[1];

    if (!token) return res.status(401).json({ error: "Missing token" });

    const decoded = jwt.verify(
      token,
      process.env.ACCESS_TOKEN_SECRET as string
    ) as JwtPayload;

    if (!decoded) return res.status(401).json({ error: "Invalid token" });

    const {id, name, email, role} = decoded.userInfo;

    (req as any).user = {
      id,
      name,
      email,
      role,
    };

    next();
  } catch (err) {
    console.log("Authorization error: ", err);
    return res.status(401).json({ error: "Unauthorized" });
  }
}
