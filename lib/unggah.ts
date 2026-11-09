import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { writeFile, mkdir, unlink, stat, copyFile, readFile, mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import exifr from "exifr";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { catatGalat } from "./catat-galat.ts";

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
export function deteksiMime(buf: Buffer): MimeMedia | null {
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

/** Jenis berkas dari 16 byte pertamanya, tanpa memuat seluruh 100 MB ke memori. */
async function mimeBerkas(berkas: File): Promise<MimeMedia | null> {
  return deteksiMime(Buffer.from(
    typeof berkas.slice === "function"
      ? await berkas.slice(0, 16).arrayBuffer()
      : (await berkas.arrayBuffer()).slice(0, 16),
  ));
}

async function aliranBerkas(berkas: File): Promise<Readable> {
  return typeof berkas.stream === "function"
    ? Readable.fromWeb(berkas.stream() as unknown as Parameters<typeof Readable.fromWeb>[0])
    : Readable.from(Buffer.from(await berkas.arrayBuffer()));
}

/** Salinan ASLI tiap unggahan (byte demi byte, EXIF/GPS utuh) — bukti bagi
 *  peninjau. Route /media tidak pernah melayaninya. */
const AWALAN_ASLI = "asli/";

/** Kunci salinan asli dari kunci publik: UUID-nya sama, foldernya `asli/`. */
function kunciAsli(relatif: string): string {
  return AWALAN_ASLI + path.posix.basename(relatif);
}

/** Folder publik + bentuk nama yang dibuat simpanBerkas() (".jpeg" milik data seed lama). */
const FOLDER_PUBLIK = new Set(["gambar", "video", "poster"]);
const NAMA_PUBLIK = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpe?g|png|webp|mp4|mov|webm)$/;

/**
 * Kunci objek publik dari segmen URL /media, atau `null` bila bentuknya bukan
 * milik unggahan publik — termasuk `asli/…`, path traversal, dan kunci apa pun
 * lain di bucket. Dipakai route /media SEBELUM menyentuh MinIO maupun disk.
 */
export function kunciMediaPublik(bagian: string[]): string | null {
  return bagian.length === 2 && FOLDER_PUBLIK.has(bagian[0]) && NAMA_PUBLIK.test(bagian[1])
    ? bagian.join("/")
    : null;
}

/** Argumen masukan ffmpeg/ffprobe: hanya protokol `file`, demuxer dipaksa dari
 *  ekstensi kanonik — berkas kiriman tidak boleh menyeret ffmpeg membuka URL
 *  atau berkas lain lewat format tebakan (HLS, concat, dsb.). */
function masukanFfmpeg(ext: string, berkas: string): string[] {
  return ["-protocol_whitelist", "file", "-f", ext === "webm" ? "matroska" : "mov", "-i", berkas];
}

/**
 * Konfigurasi MinIO dari env. Kredensial cadangan `minioadmin` hanya untuk
 * pengembangan: di produksi env yang kosong harus gagal keras, bukan diam-diam
 * memakai kredensial bawaan yang dikenal semua orang.
 */
export const getConfig = () => {
  const accessKey = process.env.MINIO_ACCESS_KEY;
  const secretKey = process.env.MINIO_SECRET_KEY;
  if (process.env.NODE_ENV === "production" && (!accessKey || !secretKey)) {
    throw new Error("MINIO_ACCESS_KEY dan MINIO_SECRET_KEY wajib diisi di produksi.");
  }
  return {
    endpoint: process.env.MINIO_ENDPOINT?.replace(/\/$/, "") || "http://localhost:9000",
    accessKey: accessKey || "minioadmin",
    secretKey: secretKey || "minioadmin",
    bucket: process.env.MINIO_BUCKET || "fire",
  };
};

/** Batas resolusi gambar. Dekoder (peramban, optimizer next/image) menyiapkan
 *  lebar×tinggi×4 byte: PNG 1 KB yang mengaku 60000×60000 = bom 14 GB. */
export const BATAS_PIKSEL = 50_000_000;

type HasilBersih = { isi: Buffer; piksel: number };

/**
 * Buang metadata gambar TANPA meng-encode ulang — data gambarnya disalin byte
 * demi byte, hanya segmen/chunk metadata yang dilompati. Sekalian membaca
 * resolusi dari header untuk BATAS_PIKSEL.
 *
 * `null` bila strukturnya tak terbaca (berkas rusak/terpotong) — pemanggil
 * menolaknya, jangan sampai berkas yang tak bisa dibersihkan tayang apa adanya.
 *
 * shortcut: Orientation hanya ditulis ulang untuk JPEG; di PNG/WebP ia ikut
 * terbuang (kamera ponsel praktis tak menulisnya) — tiru app1Orientasi() bila
 * muncul laporan foto PNG/WebP yang tampil miring.
 */
export function bersihkanGambar(buf: Buffer, mime: string): HasilBersih | null {
  try {
    if (mime === "image/jpeg") return bersihkanJpeg(buf);
    if (mime === "image/png") return bersihkanPng(buf);
    if (mime === "image/webp") return bersihkanWebp(buf);
  } catch {
    /* RangeError dari readUInt* di luar batas = struktur rusak */
  }
  return null;
}

/** Orientation (1–8) dari TIFF di dalam APP1 Exif; 0 bila tak ada. */
function orientasiTiff(buf: Buffer, t: number, akhir: number): number {
  const le = buf[t] === 0x49; // "II" = little-endian, "MM" = big-endian
  const u16 = (i: number) => (i + 2 > akhir ? 0 : le ? buf.readUInt16LE(i) : buf.readUInt16BE(i));
  const u32 = (i: number) => (i + 4 > akhir ? 0 : le ? buf.readUInt32LE(i) : buf.readUInt32BE(i));
  const ifd = t + u32(t + 4);
  for (let i = 0, n = u16(ifd); i < n; i++) {
    if (u16(ifd + 2 + i * 12) === 0x0112) return u16(ifd + 10 + i * 12);
  }
  return 0;
}

/** APP1 Exif minimal berisi Orientation saja — tanpanya foto potret dari
 *  ponsel tampil miring begitu EXIF aslinya dibuang. */
function app1Orientasi(n: number): Buffer {
  return Buffer.from([
    0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // APP1, panjang 34, "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // TIFF big-endian, IFD0 di offset 8
    0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, n, 0x00, 0x00, // 1 entri: Orientation (SHORT) = n
    0x00, 0x00, 0x00, 0x00, // tak ada IFD berikutnya
  ]);
}

/**
 * JPEG: yang disimpan hanya segmen non-APP (tabel, SOF, SOS + data entropi),
 * APP0 (JFIF), APP2 profil ICC, dan APP14 (Adobe — menentukan ruang warna).
 * APP1 (Exif, XMP), APP13 (IPTC/Photoshop), APPn lain, dan komentar dibuang;
 * begitu pula apa pun setelah EOI (motion photo, trailer ponsel).
 */
function bersihkanJpeg(buf: Buffer): HasilBersih | null {
  const keluar: Buffer[] = [buf.subarray(0, 2)];
  let piksel = 0;
  let orientasiDitulis = false;
  let o = 2;
  while (o + 4 <= buf.length) {
    if (buf[o] !== 0xff) return null;
    const m = buf[o + 1];
    if (m === 0xff) { o++; continue; } // byte pengisi
    if (m === 0xd9) break; // EOI
    const akhir = o + 2 + buf.readUInt16BE(o + 2);
    if (akhir > buf.length || akhir < o + 4) return null;

    // SOFn (C0–CF kecuali DHT C4, JPG C8, DAC CC): tinggi lalu lebar.
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc && akhir >= o + 9) {
      piksel = buf.readUInt16BE(o + 5) * buf.readUInt16BE(o + 7);
    }
    if (m === 0xe1 && !orientasiDitulis && buf.toString("latin1", o + 4, o + 10) === "Exif\0\0") {
      const n = orientasiTiff(buf, o + 10, akhir);
      if (n >= 2 && n <= 8) {
        keluar.push(app1Orientasi(n));
        orientasiDitulis = true;
      }
    }
    const app = m >= 0xe0 && m <= 0xef;
    if (m !== 0xfe && (!app || m === 0xe0 || m === 0xee ||
      (m === 0xe2 && buf.toString("latin1", o + 4, o + 16) === "ICC_PROFILE\0"))) {
      keluar.push(buf.subarray(o, akhir));
    }
    o = akhir;

    if (m === 0xda) {
      // Data entropi setelah SOS: lompat ke penanda berikutnya. FF00 = byte
      // isian, FFD0–D7 = RSTn — keduanya bagian dari data, bukan penanda.
      let j = o;
      for (;;) {
        j = buf.indexOf(0xff, j);
        if (j < 0 || j + 1 >= buf.length) { j = buf.length; break; }
        const b = buf[j + 1];
        if (b !== 0 && (b < 0xd0 || b > 0xd7)) break;
        j += 2;
      }
      keluar.push(buf.subarray(o, j));
      o = j;
    }
  }
  if (!piksel) return null;
  keluar.push(Buffer.from([0xff, 0xd9]));
  return { isi: Buffer.concat(keluar), piksel };
}

