// Benih KEJADIAN ber-MEDIA BER-METADATA untuk pengembangan.
//
// Pendamping `seed-media.mjs` (yang menanam laporan warga): yang ini menanam
// `events` — tabel yang tampil di korsel beranda dan peta — dengan galeri yang
// berisi FOTO ber-EXIF GPS + VIDEO ber-GPS ISO6709 sekaligus, untuk menguji
// tampilan galeri dua jenis media dan poster video di halaman publik & CMS.
//
// Berkasnya dibuat di sini (sharp untuk foto, susunan box MP4 untuk
// video), ditulis ke `media/` lokal, lalu direferensikan dari `events.image_id`,
// `events.video`, dan `events.media`.
//
// Idempoten: hanya kejadian dengan `slug` yang belum ada yang ditambahkan, jadi
// `npm run seed:media:kejadian` aman dijalankan berulang.
//
//   npm run seed:media:kejadian
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
  const gambar = await sharp({
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

  return gambar;
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

/** MP4 tiruan tanpa GPS — pembanding di galeri (teks metanya lain). */
function videoPolos() {
  const meta = box(
    "meta",
    Buffer.concat([Buffer.alloc(4), box("ilst", box("mdta", dataBox("demo")))]),
  );
  return Buffer.concat([
    box("ftyp", Buffer.from("isom", "latin1")),
    box("moov", box("udta", meta)),
  ]);
}

const sekarang = new Date();

async function main() {
  // Koordinat kejadian mengikuti metadata medianya supaya konsisten:
  // 3°35'04"S 98°40'33"E = Medan; -6,914744 107,60981 = Bandung.
  const kejadian = [
    {
      slug: "demo-galeri-foto-gps-video-iso6709-medan",
      title_id: "Demo: galeri foto ber-GPS EXIF + video ISO6709 (Medan)",
      title_en: "Demo: gallery of GPS-EXIF photo + ISO6709 video (Medan)",
      description_id:
        "Kejadian contoh dengan galeri campuran: foto JPEG ber-EXIF GPS (diambil 15-08-2026 09:14) dan video MP4 ber-GPS ISO6709. Koordinat kejadian disamakan dengan metadata medianya.",
      description_en:
        "Sample event with a mixed gallery: a JPEG photo with EXIF GPS (taken 2026-08-15 09:14) and an MP4 video with ISO6709 GPS. The event coordinates match the media metadata.",
      event_date: new Date("2026-08-15"),
      location: "Medan, Sumatera Utara",
      location_lat: 3.584444,
      location_lng: 98.675833,
      orientation: "landscape",
    },
    {
      slug: "demo-galeri-media-tanpa-gps-bandung",
      title_id: "Demo: galeri foto & video tanpa metadata GPS (Bandung)",
      title_en: "Demo: gallery of photo & video without GPS metadata (Bandung)",
      description_id:
        "Kejadian contoh dengan foto dan video yang TIDAK membawa GPS — pembanding untuk memastikan halaman detail tetap rapi ketika metadata tidak ada.",
      description_en:
        "Sample event with a photo and video that carry NO GPS — a counterpart to verify the detail page stays tidy when metadata is absent.",
      event_date: new Date("2026-08-22"),
      location: "Bandung, Jawa Barat",
      location_lat: -6.914744,
      location_lng: 107.60981,
      orientation: "horizontal",
    },
  ];

  // Berkas media hanya dibuat & ditulis bila ada kejadian baru yang akan masuk —
  // supaya `npm run seed:media:kejadian` berulang tidak menimbun berkas yatim di media/.
  let ditambah = 0;
  const akanDibuat = [];
  for (const k of kejadian) {
    const ada = await prisma.events.findFirst({ where: { slug: k.slug }, select: { id: true } });
    if (ada) continue;
    akanDibuat.push(k);
  }

  if (akanDibuat.length > 0) {
    await Promise.all([
      mkdir(path.join(AKAR, "gambar"), { recursive: true }),
      mkdir(path.join(AKAR, "video"), { recursive: true }),
    ]);

    // Foto Medan: 3°35'04"S 98°40'33"E, diambil 15-08-2026 09:14 (sama dengan kejadian).
    const fotoGps = await fotoBerGps({
      latRef: "S", latDms: [3, 35, 4],
      lngRef: "E", lngDms: [98, 40, 33],
      tanggal: "2026:08:15 09:14:22",
    });
    const fotoPolos = await fotoTanpaGps();
    const videoGps = videoBerGps("+03.5844+098.6758+000.000/");
    const videoBiasa = videoPolos();

    // Tiap kejadian baru diberi berkas sendiri dengan identitas unik.
    // `image_id` = poster utama, `video` = video utama, `media` = galeri lengkap.
    const bySlug = {
      "demo-galeri-foto-gps-video-iso6709-medan": {
        poster: `gambar/${randomUUID()}.jpg`,
        klip: `video/${randomUUID()}.mp4`,
        isi: { poster: fotoGps, klip: videoGps },
        ketFoto: "Foto demo EXIF GPS",
        ketVideo: "Video demo ISO6709",
      },
      "demo-galeri-media-tanpa-gps-bandung": {
        poster: `gambar/${randomUUID()}.jpg`,
        klip: `video/${randomUUID()}.mp4`,
        isi: { poster: fotoPolos, klip: videoBiasa },
        ketFoto: "Foto demo tanpa GPS",
        ketVideo: "Video demo tanpa GPS",
      },
    };

    const simpan = [];
    for (const k of akanDibuat) {
      const s = bySlug[k.slug];
      simpan.push({ berkas: s.poster, isi: s.isi.poster });
      simpan.push({ berkas: s.klip, isi: s.isi.klip });
    }
    await Promise.all(simpan.map((s) => writeFile(path.join(AKAR, s.berkas), s.isi)));

    for (const k of akanDibuat) {
      const s = bySlug[k.slug];
      const media = [
        { path: AWALAN + s.poster, type: "image", keterangan: s.ketFoto },
        { path: AWALAN + s.klip, type: "video", keterangan: s.ketVideo },
      ];
      await prisma.events.create({
        data: {
          title_id: k.title_id,
          title_en: k.title_en,
          slug: k.slug,
          description_id: k.description_id,
          description_en: k.description_en,
          event_date: k.event_date,
          location: k.location,
          location_lat: k.location_lat,
          location_lng: k.location_lng,
          orientation: k.orientation,
          image_id: AWALAN + s.poster,
          video: AWALAN + s.klip,
          media,
          created_at: sekarang,
          updated_at: sekarang,
        },
      });
      ditambah += 1;
    }
  }

  console.log(
    `Benih media kejadian selesai: ${ditambah} kejadian ditambahkan` +
      `${ditambah === 0 ? " (semua sudah ada, tidak ada yatim baru)" : "; berkas di media/"}`,
  );
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());


