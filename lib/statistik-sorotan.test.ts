import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Stub Next.js Cache Components internal helpers for running outside Next.js runtime
const require = createRequire(import.meta.url);
try {
  const nextCache = require("next/cache.js");
  nextCache.cacheTag = () => {};
  nextCache.cacheLife = () => {};
} catch {
  // Abaikan bila di lingkungan Next
}

import { BAWAN_STATISTIK } from "./statistik.ts";

const {
  ambilSorotan,
  simpanSorotan,
  JUMLAH_KARTU,
} = await import("./statistik-sorotan.ts");

function buatFormDataSah(): FormData {
  const fd = new FormData();
  for (let i = 0; i < JUMLAH_KARTU; i++) {
    fd.set(`nilai_id_${i}`, `Angka ID ${i + 1}`);
    fd.set(`keterangan_id_${i}`, `Keterangan kartu ID ke-${i + 1}`);
    fd.set(`nilai_en_${i}`, `Figure EN ${i + 1}`);
    fd.set(`keterangan_en_${i}`, `Description card EN #${i + 1}`);
  }
  return fd;
}

test("JUMLAH_KARTU harus tepat 4 kartu", () => {
  assert.equal(JUMLAH_KARTU, 4);
  assert.equal(BAWAN_STATISTIK.id.length, 4);
  assert.equal(BAWAN_STATISTIK.en.length, 4);
});

test("ambilSorotan: fallback bawaan jika DB kosong atau null", async () => {
  const dbRow: { kartu: unknown } | null = null;
  (globalThis as unknown as { prisma: unknown }).prisma = {
    sorotan_statistik: {
      findFirst: async () => dbRow,
    },
  };

  const res = await ambilSorotan();
  assert.equal(res.id.length, 4);
  assert.equal(res.en.length, 4);
  assert.deepEqual(res.id, BAWAN_STATISTIK.id);
  assert.deepEqual(res.en, BAWAN_STATISTIK.en);
});

test("ambilSorotan: tak pernah melempar jika kueri DB gagal", async () => {
  (globalThis as unknown as { prisma: unknown }).prisma = {
    sorotan_statistik: {
      findFirst: async () => {
        throw new Error("Koneksi MariaDB terputus / tabel belum dibuat");
      },
    },
  };

  const res = await ambilSorotan();
  assert.equal(res.id.length, 4);
  assert.equal(res.en.length, 4);
  assert.deepEqual(res.id, BAWAN_STATISTIK.id);
  assert.deepEqual(res.en, BAWAN_STATISTIK.en);
});

test("ambilSorotan: fallback parsial jika salah satu bahasa rusak", async () => {
  const dbRow = {
    kartu: {
      id: [
        { nilai: "10 ha", keterangan: "terbakar" },
        { nilai: "20 ha", keterangan: "terbakar" },
        { nilai: "30 ha", keterangan: "terbakar" },
        { nilai: "40 ha", keterangan: "terbakar" },
      ],
      // en sengaja rusak (hanya 2 item)
      en: [
        { nilai: "10 ha", keterangan: "burned" },
        { nilai: "20 ha", keterangan: "burned" },
      ],
    },
  };

  (globalThis as unknown as { prisma: unknown }).prisma = {
    sorotan_statistik: {
      findFirst: async () => dbRow,
    },
  };

  const res = await ambilSorotan();
  // id membaca dari data DB
  assert.equal(res.id[0].nilai, "10 ha");
  assert.equal(res.id[3].nilai, "40 ha");
  // en jatuh ke bawaan karena jumlah item tidak lengkap
  assert.deepEqual(res.en, BAWAN_STATISTIK.en);
});

