import "dotenv/config";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/password";

async function main() {
  const name = process.env.ADMIN_NAME;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!name || !email || !password) {
    console.error("Set ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD in .env before running this script.");
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("ADMIN_PASSWORD must be at least 12 characters.");
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: "ADMIN", active: true, name, mustChangePassword: true },
    create: { name, email, passwordHash, role: "ADMIN", mustChangePassword: true },
  });

  console.log(`Admin user ready: ${user.email} (role: ${user.role})`);
  console.log("This password is a one-time bootstrap credential — the account is flagged");
  console.log("mustChangePassword, so the first sign-in will require setting a new one.");
  console.log("Remove ADMIN_PASSWORD from .env now that the account exists.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
