import bcrypt from "bcryptjs";
import prisma from "../src/config/prisma";

async function main() {
  const password = await bcrypt.hash("password123", 10);
  const users = [
    {
      name: "Alice",
      email: "admin@example.com",
      isEmailVerified: true,
      password,
      role: "ADMIN",
    },
    // {
    //   name: "Bob",
    //   email: "bob@example.com",
    //   isEmailVerified: true,
    //   password,
    // },
    // {
    //   name: "Charlie",
    //   email: "charlie@example.com",
    //   isEmailVerified: true,
    //   password,
    // },
  ];

  for (const user of users) {
    const userCreated = await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: user,
    });
    console.log(`Created user: ${user.name}`);
  }

  console.log("Seed complete: dummy users created.");
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
