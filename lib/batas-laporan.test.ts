import { test } from "node:test";
import assert from "node:assert/strict";
import { koordinat } from "./batas-laporan.ts";

test("koordinat: kosong berdua = tanpa lokasi", () => {
  assert.equal(koordinat("", " "), null);
});

test("koordinat: koma desimal papan ketik Indonesia diterima", () => {
  assert.deepEqual(koordinat("-1,2345", "113,5"), { lat: -1.2345, lng: 113.5 });
});

test("koordinat: setengah, di luar jangkauan, dan 0,0 ditolak", () => {
  assert.ok("galat" in (koordinat("-1.2", "") ?? {}));
  assert.ok("galat" in (koordinat("91", "100") ?? {}));
  assert.ok("galat" in (koordinat("1", "181") ?? {}));
  assert.ok("galat" in (koordinat("abc", "100") ?? {}));
  assert.ok("galat" in (koordinat("0", "0") ?? {}));
});
