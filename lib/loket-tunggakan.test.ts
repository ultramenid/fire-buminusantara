import test from "node:test";
import assert from "node:assert/strict";
import { umumkanTunggakan, berlanggananTunggakan } from "./loket-tunggakan.ts";

test("loket-tunggakan mengumumkan dan menerima sinyal via EventTarget", () => {
  let dipanggil = 0;
  const lepas = berlanggananTunggakan(() => {
    dipanggil++;
  });

  umumkanTunggakan();
  assert.equal(dipanggil, 1);

  umumkanTunggakan();
  assert.equal(dipanggil, 2);

  lepas();
  umumkanTunggakan();
  assert.equal(dipanggil, 2, "tidak lagi menerima sinyal setelah lepas langganan");
});
