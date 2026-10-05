/**
 * Uji tulis ke basis data SUNGGUHAN (MariaDB dari migrasi), bukan tiruan.
 *
 * Insiden `image_en`: payload Prisma berisi kolom yang sudah dihapus lolos tsc
 * dan unit test, lalu Verifikasi gagal di produksi berhari-hari. Berkas ini
 * menjalankan dua jalur tulis kejadian terhadap skema nyata, jadi galat
 * validasi/constraint semacam itu gagal di CI, bukan di meja kurator.
 *
 * Jalankan: DATABASE_URL=mysql://… npm run test:db (job `test-db` di ci.yml).
 * Tidak masuk `npm test` — polanya `*.dbtest.ts`, bukan `*.test.ts`.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./prisma.ts";
import { promosiKeKejadian, simpanKejadian } from "./simpan-kejadian.ts";

const BATAL = new Error("rollback uji");

after(() => prisma.$disconnect());

test("promosiKeKejadian menulis kejadian yang sah ke skema nyata", async () => {
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      const hasil = await promosiKeKejadian(
        {
          title: "Uji promosi CI",
          description: "Deskripsi uji",
          // Lokasi kurator diisi: reverse geocode (DB geo terpisah) dilewati.
          location: "Desa Uji, Kalimantan Barat",
          media: [{ path: "fire/gambar/uji.jpg", type: "image" }],
          location_lat: -0.0263,
          location_lng: 109.3425,
          created_at: new Date("2026-10-05T00:00:00Z"),
        },
        tx,
      );
      assert.ok(hasil.ok, hasil.ok ? "" : hasil.galat);
      const baris = await tx.events.findUniqueOrThrow({ where: { id: hasil.id } });
      assert.equal(baris.location, "Desa Uji, Kalimantan Barat");
      assert.equal(Number(baris.location_lat), -0.0263);
      assert.equal(baris.image_id, "fire/gambar/uji.jpg");
      throw BATAL; // jangan tinggalkan baris di DB uji
    }),
    BATAL,
  );
});

test("promosiKeKejadian menolak laporan tanpa titik (bukan 0,0)", async () => {
  const hasil = await promosiKeKejadian({
    title: "Tanpa titik",
    description: null,
    media: [],
    location_lat: null,
    location_lng: null,
    created_at: null,
  });
  assert.equal(hasil.ok, false);
});

test("simpanKejadian menambah lalu mengubah kejadian di skema nyata", async () => {
  const data = new FormData();
  data.set("title_id", "Uji simpan CI");
  data.set("title_en", "CI save test");
  data.set("event_date", "2026-10-05");
  data.set("location", "Kubu Raya");
  data.set("location_lat", "-0.1");
  data.set("location_lng", "109.4");
  data.set("orientation", "landscape");
  data.set("status", "draft");

  const baru = await simpanKejadian(data);
  assert.ok(baru.ok, baru.ok ? "" : baru.galat);
  try {
    data.set("title_en", "CI save test (edited)");
    const ubah = await simpanKejadian(data, baru.id);
    assert.ok(ubah.ok, ubah.ok ? "" : ubah.galat);
    const baris = await prisma.events.findUniqueOrThrow({ where: { id: baru.id } });
    assert.equal(baris.title_en, "CI save test (edited)");
  } finally {
    await prisma.events.delete({ where: { id: baru.id } });
  }
});
