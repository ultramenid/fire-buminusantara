// Benih laporan warga ber-MEDIA BER-METADATA untuk pengembangan.
//
// Tujuan: memverifikasi fitur EXIF GPS & waktu foto (tampil di halaman detail
// laporan admin) dan parser GPS video ISO6709, tanpa harus mengunggah berkas
// nyata dari kamera. Berkasnya dibuat di sini (sharp untuk foto,
// susunan box MP4 untuk video), ditulis ke `media/` lokal, lalu direferensikan
// dari `public_reports.media`.
//
// Idempoten: hanya laporan dengan `title` yang belum ada yang ditambahkan,
// jadi `npm run seed:media` aman dijalankan berulang.
//
//   npm run seed:media
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
  const laporan = [
    {
      title: "Demo: foto ber-GPS EXIF (Medan)",
      description:
        "Laporan contoh dengan foto yang membawa metadata GPS + waktu pengambilan. Tanpa koordinat manual — GPS dibaca otomatis dari EXIF foto.",
      reporter_name: "Pelapor Demo",
      location_lat: null,
      location_lng: null,
      status: "pending",
    },
    {
      title: "Demo: foto tanpa metadata GPS",
      description:
        "Laporan contoh dengan foto biasa (tanpa GPS EXIF) dan koordinat diisi manual. Dipakai untuk membandingkan tampilan EXIF (tidak ada) vs yang ber-GPS.",
      reporter_name: null,
      location_lat: -6.914744,
      location_lng: 107.60981,
      status: "pending",
    },
    {
      title: "Demo: video ber-GPS ISO6709 (MP4)",
      description:
        "Laporan contoh dengan video MP4 yang membawa koordinat GPS dalam metadata ISO6709 (jalur iPhone/QuickTime).",
      reporter_name: "Pelapor Demo Video",
      location_lat: null,
      location_lng: null,
      status: "pending",
    },
    {
      title: "Demo: foto + video ber-GPS sekaligus",
      description:
        "Laporan contoh yang menggabungkan foto ber-GPS EXIF DAN video ber-GPS ISO6709 dalam satu kiriman — untuk memastikan kedua jenis metadata tampil berdampingan di detail laporan.",
      reporter_name: "Pelapor Demo Gabungan",
      location_lat: null,
      location_lng: null,
      status: "pending",
    },
  ];

  // Berkas media hanya dibuat & ditulis bila ada laporan baru yang akan masuk —
  // supaya `npm run seed:media` berulang tidak menimbun berkas yatim di media/.
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

    // Foto & video yang dipakai beberapa laporan. Medan 3°35'04"S 98°40'33"E;
    // Pekanbaru 0°30'36"S 101°26'52"E — pasangan foto+video memakai titik ini.
    const fotoMedan = await fotoBerGps({
      latRef: "S", latDms: [3, 35, 4],
      lngRef: "E", lngDms: [98, 40, 33],
      tanggal: "2026:08:15 09:14:22",
    });
    const fotoPekanbaru = await fotoBerGps({
      latRef: "S", latDms: [0, 30, 36],
      lngRef: "E", lngDms: [101, 26, 52],
      tanggal: "2026:08:20 14:02:45",
    });
    const fotoPolos = await fotoTanpaGps();
    const videoMedan = videoBerGps("+03.5844+098.6758+000.000/");
    const videoPekanbaru = videoBerGps("-00.5100+101.4478+000.000/");

    // Tiap laporan baru diberi berkas sendiri dengan citra/identitas unik.
    // Nilainya adalah larik, karena satu laporan boleh memuat beberapa media.
    const byTitle = {
      "Demo: foto ber-GPS EXIF (Medan)": [
        { berkas: `gambar/${randomUUID()}.jpg`, isi: fotoMedan, type: "image",
          keterangan: "Foto demo EXIF GPS" },
      ],
      "Demo: foto tanpa metadata GPS": [
        { berkas: `gambar/${randomUUID()}.jpg`, isi: fotoPolos, type: "image",
          keterangan: "Foto demo tanpa metadata" },
      ],
      "Demo: video ber-GPS ISO6709 (MP4)": [
        { berkas: `video/${randomUUID()}.mp4`, isi: videoMedan, type: "video",
          keterangan: "Video demo ISO6709" },
      ],
      "Demo: foto + video ber-GPS sekaligus": [
        { berkas: `gambar/${randomUUID()}.jpg`, isi: fotoPekanbaru, type: "image",
          keterangan: "Foto demo EXIF GPS (Pekanbaru)" },
        { berkas: `video/${randomUUID()}.mp4`, isi: videoPekanbaru, type: "video",
          keterangan: "Video demo ISO6709 (Pekanbaru)" },
      ],
    };
    const simpan = akanDibuat.flatMap((l) => byTitle[l.title]);
    await Promise.all(
      simpan.map((s) => writeFile(path.join(AKAR, s.berkas), s.isi)),
    );

    for (const l of akanDibuat) {
      const media = byTitle[l.title].map((s) => ({
        path: AWALAN + s.berkas,
        type: s.type,
        keterangan: s.keterangan,
      }));
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
    `Benih media selesai: ${ditambah} laporan ditambahkan${ditambah === 0 ? " (semua sudah ada, tidak ada yatim baru)" : ".; berkas di media/"} `,
  );
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
