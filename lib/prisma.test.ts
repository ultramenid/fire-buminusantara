import test from "node:test";
import assert from "node:assert/strict";

test("lib/prisma: Lazy Proxy behaves gracefully without DATABASE_URL", async () => {
  const envOri = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const { prisma } = await import("./prisma.ts");
    assert.equal(typeof prisma, "object");
    assert.throws(
      () => {
        // Accessing model triggers getClient()
        void prisma.events;
      },
      /DATABASE_URL environment variable is not configured/,
    );
  } finally {
    if (envOri !== undefined) process.env.DATABASE_URL = envOri;
  }
});