/** Chunk PNG tambahan yang dipertahankan — semuanya urusan tampilan (warna,
 *  transparansi, animasi APNG). eXIf, tEXt, iTXt, zTXt, tIME, dan chunk privat
 *  dibuang. Chunk kritis (IHDR/PLTE/IDAT/IEND) selalu ikut. */
const PNG_SIMPAN = new Set([
  "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "bKGD", "pHYs",
  "acTL", "fcTL", "fdAT", "cICP", "mDCv", "cLLI",
]);

function bersihkanPng(buf: Buffer): HasilBersih | null {
  if (buf.toString("latin1", 12, 16) !== "IHDR") return null;
  const piksel = buf.readUInt32BE(16) * buf.readUInt32BE(20);
  const keluar: Buffer[] = [buf.subarray(0, 8)];
  let o = 8;
  while (o + 12 <= buf.length) {
    const akhir = o + 12 + buf.readUInt32BE(o);
    if (akhir > buf.length) return null;
    const tipe = buf.toString("latin1", o + 4, o + 8);
    // Bit 5 byte pertama tipe = chunk tambahan (huruf kecil).
    if (!(buf[o + 4] & 0x20) || PNG_SIMPAN.has(tipe)) keluar.push(buf.subarray(o, akhir));
    o = akhir;
    if (tipe === "IEND") return { isi: Buffer.concat(keluar), piksel };
  }
  return null;
}

