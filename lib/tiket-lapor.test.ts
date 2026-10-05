import { test } from "node:test";
import assert from "node:assert/strict";
import { buatTiket, pakaiTiket } from "./tiket-lapor.ts";

process.env.SESSION_SECRET = "uji-saja";

test("tiket: sah sekali, ditolak saat dipakai ulang", async () => {
  const t = buatTiket();
  assert.equal(await pakaiTiket(t), true);
  assert.equal(await pakaiTiket(t), false);
});

test("tiket: kedaluwarsa, diubah, atau rusak ditolak", async () => {
  assert.equal(await pakaiTiket(buatTiket(Date.now() - 31 * 60_000)), false);
  const [habis, nonce, sidik] = buatTiket().split(".");
  assert.equal(await pakaiTiket(`${Number(habis) + 1e9}.${nonce}.${sidik}`), false);
  assert.equal(await pakaiTiket("bukan.tiket"), false);
  assert.equal(await pakaiTiket(null), false);
});
