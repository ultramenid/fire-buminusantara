import { test } from "node:test";
import assert from "node:assert/strict";
import { periksaNik, rapikanNik, uraiNik } from "./nik.ts";

/** 32 01 01 120190 0001: Jawa Barat, lahir 12-01-90, laki-laki. */
const NIK_SAH = "3201011201900001";
const nikDengan = (i: number, dua: string) => NIK_SAH.slice(0, i) + dua + NIK_SAH.slice(i + 2);

test("periksaNik: NIK berbentuk wajar lolos — laki-laki dan perempuan (tanggal + 40)", () => {
  assert.equal(periksaNik(NIK_SAH), null);
  assert.equal(periksaNik(nikDengan(6, "52")), null, "perempuan, tanggal 12");
  assert.equal(periksaNik(nikDengan(6, "71")), null, "perempuan, tanggal 31 Januari");
  assert.equal(periksaNik(nikDengan(6, "01")), null);
});

test("periksaNik: bukan tepat 16 angka → 'NIK harus 16 angka.'", () => {
  for (const nik of ["", "123", NIK_SAH.slice(0, 15), `${NIK_SAH}0`, "3201a11201900001", "3201 011201900001", "３２０１０１１２０１９０００１"]) {
    assert.equal(periksaNik(nik), "NIK harus 16 angka.", JSON.stringify(nik));
  }
});

test("periksaNik: kode provinsi 11–96 (termasuk pemekaran Papua 95/96)", () => {
  for (const p of ["11", "32", "94", "95", "96"]) assert.equal(periksaNik(nikDengan(0, p)), null, p);
  for (const p of ["00", "10", "97", "99"]) assert.equal(periksaNik(nikDengan(0, p)), "NIK tidak valid.", p);
});

test("periksaNik: tanggal lahir harus tanggal sungguhan", () => {
  const tidak = (ddmm: string, yy = "90") => periksaNik(NIK_SAH.slice(0, 6) + ddmm + yy + NIK_SAH.slice(12));
  for (const ddmm of ["0001", "3201", "4001", "7201", "1200", "1213", "3002", "3104", "7104"]) {
    assert.equal(tidak(ddmm), "NIK tidak valid.", ddmm);
  }
  assert.equal(tidak("3101"), null, "31 Januari");
  assert.equal(tidak("3004"), null, "30 April");
  assert.equal(tidak("2902", "01"), "NIK tidak valid.", "29 Feb bukan kabisat");
  assert.equal(tidak("2902", "04"), null, "29 Feb 2004 / 1904");
  assert.equal(tidak("2902", "00"), null, "29 Feb 2000 (abad tidak tertulis)");
  assert.equal(tidak("6902", "04"), null, "29 Feb, perempuan");
});

test("periksaNik: kabupaten, kecamatan, dan nomor urut 0 tidak ada", () => {
  assert.equal(periksaNik(nikDengan(2, "00")), "NIK tidak valid.");
  assert.equal(periksaNik(nikDengan(4, "00")), "NIK tidak valid.");
  assert.equal(periksaNik(`${NIK_SAH.slice(0, 12)}0000`), "NIK tidak valid.");
});

test("rapikanNik: spasi pemisah dibuang, selain itu apa adanya", () => {
  assert.equal(rapikanNik(" 3201 0112 0190 0001 "), NIK_SAH);
  assert.equal(rapikanNik(null), "");
  assert.equal(rapikanNik("3201-0112"), "3201-0112");
});

test("uraiNik: tanggal lahir dan jenis kelamin untuk peninjau", () => {
  assert.deepEqual(uraiNik(NIK_SAH), { lahir: "12-01-90", perempuan: false });
  assert.deepEqual(uraiNik(nikDengan(6, "45")), { lahir: "05-01-90", perempuan: true });
});
