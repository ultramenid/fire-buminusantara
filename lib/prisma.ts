import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

/**
 * Klien Prisma tunggal dengan Lazy Proxy Pattern.
 *
 * `new URL(process.env.DATABASE_URL)` tidak dievaluasi saat modul dimuat.
 * Evaluasi dan inisialisasi koneksi MariaDB hanya terjadi ketika metode
 * atau properti Prisma diakses untuk kueri.
 *
 * Jika DATABASE_URL tidak disetel, error informatif dilempar saat kueri,
 * bukan saat import sehingga tidak menggagalkan proses build/impor.
 */

let _client: PrismaClient | null = null;

function buat(): PrismaClient {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error(
      "DATABASE_URL environment variable is not configured. Database operations cannot be executed.",
    );
  }

  let url: URL;
  try {
    url = new URL(dbUrl);
  } catch {
    throw new Error(
      `DATABASE_URL is invalid: "${dbUrl}". Database operations cannot be executed.`,
    );
  }

  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ""),
      connectionLimit: 15,
    }),
  });
}

function getClient(): PrismaClient {
  const global_ = globalThis as unknown as { prisma?: PrismaClient };
  if (global_.prisma) return global_.prisma;
  if (_client) return _client;

  const client = buat();
  _client = client;
  if (process.env.NODE_ENV !== "production") {
    global_.prisma = client;
  }
  return client;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (prop === "then") return undefined;
    if (prop === Symbol.toStringTag) return "PrismaClient";
    if (prop === "toJSON") return () => "[PrismaClient]";
    if (prop === Symbol.for("nodejs.util.inspect.custom")) {
      return () => "[PrismaClient Proxy]";
    }
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});