/** Chunk WebP yang dipertahankan; "EXIF", "XMP " dan chunk tak dikenal dibuang. */
const WEBP_SIMPAN = new Set(["VP8 ", "VP8L", "VP8X", "ALPH", "ANIM", "ANMF", "ICCP"]);

function bersihkanWebp(buf: Buffer): HasilBersih | null {
  const batas = Math.min(buf.length, 8 + buf.readUInt32LE(4));
  const keluar: Buffer[] = [buf.subarray(0, 12)];
  let piksel = 0;
  let o = 12;
  while (o + 8 <= batas) {
    const tipe = buf.toString("latin1", o, o + 4);
    const ukuran = buf.readUInt32LE(o + 4);
    const d = o + 8;
    if (d + ukuran > batas) return null;
    if (tipe === "VP8X" && ukuran >= 10) {
      // Kanvas: lebar-1 dan tinggi-1, masing-masing 24 bit.
      piksel = (buf.readUIntLE(d + 4, 3) + 1) * (buf.readUIntLE(d + 7, 3) + 1);
    } else if (tipe === "VP8 " && ukuran >= 10 && !piksel) {
      piksel = (buf.readUInt16LE(d + 6) & 0x3fff) * (buf.readUInt16LE(d + 8) & 0x3fff);
    } else if (tipe === "VP8L" && ukuran >= 5 && !piksel) {
      const b = buf.readUInt32LE(d + 1);
      piksel = ((b & 0x3fff) + 1) * (((b >>> 14) & 0x3fff) + 1);
    }
    // Isi chunk dipadatkan ke panjang genap.
    const akhir = Math.min(d + ukuran + (ukuran & 1), batas);
    if (WEBP_SIMPAN.has(tipe)) keluar.push(buf.subarray(o, akhir));
    o = akhir;
  }
  if (!piksel) return null;
  const isi = Buffer.concat(keluar);
  isi.writeUInt32LE(isi.length - 8, 4); // ukuran RIFF baru
  // VP8X selalu chunk pertama: matikan bendera EXIF (0x08) dan XMP (0x04).
  if (isi.toString("latin1", 12, 16) === "VP8X") isi[20] &= ~0x0c;
  return { isi, piksel };
}

