import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "./prisma.ts";
import { putuskanVerifikasi, sapuKedaluwarsa, statusVerifikasi, UMUR_PENGAJUAN_MS } from "./verifikasi-ktp.ts";

after(() => prisma.$disconnect());

/**
 * Alur keputusan terhadap skema SUNGGUHAN (CI: MariaDB hasil migrate deploy):
 * kueri Prisma sah, indeks unik users.ktp_nik_hash bekerja, transaksi yang
 * gagal benar-benar digulung balik, dan FK cascade menghapus pengajuan.
 * Barisnya dibuat & dihapus sendiri — putuskanVerifikasi memakai klien global,
 * jadi tidak bisa dibungkus transaksi rollback seperti dbtest lain.
 */
test("dbtest: setujui, NIK ganda ditolak + rollback, tolak, kedaluwarsa, cascade", async (t) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "ktp-dbuji-"));
  const lamaDir = process.env.KTP_DIR;
  process.env.KTP_DIR = folder;
  const kini = new Date();
  const ujung = `${Date.now()}`;
  const buat = (nama: string) =>
    prisma.users.create({
      data: { name: nama, email: `ktp_${nama}_${ujung}@pasopati.test`, role: "commenter", created_at: kini, updated_at: kini },
      select: { id: true },
    });
  const a = await buat("a");
  const b = await buat("b");
  t.after(async () => {
    await prisma.users.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    if (lamaDir === undefined) delete process.env.KTP_DIR;
    else process.env.KTP_DIR = lamaDir;
    await rm(folder, { recursive: true, force: true });
  });

  let n = 0;
  const foto = async () => {
    const nama = `${(++n).toString(16).padStart(32, "0")}.jpg`;
    await writeFile(path.join(folder, nama), "foto");
    return nama;
  };
  const sidik = "f".repeat(64);
  const ajukan = async (userId: bigint, created_at = kini) =>
    prisma.mobile_ktp_verifications.create({
      data: { user_id: userId, nik: "3201011201900001", nik_hash: sidik, ktp_path: await foto(), created_at },
      select: { id: true },
    });

  const va = await ajukan(a.id);
  const vb = await ajukan(b.id);
  await prisma.mobile_ktp_verifications.update({
    where: { id: va.id },
    data: { ocr_result: "cocok", ocr_nik: "3201011201900001", ocr_score: 0.97 },
  });
  assert.equal((await statusVerifikasi(a.id, kini)).status, "menunggu");

  // Setujui A: tanda di akun, NIK & path kosong, fotonya hilang.
  assert.deepEqual(await putuskanVerifikasi(va.id, { setuju: true, metode: "petugas", peninjauId: null }, kini), { ok: true });
  const akunA = await prisma.users.findUniqueOrThrow({ where: { id: a.id }, select: { ktp_verified_at: true, ktp_nik_hash: true } });
  assert.ok(akunA.ktp_verified_at);
  assert.equal(akunA.ktp_nik_hash, sidik);
  const barisA = await prisma.mobile_ktp_verifications.findUniqueOrThrow({ where: { id: va.id } });
  assert.deepEqual([barisA.status, barisA.method, barisA.nik, barisA.ktp_path], ["disetujui", "petugas", null, null]);
  assert.deepEqual([barisA.ocr_result, barisA.ocr_nik, barisA.ocr_score], ["cocok", null, 0.97], "NIK bacaan OCR ikut dihapus, hasilnya tetap");
  assert.equal((await statusVerifikasi(a.id, kini)).status, "disetujui");

  // B dengan NIK yang sama: gagal, dan transaksinya digulung balik — masih menunggu, foto utuh.
  const gagal = await putuskanVerifikasi(vb.id, { setuju: true, metode: "petugas", peninjauId: null }, kini);
  assert.equal(gagal.ok, false);
  const barisB = await prisma.mobile_ktp_verifications.findUniqueOrThrow({ where: { id: vb.id } });
  assert.equal(barisB.status, "menunggu");
  assert.ok(barisB.nik && barisB.ktp_path);
  assert.equal((await readdir(folder)).length, 1);

  // Indeks unik menahan dua akun dengan sidik NIK yang sama walau cek aplikasi terlewati.
  await assert.rejects(
    prisma.users.update({ where: { id: b.id }, data: { ktp_nik_hash: sidik } }),
    (e: unknown) => (e as { code?: string })?.code === "P2002",
  );

  // Tolak B: alasan untuk warga, foto & NIK hilang.
  assert.deepEqual(await putuskanVerifikasi(vb.id, { setuju: false, alasan: "NIK dipakai akun lain.", peninjauId: a.id }, kini), { ok: true });
  const statusB = await statusVerifikasi(b.id, kini);
  assert.equal(statusB.status, "ditolak");
  assert.equal(statusB.alasan, "NIK dipakai akun lain.");
  assert.deepEqual(await readdir(folder), []);

  // Pengajuan baru B yang 30 hari tak diputuskan: disapu, status kembali "belum".
  // Semenit lebih: TIMESTAMP(0) bisa membulatkan milidetik ke atas.
  const basi = await ajukan(b.id, new Date(kini.getTime() - UMUR_PENGAJUAN_MS - 60_000));
  assert.equal(await sapuKedaluwarsa(kini, b.id), 1);
  assert.equal(await prisma.mobile_ktp_verifications.count({ where: { id: basi.id } }), 0);
  assert.deepEqual(await readdir(folder), []);

  // Akun dihapus → pengajuannya ikut (FK cascade).
  await prisma.users.delete({ where: { id: a.id } });
  assert.equal(await prisma.mobile_ktp_verifications.count({ where: { user_id: a.id } }), 0);
});
