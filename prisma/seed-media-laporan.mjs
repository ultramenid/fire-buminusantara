// Benih LAPORAN WARGA ber-MEDIA BER-METADATA (galeri campuran) untuk pengembangan.
//
// Pendamping `seed-media.mjs` (laporan berkas tunggal) dan
// `seed-media-kejadian.mjs` (kejadian): yang ini menanam `public_reports` dengan
// galeri yang berisi FOTO ber-EXIF GPS dan/atau VIDEO ber-GPS ISO6709 sekaligus,
// plus variasi status verifikasi (pending/approved/rejected) dan pelapor
// (bernama/anonim).
//
// Koordinat laporan diisi SAMA dengan metadata medianya — meniru hasil kerja
// `simpanLaporanPublik()`: bila pelapor tidak mengisi lat/lng, server mengambil
// GPS dari berkas pertama yang membawanya (fallback EXIF).
//
// Idempoten: hanya laporan dengan `title` yang belum ada yang ditambahkan, jadi
// `npm run seed:media:laporan` aman dijalankan berulang.
//
//   npm run seed:media:laporan
//
import "dotenv/config";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const url = new URL(process.env.DATABASE_URL);
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    connectionLimit: 5,
  }),
});

// Jalur media lokal — sama dengan AKAR_MEDIA di lib/unggah.ts. Berkas di sini
// disajikan route /media dan dibaca exifr (bacaByte) untuk EXIF.
const AKAR = path.join(process.cwd(), "media");
const AWALAN = "fire/";