test("simpanSorotan: validasi field kosong atau hanya spasi", async () => {
  const fd = buatFormDataSah();
  fd.set("nilai_id_0", "   ");

  const resNilai = await simpanSorotan(fd);
  assert.equal(resNilai.ok, false);
  if (!resNilai.ok) {
    assert.equal(resNilai.bidang, "nilai_id_0");
    assert.match(resNilai.galat, /Kartu 1 \(ID\): angka wajib diisi/);
  }

  const fdKet = buatFormDataSah();
  fdKet.set("keterangan_en_2", "");

  const resKet = await simpanSorotan(fdKet);
  assert.equal(resKet.ok, false);
  if (!resKet.ok) {
    assert.equal(resKet.bidang, "keterangan_en_2");
    assert.match(resKet.galat, /Kartu 3 \(EN\): keterangan wajib diisi/);
  }
});

test("simpanSorotan: validasi batas panjang karakter", async () => {
  // Nilai maksimal 40 karakter
  const fdNilaiPanjang = buatFormDataSah();
  fdNilaiPanjang.set("nilai_id_1", "A".repeat(41));

  const resNilai = await simpanSorotan(fdNilaiPanjang);
  assert.equal(resNilai.ok, false);
  if (!resNilai.ok) {
    assert.equal(resNilai.bidang, "nilai_id_1");
    assert.match(resNilai.galat, /maks\. 40 karakter/);
  }

  // Keterangan maksimal 300 karakter
  const fdKetPanjang = buatFormDataSah();
  fdKetPanjang.set("keterangan_en_3", "B".repeat(301));

  const resKet = await simpanSorotan(fdKetPanjang);
  assert.equal(resKet.ok, false);
  if (!resKet.ok) {
    assert.equal(resKet.bidang, "keterangan_en_3");
    assert.match(resKet.galat, /maks\. 300 karakter/);
  }
});

test("simpanSorotan: simpan baru (create) dan perbarui (update) dwibahasa", async () => {
  type BarisDB = { id: bigint; kartu: unknown; updated_at?: Date };
  let barisDB: BarisDB | null = null;
  let createDipanggil = false;
  let updateDipanggil = false;

  (globalThis as unknown as { prisma: unknown }).prisma = {
    sorotan_statistik: {
      findFirst: async () => barisDB,
      create: async ({ data }: { data: { kartu: unknown; updated_at: Date } }) => {
        createDipanggil = true;
        barisDB = { id: BigInt(1), kartu: data.kartu, updated_at: data.updated_at };
        return barisDB;
      },
      update: async ({ data }: { data: { kartu: unknown; updated_at: Date } }) => {
        updateDipanggil = true;
        barisDB = { id: BigInt(1), kartu: data.kartu, updated_at: data.updated_at };
        return barisDB;
      },
    },
  };

  // 1. Simpan pertama kali (create)
  const fdAwal = buatFormDataSah();
  const resSimpan1 = await simpanSorotan(fdAwal);
  assert.equal(resSimpan1.ok, true);
  assert.equal(createDipanggil, true);
  assert.equal(updateDipanggil, false);

  // Baca kembali via ambilSorotan
  const resBaca1 = await ambilSorotan();
  assert.equal(resBaca1.id[0].nilai, "Angka ID 1");
  assert.equal(resBaca1.en[0].nilai, "Figure EN 1");
  assert.equal(resBaca1.id[3].keterangan, "Keterangan kartu ID ke-4");
  assert.equal(resBaca1.en[3].keterangan, "Description card EN #4");

  // 2. Simpan pembaruan (update)
  const fdUbah = buatFormDataSah();
  fdUbah.set("nilai_id_0", "500K ha baru");
  fdUbah.set("nilai_en_0", "500K ha updated");
  const resSimpan2 = await simpanSorotan(fdUbah);
  assert.equal(resSimpan2.ok, true);
  assert.equal(updateDipanggil, true);

  const resBaca2 = await ambilSorotan();
  assert.equal(resBaca2.id[0].nilai, "500K ha baru");
  assert.equal(resBaca2.en[0].nilai, "500K ha updated");
});
