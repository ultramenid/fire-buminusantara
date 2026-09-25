import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { writeFile, mkdir, unlink, stat, copyFile, readFile, mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import exifr from "exifr";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

export const AWALAN_LOKAL = "fire/";

/** Jenis yang diterima, beserta ekstensi kanoniknya. Ekstensi diambil dari SINI,
 *  bukan dari nama berkas kiriman — nama berkas dikendalikan pengunggah. */
const JENIS_MEDIA = {
  "image/jpeg": { jenis: "gambar", ext: "jpg" },
  "image/png": { jenis: "gambar", ext: "png" },
  "image/webp": { jenis: "gambar", ext: "webp" },
  "video/mp4": { jenis: "video", ext: "mp4" },
  "video/quicktime": { jenis: "video", ext: "mov" },
  "video/webm": { jenis: "video", ext: "webm" },
} as const satisfies Record<string, { jenis: "gambar" | "video"; ext: string }>;

type MimeMedia = keyof typeof JENIS_MEDIA;

/**
 * Tentukan jenis berkas dari ISI-nya (magic byte), bukan dari MIME yang
 * dideklarasikan klien.
 *
 * `berkas.type` datang dari bagian multipart dan bisa dikarang: dulu ia satu-
 * satunya penjaga, jadi byte apa pun bisa masuk bucket asalkan dilabeli
 * image/png. Signature di bawah memeriksa berkasnya sendiri; nilai yang
 * dikembalikan itulah yang dipakai sebagai ContentType, sehingga label palsu
 * tidak pernah ikut tersimpan.
 */
function deteksiMime(buf: Buffer): MimeMedia | null {
  const cocok = (offset: number, ...byte: number[]) =>
    byte.every((b, i) => buf[offset + i] === b);

  // JPEG: FF D8 FF
  if (cocok(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (cocok(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  // WebP: "RIFF"...."WEBP"
  if (cocok(0, 0x52, 0x49, 0x46, 0x46) && cocok(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  // WebM / Matroska: EBML 1A 45 DF A3
  if (cocok(0, 0x1a, 0x45, 0xdf, 0xa3)) return "video/webm";
  // ISO-BMFF (MP4 / QuickTime .mov): box "ftyp" di offset 4, brand menyusul
  if (cocok(4, 0x66, 0x74, 0x79, 0x70)) {
    const brand = buf.toString("latin1", 8, 12);
    // Brand QuickTime = "qt  "; sisanya (isom, mp42, mp41, avc1, dsb.) → mp4.
    return brand === "qt  " ? "video/quicktime" : "video/mp4";
  }
  return null;
}

// Hardcoded config that reads from env at module load time
export const getConfig = () => ({
  endpoint: process.env.MINIO_ENDPOINT?.replace(/\/$/, "") || "http://localhost:9000",
  accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
  bucket: process.env.MINIO_BUCKET || "fire",
});

const AKAR_MEDIA = path.join(process.cwd(), "media");

const jalankanFfmpeg = promisify(execFile);

let s3Client: S3Client | null = null;

export function getMinioClient(): S3Client {
  if (s3Client) return s3Client;

  const cfg = getConfig();
  s3Client = new S3Client({
    endpoint: cfg.endpoint,
    // MinIO mengabaikan region, tapi SDK v3 mewajibkan isinya untuk tanda tangan v4.
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
  });
  
  console.log("[MinIO] Client ready for bucket:", cfg.bucket);
  return s3Client;
}

export type HasilUnggah = { path: string; url: string } | { galat: string };

export async function simpanBerkas(
  berkas: File,
  jenisDiharapkan?: "gambar" | "video",
  folder?: string,
): Promise<HasilUnggah> {
  if (berkas.size === 0) return { galat: "Berkas kosong." };
  if (berkas.size > 100 * 1024 * 1024) return { galat: "Ukuran berkas melebihi 100 MB." };

  // Baca 16 byte pertama untuk magic byte, tanpa memuat seluruh 100 MB ke memori.
  const slice16 = Buffer.from(
    typeof berkas.slice === "function"
      ? await berkas.slice(0, 16).arrayBuffer()
      : (await berkas.arrayBuffer()).slice(0, 16),
  );
  const mime = deteksiMime(slice16);
  if (!mime) return { galat: "Jenis berkas tidak didukung." };

  const info = JENIS_MEDIA[mime];
  // Kalau pemanggil menyebut jenis yang diharapkan (mis. slot khusus gambar),
  // isi berkas harus benar-benar jenis itu — bukan video yang menyamar.
  if (jenisDiharapkan && info.jenis !== jenisDiharapkan) {
    return { galat: "Jenis berkas tidak sesuai." };
  }

  const cfg = getConfig();
  // Nama & ekstensi dari hasil deteksi, bukan dari nama berkas kiriman.
  const relatif = `${folder ?? info.jenis}/${randomUUID()}.${info.ext}`;

  try {
    const stream = typeof berkas.stream === "function"
      ? Readable.fromWeb(berkas.stream() as unknown as Parameters<typeof Readable.fromWeb>[0])
      : Readable.from(Buffer.from(await berkas.arrayBuffer()));

    await getMinioClient().send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: relatif,
        Body: stream,
        ContentLength: berkas.size,
        ContentType: mime,
      }),
    );

    // URL yang dilayani route /media, bukan alamat MinIO: bucketnya tertutup
    // untuk publik, jadi tautan langsung ke sana dijawab 403.
    const url = `/media/${relatif}`;
    console.log("[Upload OK]", { url, type: mime });

    return { path: AWALAN_LOKAL + relatif, url };
  } catch (error: unknown) {
    const err = error instanceof Error ? error : { message: String(error), name: "Unknown" };
    console.error("[Upload ERROR]", { message: err.message, code: err.name });

    // Cadangan ke penyimpanan lokal saat MinIO tidak terjangkau.
    try {
      const penuh = path.join(AKAR_MEDIA, relatif);
      await mkdir(path.dirname(penuh), { recursive: true });
      const streamLokal = typeof berkas.stream === "function"
        ? Readable.fromWeb(berkas.stream() as unknown as Parameters<typeof Readable.fromWeb>[0])
        : Readable.from(Buffer.from(await berkas.arrayBuffer()));
      await pipeline(streamLokal, createWriteStream(penuh));
      console.warn("[Upload FALLBACK] MinIO gagal, berkas disimpan lokal:", {
        path: penuh, alasanMinio: err.message,
      });
      return { path: AWALAN_LOKAL + relatif, url: `/media/${relatif}` };
    } catch (galatLokal) {
      console.error("[Upload GAGAL TOTAL]", {
        minio: err.message,
        lokal: galatLokal instanceof Error ? galatLokal.message : String(galatLokal),
      });
      return { galat: err.message || "Gagal menyimpan berkas." };
    }
  }
}

/**
 * Hasilkan poster video dari file lokal sementara sebelum atau saat unggah,
 * tanpa mengunduh ulang seluruh video dari S3.
 */
export async function bingkaiVideoDariBerkas(berkas: File): Promise<string | null> {
  let kerja: string;
  try {
    kerja = await mkdtemp(path.join(os.tmpdir(), "bingkai-"));
  } catch {
    return null;
  }
  const masukan = path.join(kerja, "masukan");
  const keluaran = path.join(kerja, "bingkai.jpg");

  try {
    const stream = typeof berkas.stream === "function"
      ? Readable.fromWeb(berkas.stream() as unknown as Parameters<typeof Readable.fromWeb>[0])
      : Readable.from(Buffer.from(await berkas.arrayBuffer()));
    await pipeline(stream, createWriteStream(masukan));

    for (const lompat of ["1", "0"]) {
      try {
        await jalankanFfmpeg(
          "ffmpeg",
          ["-nostdin", "-y", "-ss", lompat, "-i", masukan, "-frames:v", "1",
           "-vf", "scale=min(720\\,iw):-2", "-q:v", "4", keluaran],
          { timeout: 20_000 },
        );
        if (await stat(keluaran).then(() => true).catch(() => false)) {
          const posterBuf = await readFile(keluaran);
          const hasil = await simpanBerkas(
            new File([posterBuf], "bingkai.jpg", { type: "image/jpeg" }),
            "gambar",
            "poster",
          );
          return "galat" in hasil ? null : hasil.path;
        }
      } catch {
        // Coba offset berikutnya jika video < 1 detik
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    await rm(kerja, { recursive: true, force: true });
  }
}

/**
 * Simpan satu berkas galeri; satu input menerima gambar dan video sekaligus,
 * jadi jenisnya TIDAK diberitahukan di muka — deteksiMime menentukannya dari
 * 16 byte awal berkas.
 *
 * Setiap video langsung dibekali posternya (`poster`) yang diekstrak langsung
 * dari file/stream lokal sementara sebelum unggah, sehingga tidak perlu
 * mengunduh video kembali dari S3.
 */
export async function simpanBerkasGaleri(
  berkas: File,
): Promise<{ path: string; type: "image" | "video"; poster?: string } | { galat: string }> {
  const slice16 = Buffer.from(
    typeof berkas.slice === "function"
      ? await berkas.slice(0, 16).arrayBuffer()
      : (await berkas.arrayBuffer()).slice(0, 16),
  );
  const mime = deteksiMime(slice16);
  const isVideo = mime && JENIS_MEDIA[mime]?.jenis === "video";

  let poster: string | null = null;
  if (isVideo) {
    poster = await bingkaiVideoDariBerkas(berkas);
  }

  const hasil = await simpanBerkas(berkas);
  if ("galat" in hasil) {
    if (poster) await hapusBerkas(poster);
    return hasil;
  }
  const video = hasil.path.startsWith(`${AWALAN_LOKAL}video/`);
  if (!video) return { path: hasil.path, type: "image" };

  return poster
    ? { path: hasil.path, type: "video", poster }
    : { path: hasil.path, type: "video" };
}

/** Koordinat GPS yang terbaca dari EXIF sebuah berkas, kalau ada. */
export type KoordinatExif = { lat: number; lng: number };

/**
 * Ambil koordinat GPS dari metadata EXIF gambar. Berkas disimpan apa adanya
 * (EXIF utuh), jadi koordinat GPS kamera bisa diambil sebagai cadangan lokasi
 * saat pelapor tidak mengisinya manual.
 *
 * `null` bila berkas bukan gambar ber-GPS, GPS-nya tidak terbaca, atau exifr
 * gagal — pemanggil harus punya cadangan lain, jangan sampai ini menggagalkan
 * penyimpanan laporan.
 */
export async function gpsDariBerkas(berkas: File): Promise<KoordinatExif | null> {
  const buffer = await berkas.arrayBuffer();
  // exifr tidak mengenal MP4/MOV dan akan melempar — video dialihkan ke parser
  // QuickTime sendiri, sisanya diserahkan ke exifr (gambar ber-GPS).
  return tampaknyaVideo(buffer) ? gpsDariVideo(buffer) : gpsDariGambar(buffer);
}

/** Koordinat GPS dari gambar (lewat exifr). `null` bila tak ada / tak terbaca. */
async function gpsDariGambar(buffer: ArrayBuffer): Promise<KoordinatExif | null> {
  try {
    const gps = await exifr.gps(buffer);
    const lat = gps?.latitude;
    const lng = gps?.longitude;
    if (typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  } catch {
    /* bukan gambar ber-GPS — bukan kegagalan fatal */
  }
  return null;
}

/** Deteksi cepat MP4/MOV dari magic byte "ftyp" / "moov" di offset 4. */
function tampaknyaVideo(buffer: ArrayBuffer | Uint8Array): boolean {
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (b.length < 8) return false;
  const tipe = String.fromCharCode(b[4], b[5], b[6], b[7]);
  return tipe === "ftyp" || tipe === "moov";
}

/**
 * Ambil koordinat GPS dari video QuickTime/MP4.
 *
 * exifr tidak mendukung MP4. Video iPhone menyimpan lokasi sebagai teks
 * ISO6709 (`+03.5844+098.6758+000.000/`) di dalam box `moov › udta › meta ›
 * ilst` (key `com.apple.quicktime.location.ISO6709`). Di sini box-box itu
 * ditelusuri apa adanya, nilai string dikumpulkan, lalu pola ISO6709 dicari.
 *
 * Drone (GPS di berkas .srt) dan format lain yang tidak menyimpan lokasi di
 * box ini tetap `null` — ini bukan parser video umum.
 */
function gpsDariVideo(buffer: ArrayBuffer | Uint8Array): KoordinatExif | null {
  try {
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

    function anakBox(
      start: number,
      end: number,
      tipe: string,
    ): { start: number; end: number } | null {
      let o = start;
      while (o + 8 <= end) {
        let size = dv.getUint32(o);
        const type = String.fromCharCode(u8[o + 4], u8[o + 5], u8[o + 6], u8[o + 7]);
        let hdr = 8;
        if (size === 1) {
          size = Number(dv.getBigUint64(o + 8));
          hdr = 16;
        } else if (size === 0) {
          size = end - o;
        }
        if (size < hdr || o + size > end) return null;
        if (type === tipe) return { start: o + hdr, end: o + size };
        o += size;
      }
      return null;
    }

    const moov = anakBox(0, buffer.byteLength, "moov");
    const udta = moov && anakBox(moov.start, moov.end, "udta");
    const meta = udta && anakBox(udta.start, udta.end, "meta");
    // `meta` adalah fullbox: 4 byte version/flags sebelum anak-anaknya.
    const ilst = meta && anakBox(meta.start + 4, meta.end, "ilst");
    if (!ilst) return null;

    // Kumpulkan nilai semua box `data` di dalam ilst. Pada file nyata box
    // `data` dibungkus entry (mis. `mdta`, `©xyz`, `----`), jadi ditelusuri
    // rekursif — nilai bisa di kedalaman mana pun.
    const nilai: string[] = [];
    function kumpulNilai(o: number, end: number): void {
      while (o + 8 <= end) {
        let size = dv.getUint32(o);
        const type = String.fromCharCode(u8[o + 4], u8[o + 5], u8[o + 6], u8[o + 7]);
        let hdr = 8;
        if (size === 1) {
          size = Number(dv.getBigUint64(o + 8));
          hdr = 16;
        } else if (size === 0) {
          size = end - o;
        }
        if (size < hdr || o + size > end) return;
        // box `data`: 4 byte version/flags + 4 byte locale, lalu isinya.
        if (type === "data") {
          const mulai = o + hdr + 8;
          if (mulai < o + size) {
            let s = "";
            for (let i = mulai; i < o + size; i++) s += String.fromCharCode(u8[i]);
            nilai.push(s.replace(/\0+$/, ""));
          }
        } else {
          kumpulNilai(o + hdr, o + size);
        }
        o += size;
      }
    }
    kumpulNilai(ilst.start, ilst.end);

    for (const teks of nilai) {
      const cocok = teks.match(/([+-][\d.]+[+-][\d.]+[+-][\d.]+\/)/);
      if (!cocok) continue;
      const bagian = cocok[1].match(/([+-][\d.]+)/g);
      if (!bagian || bagian.length < 2) continue;
      const lat = Number(bagian[0]);
      const lng = Number(bagian[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  } catch {
    /* struk video tak terbaca — bukan kegagalan fatal */
  }
  return null;
}

/** EXIF foto yang menarik bagi peninjau: titik GPS kamera dan waktu pengambilan. */
export type ExifFoto = { lat?: number; lng?: number; waktu?: string };

/**
 * Baca byte sebuah berkas tersimpan. Cadangan lokal dulu (jalur yang dipakai
 * saat MinIO mati), lalu MinIO — sama urutannya dengan bingkaiVideo(). `null`
 * bila jalurnya bukan milik penyimpanan ini atau tak terjangkau.
 */
async function bacaByte(pathSimpan: string): Promise<Buffer | null> {
  if (!pathSimpan.startsWith(AWALAN_LOKAL)) return null;
  const relatif = pathSimpan.slice(AWALAN_LOKAL.length);
  try {
    return await readFile(path.join(AKAR_MEDIA, relatif));
  } catch {
    /* tidak ada salinan lokal */
  }
  try {
    const objek = await getMinioClient().send(
      new GetObjectCommand({ Bucket: getConfig().bucket, Key: relatif }),
    );
    if (!objek.Body) return null;
    return Buffer.from(await objek.Body.transformToByteArray());
  } catch {
    return null;
  }
}

/**
 * Waktu pengambilan dari EXIF, sebagai jam dinding kamera APA ADANYA.
 *
 * EXIF tidak menyimpan zona waktu, jadi stringnya ("2026:09:01 14:30:22")
 * dibaca mentah dan dibangun sebagai UTC lalu diformat kembali di UTC — dengan
 * begitu jam yang tampil sama persis dengan yang direkam kamera, baik di server
 * UTC maupun peramban WIB. Kalau dibiarkan exifr mengubahnya jadi Date, ia
 * memakai zona mesin dan jamnya bisa bergeser.
 */
function waktuExif(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/.exec(raw);
  if (!m) return undefined;
  const [, y, mo, d, h, mi] = m.map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi));
  if (Number.isNaN(dt.getTime())) return undefined;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  }).format(dt);
}

/**
 * Baca GPS + waktu pengambilan dari metadata berkas tersimpan. Dipakai halaman
 * verifikasi untuk menampilkan bukti kapan & di mana berkas diambil.
 *
 * Foto: EXIF (GPS exifr + waktu) — kamera merekam keduanya. Video: GPS dari box
 * QuickTime ISO6709 (`gpsDariVideo`); video tidak punya jam EXIF, jadi hanya
 * koordinat yang bisa ditampilkan.
 *
 * `null` bila bukan berkas ber-metadata atau tak ada satu pun dari data itu —
 * pemanggil menyembunyikan barisnya, bukan menampilkan kolom kosong.
 */
/**
 * Ekstrak GPS dan waktu pengambilan dari buffer berkas (foto/video).
 */
export async function exifDariBuffer(buf: Buffer): Promise<ExifFoto | null> {
  const hasil: ExifFoto = {};

  // Video: hanya GPS, via parser QuickTime ISO6709 (exifr tak mendukung MP4).
  if (tampaknyaVideo(buf)) {
    const gps = gpsDariVideo(buf);
    if (gps && Number.isFinite(gps.lat) && Number.isFinite(gps.lng)) {
      hasil.lat = gps.lat;
      hasil.lng = gps.lng;
    }
    return hasil.lat !== undefined ? hasil : null;
  }

  // Foto: GPS + waktu lewat exifr.
  try {
    const [gps, tags] = await Promise.all([
      exifr.gps(buf).catch(() => null),
      exifr
        .parse(buf, { reviveValues: false, pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"] })
        .catch(() => null),
    ]);

    if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
      hasil.lat = gps.latitude;
      hasil.lng = gps.longitude;
    }
    const waktu = waktuExif(tags?.DateTimeOriginal ?? tags?.CreateDate ?? tags?.ModifyDate);
    if (waktu) hasil.waktu = waktu;

    return hasil.lat !== undefined || hasil.waktu ? hasil : null;
  } catch {
    return null;
  }
}

/**
 * Ekstrak metadata EXIF langsung dari objek File lokal sebelum diunggah ke S3.
 */
export async function exifDariBerkas(berkas: File): Promise<ExifFoto | null> {
  try {
    const buf = Buffer.from(await berkas.arrayBuffer());
    return await exifDariBuffer(buf);
  } catch {
    return null;
  }
}

/**
 * Baca GPS + waktu pengambilan dari metadata berkas tersimpan.
 */
export async function exifDariPath(pathSimpan: string): Promise<ExifFoto | null> {
  const buf = await bacaByte(pathSimpan);
  if (!buf) return null;
  return exifDariBuffer(buf);
}

/**
 * Buang berkas yang dilepas dari galeri. Kegagalan sengaja tidak dilaporkan ke
 * pemanggil: berkas yatim di penyimpanan tidak merusak apa pun, sedangkan
 * membatalkan penyimpanan karena satu objek gagal dihapus akan membuang
 * seluruh suntingan admin.
 */
export async function hapusBerkas(jalur: string | null | undefined): Promise<void> {
  if (!jalur || !jalur.startsWith(AWALAN_LOKAL)) return;
  const relatif = jalur.slice(AWALAN_LOKAL.length);
  const cfg = getConfig();

  try {
    await getMinioClient().send(
      new DeleteObjectCommand({ Bucket: cfg.bucket, Key: relatif }),
    );
  } catch {
    // MinIO tidak tersedia — berkasnya mungkin tersimpan lewat jalur cadangan.
  }

  try {
    await unlink(path.join(AKAR_MEDIA, relatif));
  } catch {
    // Tidak ada salinan lokal.
  }
}

export async function bingkaiVideo(pathVideo: string): Promise<string | null> {
  if (!pathVideo.startsWith(AWALAN_LOKAL)) return null;
  const relatif = pathVideo.slice(AWALAN_LOKAL.length);

  // Direktur kerja dibuat di luar try/finally utama: kalau mkdtemp gagal,
  // tidak ada yang bisa dibersihkan — kembalikan null saja, sesuai janji bahwa
  // kegagalan poster tidak boleh menggagalkan simpanan berkasnya.
  let kerja: string;
  try {
    kerja = await mkdtemp(path.join(os.tmpdir(), "bingkai-"));
  } catch {
    return null;
  }
  const masukan = path.join(kerja, "masukan");
  const keluaran = path.join(kerja, "bingkai.jpg");

  try {
    // Sumber byte video: salinan cadangan lokal bila ada (jalur saat MinIO
    // mati), kalau tidak diambil dari bucket.
    try {
      await stat(path.join(AKAR_MEDIA, relatif));
      await copyFile(path.join(AKAR_MEDIA, relatif), masukan);
    } catch {
      const objek = await getMinioClient().send(
        new GetObjectCommand({ Bucket: getConfig().bucket, Key: relatif }),
      );
      if (!objek.Body) return null;
      await writeFile(masukan, await objek.Body.transformToByteArray());
    }

    // Bingkai di detik pertama; video yang lebih pendek dari lompatannya
    // diulang tanpa lompatan — bingkai pertama tetap lebih baik daripada nihil.
    // Skala memakai min(720,iw): kecil tidak diubar, besar diringankan.
    for (const lompat of ["1", "0"]) {
      await jalankanFfmpeg(
        "ffmpeg",
        ["-nostdin", "-y", "-ss", lompat, "-i", masukan, "-frames:v", "1",
         "-vf", "scale=min(720\\,iw):-2", "-q:v", "4", keluaran],
        { timeout: 20_000 },
      );
      if (await stat(keluaran).then(() => true).catch(() => false)) {
        const hasil = await simpanBerkas(
          new File([await readFile(keluaran)], "bingkai.jpg", { type: "image/jpeg" }),
          "gambar",
          "poster",
        );
        return "galat" in hasil ? null : hasil.path;
      }
    }
    return null;
  } catch {
    // Poster adalah pelengkap: ffmpeg yang tidak terpasang atau video yang
    // rusak tidak boleh menggagalkan simpanan berkasnya.
    return null;
  } finally {
    await rm(kerja, { recursive: true, force: true });
  }
}