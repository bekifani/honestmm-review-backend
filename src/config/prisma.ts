import { PrismaClient } from "@prisma/client";

// Keep a global prisma instance in dev to avoid exhausting DB connections
const globalForPrisma = global as unknown as { prisma: PrismaClient };

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ["query", "error", "warn"], // optional logs
  });


// Reuse the prisma instance in development
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
