import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

/**
 * Shared CLI Prisma Client helper for scripts and seeds.
 *
 * @param {number} [connectionLimit=5]
 * @returns {PrismaClient}
 */
export function getCliPrisma(connectionLimit = 5) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL environment variable is missing or empty.");
  }

  const url = new URL(dbUrl);
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ""),
      connectionLimit,
    }),
  });
}