/** Foto JPEG ~720×540 gradien lembut + tag GPS EXIF + waktu pengambilan. */
async function fotoBerGps({ latDms, lngDms, latRef, lngRef, tanggal }) {
  return await sharp({
    create: {
      width: 720,
      height: 540,
      channels: 3,
      background: { r: 120, g: 40, b: 30 },
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="720" height="540"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#7a2f25"/><stop offset="1" stop-color="#d98a4a"/>
          </linearGradient></defs><rect width="720" height="540" fill="url(#g)"/></svg>`,
        ),
        top: 0,
        left: 0,
      },
    ])
    .withMetadata({
      exif: {
        IFD0: { Make: "Simontini", Model: "FireCam S1" },
        IFD2: { DateTimeOriginal: tanggal, CreateDate: tanggal },
        IFD3: {
          GPSLatitudeRef: latRef,
          GPSLatitude: `${latDms[0]}/1 ${latDms[1]}/1 ${Math.round(latDms[2] * 1000)}/1000`,
          GPSLongitudeRef: lngRef,
          GPSLongitude: `${lngDms[0]}/1 ${lngDms[1]}/1 ${Math.round(lngDms[2] * 1000)}/1000`,
        },
      },
    })
    .jpeg()
    .toBuffer();
}

/** Foto JPEG polos tanpa metadata GPS (hanya label pembuat). */
async function fotoTanpaGps() {
  return sharp({
    create: { width: 720, height: 540, channels: 3, background: { r: 60, g: 90, b: 120 } },
  })
    .withMetadata({
      exif: {
        IFD0: { Make: "Simontini" },
      },
    })
    .jpeg()
    .toBuffer();
}

/** Satu box MP4: `[u32 size][4cc type][payload]`. */
function box(tipe, payload) {
  const hdr = Buffer.alloc(8);
  hdr.writeUInt32BE(payload.length + 8, 0);
  hdr.write(tipe, 4, "latin1");
  return Buffer.concat([hdr, payload]);
}

/** Box `data` (version/flags 4 + locale 4 + teks). */
function dataBox(teks) {
  const s = Buffer.from(teks, "latin1");
  const payload = Buffer.alloc(8 + s.length);
  s.copy(payload, 8);
  return box("data", payload);
}

/** MP4 tiruan dengan metadata GPS ISO6709 (moov › udta › meta › ilst). */
function videoBerGps(iso6709) {
  const meta = box(
    "meta",
    Buffer.concat([Buffer.alloc(4), box("ilst", box("mdta", dataBox(iso6709)))]),
  );
  return Buffer.concat([
    box("ftyp", Buffer.from("isom", "latin1")),
    box("moov", box("udta", meta)),
  ]);
}

const sekarang = new Date();

async function main() {
  // Koordinat laporan = metadata GPS medianya, meniru fallback EXIF di
  // simpanLaporanPublik() ketika pelapor tidak mengisi lat/lng.
  const laporan = [
    {
      title: "Demo galeri: foto ber-GPS EXIF + video ISO6709 (Medan)",
      description:
        "Laporan contoh dengan galeri campuran: foto JPEG ber-EXIF GPS (diambil 15-08-2026 09:14) dan video MP4 ber-GPS ISO6709. Koordinat laporan meniru hasil fallback EXIF.",
      berkas: ["gambar", "video"],
      reporter_name: "Pelapor Demo",
      location_lat: 3.584444,
      location_lng: 98.675833,
      status: "pending",
      ket: ["Foto demo EXIF GPS", "Video demo ISO6709"],
      gpsFoto: { latRef: "S", latDms: [3, 35, 4], lngRef: "E", lngDms: [98, 40, 33], tanggal: "2026:08:15 09:14:22" },
      iso6709: "+03.5844+098.6758+000.000/",
    },
    {
      title: "Demo galeri: dua foto, hanya satu ber-GPS (Palangka Raya)",
      description:
        "Laporan contoh dengan dua foto: yang pertama ber-GPS EXIF, yang kedua polos. Server memakai GPS dari berkas PERTAMA yang membawanya.",
      berkas: ["gambar", "gambar"],
      reporter_name: null,
      location_lat: -2.2088,
      location_lng: 113.9213,
      status: "approved",
      ket: ["Foto demo EXIF GPS", "Foto demo tanpa GPS"],
      gpsFoto: { latRef: "S", latDms: [2, 12, 31.7], lngRef: "E", lngDms: [113, 55, 16.7], tanggal: "2026:08:20 14:05:00" },
      iso6709: null,
    },
    {
      title: "Demo galeri: video saja ber-GPS ISO6709 (ditolak)",
      description:
        "Laporan contoh berupa video MP4 ber-GPS ISO6709 saja, tanpa foto. Statusnya ditolak supaya variasi status terlihat di daftar verifikasi.",
      berkas: ["video"],
      reporter_name: null,
      location_lat: -6.2,
      location_lng: 106.8167,
      status: "rejected",
      ket: ["Video demo ISO6709 Jakarta"],
      gpsFoto: null,
      iso6709: "-06.2000+106.8167+000.000/",
    },
  ];

  // Berkas media hanya dibuat & ditulis bila ada laporan baru yang akan masuk —
  // supaya `npm run seed:media:laporan` berulang tidak menimbun berkas yatim di media/.
  let ditambah = 0;
  const akanDibuat = [];
  for (const l of laporan) {
    const ada = await prisma.public_reports.findFirst({ where: { title: l.title }, select: { id: true } });
    if (ada) continue;
    akanDibuat.push(l);
  }

  if (akanDibuat.length > 0) {
    await Promise.all([
      mkdir(path.join(AKAR, "gambar"), { recursive: true }),
      mkdir(path.join(AKAR, "video"), { recursive: true }),
    ]);

    for (const l of akanDibuat) {
      const media = [];
      for (let i = 0; i < l.berkas.length; i += 1) {
        const jenis = l.berkas[i];
        let isi;
        let berkas;
        if (jenis === "gambar") {
          isi = l.gpsFoto && i === 0
            ? await fotoBerGps(l.gpsFoto)
            : await fotoTanpaGps();
          berkas = `gambar/${randomUUID()}.jpg`;
        } else {
          isi = l.iso6709 ? videoBerGps(l.iso6709) : videoBerGps("+00.0000+00.0000+000.000/");
          berkas = `video/${randomUUID()}.mp4`;
        }
        await writeFile(path.join(AKAR, berkas), isi);
        media.push({
          path: AWALAN + berkas,
          type: jenis === "video" ? "video" : "image",
          keterangan: l.ket[i] ?? null,
        });
      }

      await prisma.public_reports.create({
        data: {
          title: l.title,
          description: l.description,
          media,
          reporter_name: l.reporter_name,
          location_lat: l.location_lat,
          location_lng: l.location_lng,
          status: l.status,
          ip_address: "127.0.0.1",
          created_at: sekarang,
          updated_at: sekarang,
        },
      });
      ditambah += 1;
    }
  }

  console.log(
    `Benih media laporan selesai: ${ditambah} laporan ditambahkan` +
      `${ditambah === 0 ? " (semua sudah ada, tidak ada yatim baru)" : "; berkas di media/"}`,
  );
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