const AKAR_MEDIA = path.join(process.cwd(), "media");

const jalankanFfmpeg = promisify(execFile);

let s3Client: S3Client | null = null;

/* Batas waktu klien MinIO.
 *
 * Tanpa ini sebuah MinIO yang TAK TERJANGKAU (container mati, lepas dari
 * jaringan `shared`, nama layanan berubah) membuat setiap permintaan
 * /media menggantung tanpa akhir: soket menunggu koneksi yang tak pernah
 * terjadi, peramban memutar spinner selamanya, dan permintaannya menumpuk di
 * server. Dengan batas ini kegagalannya cepat dan terbaca — route /media lalu
 * jatuh ke berkas lokal atau menjawab 404.
 *
 * requestTimeout adalah batas DIAM soket (bukan total durasi), jadi unggahan
 * video 100 MB tetap lolos selama datanya mengalir. */
const BATAS_SAMBUNG_MS = 3000;
const BATAS_DIAM_MS = 15000;

export function getMinioClient(): S3Client {
  if (s3Client) return s3Client;

  const cfg = getConfig();
  s3Client = new S3Client({
    endpoint: cfg.endpoint,
    // MinIO mengabaikan region, tapi SDK v3 mewajibkan isinya untuk tanda tangan v4.
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
    // Objek biasa (bukan NodeHttpHandler): SDK v3 membangun handler-nya
    // sendiri, jadi tak perlu mengimpor @smithy/node-http-handler yang cuma
    // dependensi transitif.
    requestHandler: {
      connectionTimeout: BATAS_SAMBUNG_MS,
      requestTimeout: BATAS_DIAM_MS,
    },
    // Dua kali coba, bukan tiga: percobaan ketiga hanya memperpanjang
    // penantian pengunjung saat MinIO memang sedang mati.
    maxAttempts: 2,
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

  const mime = await mimeBerkas(berkas);
  if (!mime) return { galat: "Jenis berkas tidak didukung." };

  const info = JENIS_MEDIA[mime];
  // Kalau pemanggil menyebut jenis yang diharapkan (mis. slot khusus gambar),
  // isi berkas harus benar-benar jenis itu — bukan video yang menyamar.
  if (jenisDiharapkan && info.jenis !== jenisDiharapkan) {
    return { galat: "Jenis berkas tidak sesuai." };
  }

  // Nama & ekstensi dari hasil deteksi, bukan dari nama berkas kiriman.
  const relatif = `${folder ?? info.jenis}/${randomUUID()}.${info.ext}`;
  const relatifAsli = kunciAsli(relatif);

  // Dua salinan: `asli/` byte demi byte sebagai bukti (EXIF/GPS utuh, tak
  // pernah dilayani publik) dan versi publik TANPA metadata — tanpa ini siapa
  // pun yang mengunduh foto laporan, termasuk yang anonim, membaca GPS, jam,
  // dan model ponsel pelapornya. Isi = Buffer (gambar) atau jalur berkas
  // sementara (video, supaya 100 MB tidak dimuat ke memori).
  let kerja: string | null = null;
  try {
    let asli: Buffer | string;
    let publik: Buffer | string;
    if (info.jenis === "gambar") {
      asli = Buffer.from(await berkas.arrayBuffer());
      const bersih = bersihkanGambar(asli, mime);
      if (!bersih) return { galat: "Berkas gambar rusak atau tidak terbaca." };
      if (bersih.piksel > BATAS_PIKSEL) return { galat: "Resolusi gambar melebihi 50 megapiksel." };
      publik = bersih.isi;
    } else {
      try {
        kerja = await mkdtemp(path.join(os.tmpdir(), "unggah-"));
        asli = path.join(kerja, "asli");
        publik = path.join(kerja, `publik.${info.ext}`);
        await pipeline(await aliranBerkas(berkas), createWriteStream(asli));
        // Remux tanpa encode ulang: hanya trek video + audio (trek data/teks
        // bisa membawa GPS, mis. telemetri drone), metadata global & per trek
        // (udta ©xyz, com.apple.quicktime.location.ISO6709, waktu) dibuang.
        await jalankanFfmpeg(
          "ffmpeg",
          ["-nostdin", "-y", ...masukanFfmpeg(info.ext, asli), "-map", "0:v", "-map", "0:a?",
           "-map_metadata", "-1", "-map_chapters", "-1", "-c", "copy", publik],
          { timeout: 60_000 },
        );
      } catch (e) {
        // Gagal tertutup: video yang tak bisa dibersihkan tidak boleh tayang
        // membawa lokasi pelapornya.
        console.warn("[Upload] video gagal dibersihkan:", e instanceof Error ? e.message : e);
        return { galat: "Video tidak bisa diproses. Coba rekam ulang atau pakai format lain." };
      }
    }

    try {
      // Asli dulu: kalau ia gagal, belum ada apa pun yang tayang.
      await kirimMinio(relatifAsli, asli, mime);
      await kirimMinio(relatif, publik, mime);

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
        await tulisLokal(relatifAsli, asli);
        await tulisLokal(relatif, publik);
        console.warn("[Upload FALLBACK] MinIO gagal, berkas disimpan lokal:", {
          path: path.join(AKAR_MEDIA, relatif), alasanMinio: err.message,
        });
        return { path: AWALAN_LOKAL + relatif, url: `/media/${relatif}` };
      } catch (galatLokal) {
        // MinIO DAN disk lokal gagal: tak ada laporan berberkas yang bisa masuk.
        await catatGalat("Upload GAGAL TOTAL", galatLokal, `minio: ${err.message}`);
        // Pesan MinIO/fs mentah sudah dicatat di atas; pengguna cukup tahu gagal.
        return { galat: "Gagal menyimpan berkas. Coba lagi." };
      }
    }
  } finally {
    if (kerja) await rm(kerja, { recursive: true, force: true });
  }
}

/** Kirim satu salinan ke MinIO — dari Buffer, atau dari jalur berkas sementara. */
async function kirimMinio(kunci: string, isi: Buffer | string, mime: string): Promise<void> {
  await getMinioClient().send(
    new PutObjectCommand({
      Bucket: getConfig().bucket,
      Key: kunci,
      Body: typeof isi === "string" ? createReadStream(isi) : isi,
      ContentLength: typeof isi === "string" ? (await stat(isi)).size : isi.length,
      ContentType: mime,
    }),
  );
}

async function tulisLokal(relatif: string, isi: Buffer | string): Promise<void> {
  const penuh = path.join(AKAR_MEDIA, relatif);
  await mkdir(path.dirname(penuh), { recursive: true });
  await (typeof isi === "string" ? copyFile(isi, penuh) : writeFile(penuh, isi));
}

/**
 * Hasilkan poster video dari file lokal sementara sebelum atau saat unggah,
 * tanpa mengunduh ulang seluruh video dari S3.
 */
export async function bingkaiVideoDariBerkas(berkas: File): Promise<string | null> {
  const mime = await mimeBerkas(berkas);
  if (!mime || JENIS_MEDIA[mime].jenis !== "video") return null;
  let kerja: string;
  try {
    kerja = await mkdtemp(path.join(os.tmpdir(), "bingkai-"));
  } catch {
    return null;
  }
  const masukan = path.join(kerja, "masukan");
  const keluaran = path.join(kerja, "bingkai.jpg");

  try {
    await pipeline(await aliranBerkas(berkas), createWriteStream(masukan));

    for (const lompat of ["1", "0"]) {
      try {
        await jalankanFfmpeg(
          "ffmpeg",
          ["-nostdin", "-y", "-ss", lompat, ...masukanFfmpeg(JENIS_MEDIA[mime].ext, masukan), "-frames:v", "1",
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
  const mime = await mimeBerkas(berkas);
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
 * Ambil koordinat GPS dari metadata EXIF gambar kiriman (sebelum diunggah —
 * versi publiknya tanpa EXIF), sebagai cadangan lokasi saat pelapor tidak
 * mengisinya manual.
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
        // ISO6709 cuma ±30 byte; box yang jauh lebih besar dilewati supaya
        // pengunggah tak bisa memaksa string raksasa dibangun per karakter.
        if (type === "data") {
          const mulai = o + hdr + 8;
          if (mulai < o + size && o + size - mulai <= 256) {
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
 * Titik GPS yang layak dipakai. 0,0 ("Null Island") ditolak: banyak kamera
 * Android menulisnya saat belum dapat fix, dan ia lolos sebagai lokasi asli.
 */
export function titikGpsSah(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

/**
 * Ekstrak GPS dan waktu pengambilan dari buffer berkas (foto/video).
 */
export async function exifDariBuffer(buf: Buffer): Promise<ExifFoto | null> {
  const hasil: ExifFoto = {};

  // Video: hanya GPS, via parser QuickTime ISO6709 (exifr tak mendukung MP4).
  if (tampaknyaVideo(buf)) {
    const gps = gpsDariVideo(buf);
    if (gps && titikGpsSah(gps.lat, gps.lng)) {
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

    if (gps && titikGpsSah(gps.latitude, gps.longitude)) {
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
  if (!pathSimpan.startsWith(AWALAN_LOKAL)) return null;
  // Versi publik sudah tanpa metadata; buktinya di salinan asli. Berkas lama
  // yang belum di-backfill belum punya salinan asli — baca yang publik.
  const relatif = pathSimpan.slice(AWALAN_LOKAL.length);
  const buf = (await bacaByte(AWALAN_LOKAL + kunciAsli(relatif))) ?? (await bacaByte(pathSimpan));
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

  // Salinan asli ikut dibuang: laporan yang dihapus tidak boleh meninggalkan
  // GPS pelapornya di bucket.
  for (const kunci of [relatif, kunciAsli(relatif)]) {
    try {
      await getMinioClient().send(
        new DeleteObjectCommand({ Bucket: getConfig().bucket, Key: kunci }),
      );
    } catch (e) {
      // MinIO tidak tersedia — berkasnya mungkin tersimpan lewat jalur cadangan.
      // Dicatat: tanpa ini objek yatim di MinIO tidak pernah ketahuan.
      console.warn("[hapusBerkas] MinIO gagal menghapus", kunci, e instanceof Error ? e.message : e);
    }

    try {
      await unlink(path.join(AKAR_MEDIA, kunci));
    } catch {
      // Tidak ada salinan lokal.
    }
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
        ["-nostdin", "-y", "-ss", lompat, ...masukanFfmpeg(path.extname(relatif).slice(1), masukan), "-frames:v", "1",
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