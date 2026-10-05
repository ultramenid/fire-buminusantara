import { test } from "node:test";
import assert from "node:assert/strict";
import { lewatBatas } from "./batas-laju.ts";

test("lewatBatas: tanpa Redis, kiriman ke-(batas+1) ditolak per kunci", async () => {
  for (let i = 0; i < 3; i++) assert.equal(await lewatBatas("uji:a", 3, 60), false);
  assert.equal(await lewatBatas("uji:a", 3, 60), true);
  assert.equal(await lewatBatas("uji:b", 3, 60), false, "kunci lain punya jatah sendiri");
});

test("lewatBatas: jatah di-reset setelah jendela waktu kedaluwarsa", async () => {
  assert.equal(await lewatBatas("uji:exp", 1, 1), false);
  assert.equal(await lewatBatas("uji:exp", 1, 1), true);
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(await lewatBatas("uji:exp", 1, 1), false, "setelah jendela 1s lewat, jatah baru dibuka kembali");
});
