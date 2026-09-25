import { test } from "node:test";
import assert from "node:assert/strict";

test("ambilLaporan membaca EXIF langsung dari DB JSON tanpa memanggil exifDariPath", async (t) => {
  const global_ = globalThis as unknown as { prisma?: unknown };
  const originalPrisma = global_.prisma;

  global_.prisma = {
    public_reports: {
      findUnique: async () => ({
        id: BigInt(999),
        title: "Kebakaran Hutan Demo",
        description: "Terjadi titik api di koordinat terlampir",
        media: [
          {
            path: "fire/gambar/foto1.jpg",
            type: "image",
            keterangan: "Foto bukti kamera",
            exif: {
              lat: -3.584444,
              lng: 98.675833,
              waktu: "15 Agustus 2026 09.14",
            },
          },
        ],
        reporter_name: "Warga",
        location_lat: -3.584444,
        location_lng: 98.675833,
        status: "pending",
        ip_address: "127.0.0.1",
        created_at: new Date("2026-08-15T09:20:00Z"),
        updated_at: new Date("2026-08-15T09:20:00Z"),
        reviewed_at: null,
        peninjau: null,
      }),
    },
  };

  t.after(() => {
    global_.prisma = originalPrisma;
  });

  const { ambilLaporan, ambilLaporanPublik } = await import("./laporan-publik.ts");

  const laporan = await ambilLaporan(999);
  assert.ok(laporan, "Laporan harus ditemukan");
  assert.equal(laporan.id, 999);
  assert.equal(laporan.lampiran.length, 1);

  const lampiran = laporan.lampiran[0];
  assert.equal(lampiran.url, "/media/gambar/foto1.jpg");
  assert.ok(lampiran.exif, "Metadata EXIF harus terpasang dari DB JSON");
  assert.equal(lampiran.exif?.lat, -3.584444);
  assert.equal(lampiran.exif?.lng, 98.675833);
  assert.equal(lampiran.exif?.waktu, "15 Agustus 2026 09.14");

  // Pastikan ambilLaporan alias identik dengan ambilLaporanPublik
  assert.equal(ambilLaporan, ambilLaporanPublik);
});

test("simpanLaporanPublik mengekstrak EXIF dan menyimpannya ke DB JSON saat unggah", async (t) => {
  const sharp = (await import("sharp")).default;
  const global_ = globalThis as unknown as { prisma?: unknown };
  const originalPrisma = global_.prisma;

  type LaporanDbRecord = {
    title?: string;
    location_lat?: number | null;
    location_lng?: number | null;
    media: Array<{
      path?: string;
      exif?: { lat: number; lng: number; waktu?: string };
    }>;
  };

  let laporanTersimpan: LaporanDbRecord | null = null;

  global_.prisma = {
    public_reports: {
      create: async ({ data }: { data: LaporanDbRecord }) => {
        laporanTersimpan = data;
        return { id: BigInt(1001), ...data };
      },
    },
  };

  t.after(async () => {
    global_.prisma = originalPrisma;
    if (laporanTersimpan?.media?.[0]?.path) {
      const fs = await import("node:fs/promises");
      const pathMod = await import("node:path");
      const localRel = laporanTersimpan.media[0].path.replace(/^fire\//, "media/");
      const localAbs = pathMod.join(process.cwd(), localRel);
      await fs.unlink(localAbs).catch(() => {});
    }
  });

  const jpeg = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 100, g: 150, b: 200 } },
  })
    .withMetadata({
      exif: {
        IFD0: { Make: "Simontini", Model: "FireCam S1" },
        IFD2: { DateTimeOriginal: "2026:08:15 09:14:22", CreateDate: "2026:08:15 09:14:22" },
        IFD3: {
          GPSLatitudeRef: "S",
          GPSLatitude: "3/1 35/1 4/1",
          GPSLongitudeRef: "E",
          GPSLongitude: "98/1 40/1 33/1",
        },
      },
    })
    .jpeg()
    .toBuffer();

  const file = new File([jpeg], "lapor.jpg", { type: "image/jpeg" });

  const formData = new FormData();
  formData.append("judul", "Kebakaran Terdeteksi Kamera Warga");
  formData.append("deskripsi", "Titik api terlihat di dekat perbatasan hutan");
  formData.append("berkas", file);

  const { simpanLaporanPublik } = await import("./laporan-publik.ts");
  const hasil = await simpanLaporanPublik(formData, "127.0.0.1");

  assert.equal(hasil.ok, true);
  const tersimpan = laporanTersimpan as unknown as LaporanDbRecord;
  assert.ok(tersimpan, "Laporan harus tersimpan ke DB");
  assert.equal(tersimpan.title, "Kebakaran Terdeteksi Kamera Warga");

  // Fallback titik laporan dari EXIF karena lat/lng tidak diisi di form
  assert.ok(tersimpan.location_lat != null);
  assert.ok(Math.abs(tersimpan.location_lat - -3.584444) < 0.001);
  assert.ok(tersimpan.location_lng != null);
  assert.ok(Math.abs(tersimpan.location_lng - 98.675833) < 0.001);

  // Metadata EXIF tersimpan dalam kolom media JSON
  assert.equal(tersimpan.media.length, 1);
  const mediaItem = tersimpan.media[0];
  assert.ok(mediaItem.exif, "Item media harus memiliki data exif di JSON");
  assert.ok(Math.abs(mediaItem.exif.lat - -3.584444) < 0.001);
  assert.ok(Math.abs(mediaItem.exif.lng - 98.675833) < 0.001);
  assert.ok(mediaItem.exif.waktu && mediaItem.exif.waktu.includes("Agustus 2026"));
});
