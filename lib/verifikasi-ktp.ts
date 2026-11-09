import { createHmac, randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Prisma, mobile_ktp_verifications_status } from "@prisma/client";
import { catatGalat } from "./catat-galat.ts";
import { periksaEkyc } from "./ekyc.ts";
import { prisma } from "./prisma.ts";
import { BATAS_PIKSEL, bersihkanGambar, deteksiMime } from "./unggah.ts";

/**
 * Verifikasi KTP akun warga — syarat siaran langsung PUBLIK dari aplikasi
 * mobile (POST /api/mobile/live/token): siaran tampil di beranda semua warga
 * tanpa moderasi lebih dulu, jadi penyiarnya harus orang yang bisa dimintai
 * tanggung jawab, bukan sekadar akun Google sekali pakai.
 *
 * Alur: warga mengirim NIK + foto KTP (POST /api/mobile/saya/verifikasi) →
 * eKYC otomatis bila dipasang
 * (lib/ekyc.ts; "lolos" = langsung disetujui) → selain itu petugas CMS
 * memutuskan di /admin/verifikasi.
 *
 * Privasi — yang disimpan seminimal mungkin dan sesingkat mungkin:
 *   - Foto KTP di KTP_DIR (di luar public/ dan media/, nama acak, mode 600), tidak
 *     pernah dilayani publik; hanya /api/admin/verifikasi/… untuk peninjau.
 *     EXIF (GPS rumah, jam, model ponsel) dibuang sebelum ditulis.
 *   - Foto dan NIK polos (ketikan dan bacaan OCR) hanya ada selama `menunggu` —
 *     dihapus begitu diputuskan (setuju ATAU tolak). Sesudahnya tinggal
 *     status, waktu, metode, hasil OCR, peninjau, alasan tolak, dan HMAC NIK.
 *   - Pengajuan yang tidak diputuskan 30 hari dihapus (foto ikut) saat antrean
 *     atau status dibaca — tanpa job terjadwal (sapuKedaluwarsa).
 *   - NIK disidik HMAC-SHA256 berkunci KTP_NIK_SECRET, bukan sha256 polos:
 *     ruang NIK kecil dan berpola (provinsi, tanggal lahir, nomor urut), jadi
 *     sha256 polos bisa ditebak habis dalam hitungan jam.
 *
 * Satu NIK hanya untuk satu akun terverifikasi: users.ktp_nik_hash unik.
 */

/** Pengajuan `menunggu` selama ini (tepat 30 hari termasuk) kedaluwarsa. */
export const UMUR_PENGAJUAN_MS = 30 * 24 * 60 * 60_000;

/** Atap per foto. Foto ponsel modern 2–6 MB; KTP terbaca jelas jauh di bawahnya. */
export const BATAS_FOTO_BYTE = 8 * 1024 * 1024;

/**
 * Atap badan multipart: SATU foto KTP + pembatas & isian NIK, ditambah ruang
 * untuk satu foto lagi — klien lama yang masih mengirim bidang `selfie` tetap
 * dijawab normal (bidang itu diabaikan, tidak pernah disimpan), bukan 413.
 */
export const BATAS_BADAN_KTP = 2 * BATAS_FOTO_BYTE + 256 * 1024;

/** Panjang minimum KTP_NIK_SECRET di produksi. */
export const PANJANG_KUNCI_MIN = 32;

/** Hanya di luar produksi, bila KTP_NIK_SECRET kosong. Sidik yang dibuat
 *  dengannya tidak bisa dibandingkan dengan sidik produksi — memang tidak perlu. */
const KUNCI_PENGEMBANGAN = "verifikasi-ktp-hanya-untuk-pengembangan-lokal";

export type StatusKtp = "belum" | "menunggu" | "disetujui" | "ditolak";

/** Jawaban GET /api/mobile/saya/verifikasi (kontrak aplikasi). */
export type JawabanStatus = {
  status: StatusKtp;
  alasan: string | null;
  diajukan: string | null;
  diputuskan: string | null;
};

const BELUM: JawabanStatus = { status: "belum", alasan: null, diajukan: null, diputuskan: null };

// ── NIK ──────────────────────────────────────────────────────────────────────

/**
 * Kunci HMAC NIK. Produksi: KTP_NIK_SECRET wajib, ≥ PANJANG_KUNCI_MIN karakter,
 * atau null (pengajuan dijawab 503 — fail-closed, seperti Turnstile). Di luar
 * produksi kunci kosong diganti kunci pengembangan supaya kerja lokal jalan.
 *
 * JANGAN diganti setelah terisi: sidik lama tak bisa dibandingkan lagi dengan
 * yang baru, jadi NIK akun yang sudah terverifikasi bisa dipakai akun lain.
 */
export function kunciNik(env: Record<string, string | undefined> = process.env): string | null {
  const rahasia = env.KTP_NIK_SECRET ?? "";
  if (env.NODE_ENV !== "production") return rahasia || KUNCI_PENGEMBANGAN;
  return rahasia.length >= PANJANG_KUNCI_MIN ? rahasia : null;
}

/** HMAC-SHA256 NIK, hex 64 karakter — nilai users.ktp_nik_hash. */
export function sidikNik(nik: string, kunci: string): string {
  return createHmac("sha256", kunci).update(nik).digest("hex");
}

// ── Status ───────────────────────────────────────────────────────────────────

export function kedaluwarsa(diajukan: Date, kini: Date): boolean {
  return kini.getTime() - diajukan.getTime() >= UMUR_PENGAJUAN_MS;
}

/** Hari tersisa sebelum pengajuan kedaluwarsa, dibulatkan ke atas; 0 = hari ini/lewat. */
export function sisaHariPengajuan(diajukan: Date, kini: Date): number {
  const sisa = diajukan.getTime() + UMUR_PENGAJUAN_MS - kini.getTime();
  return Math.max(0, Math.ceil(sisa / (24 * 60 * 60_000)));
}

export type BarisStatus = {
  status: mobile_ktp_verifications_status;
  reason: string | null;
  created_at: Date;
  decided_at: Date | null;
};

/**
 * Status untuk aplikasi dari tanda di akun (sumber kebenaran "disetujui") dan
 * pengajuan terakhirnya. Pengajuan menunggu yang kedaluwarsa = "belum", walau
 * barisnya belum sempat disapu.
 */
export function jawabanStatus(terverifikasi: Date | null, terakhir: BarisStatus | null, kini: Date): JawabanStatus {
  if (terverifikasi) {
    return {
      status: "disetujui",
      alasan: null,
      diajukan: terakhir?.status === "disetujui" ? terakhir.created_at.toISOString() : null,
      diputuskan: terverifikasi.toISOString(),
    };
  }
  if (terakhir?.status === "menunggu" && !kedaluwarsa(terakhir.created_at, kini)) {
    return { status: "menunggu", alasan: null, diajukan: terakhir.created_at.toISOString(), diputuskan: null };
  }
  if (terakhir?.status === "ditolak") {
    return {
      status: "ditolak",
      alasan: terakhir.reason,
      diajukan: terakhir.created_at.toISOString(),
      diputuskan: terakhir.decided_at?.toISOString() ?? null,
    };
  }
  return BELUM;
}

/** Status verifikasi akun (setelah pengajuan kedaluwarsanya disapu). */
export async function statusVerifikasi(userId: bigint, kini = new Date()): Promise<JawabanStatus> {
  await sapuKedaluwarsa(kini, userId).catch((e) => catatGalat("sapu-ktp", e));
  const [akun, terakhir] = await Promise.all([
    prisma.users.findUnique({ where: { id: userId }, select: { ktp_verified_at: true } }),
    prisma.mobile_ktp_verifications.findFirst({
      where: { user_id: userId },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      select: { status: true, reason: true, created_at: true, decided_at: true },
    }),
  ]);
  return jawabanStatus(akun?.ktp_verified_at ?? null, terakhir, kini);
}

/** Akun sudah disetujui — satu baca PK, untuk gerbang siaran. */
export async function sudahTerverifikasi(userId: bigint): Promise<boolean> {
  const akun = await prisma.users.findUnique({ where: { id: userId }, select: { ktp_verified_at: true } });
  return Boolean(akun?.ktp_verified_at);
}

// ── Berkas foto ──────────────────────────────────────────────────────────────

/** Ekstensi berkas per jenis foto yang diterima — dari magic byte, bukan nama kiriman. */
const EKSTENSI = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type MimeFoto = keyof typeof EKSTENSI;
const MIME_DARI_EKSTENSI: Record<string, MimeFoto> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Nama berkas yang kita buat sendiri: 128 bit acak + ekstensi. Nilai lain dari
 *  basis data tidak pernah dijadikan jalur (penjelajahan direktori). */
const NAMA_FOTO = /^[0-9a-f]{32}\.(jpg|png|webp)$/;

/** Folder yang dilayani publik (atau ikut build): KTP_DIR tidak boleh di dalamnya. */
const FOLDER_TERBUKA = ["public", "media", ".next"];

/**
 * Folder foto KTP: KTP_DIR, atau `privat/ktp` di bawah folder kerja (di
 * container: /app/privat/ktp). null bila KTP_DIR menunjuk ke dalam folder yang
 * dilayani publik — salah konfigurasi yang menolak semua pengajuan, bukan
 * membocorkannya.
 */
export function folderKtp(env: Record<string, string | undefined> = process.env): string | null {
  const folder = path.resolve(env.KTP_DIR?.trim() || path.join(process.cwd(), "privat", "ktp"));
  const terbuka = FOLDER_TERBUKA.map((f) => path.join(process.cwd(), f));
  return terbuka.some((t) => folder === t || folder.startsWith(t + path.sep)) ? null : folder;
}

function jalurFoto(nama: string): string | null {
  const folder = folderKtp();
  return folder && NAMA_FOTO.test(nama) ? path.join(folder, nama) : null;
}

export type FotoKtp = { isi: Buffer; mime: MimeFoto };
export type GalatFoto = { galat: string; status: 400 | 413 };

/**
 * Foto dari bidang multipart → isi tanpa metadata. Jenis dari magic byte
 * (JPEG/PNG/WebP), ≤ BATAS_FOTO_BYTE, strukturnya terbaca, ≤ 50 megapiksel
 * (bom dekompresi di peramban peninjau).
 */
export async function siapkanFoto(nilai: FormDataEntryValue | null, label: string): Promise<FotoKtp | GalatFoto> {
  if (!(nilai instanceof Blob) || nilai.size === 0) return { galat: `${label} wajib dilampirkan.`, status: 400 };
  if (nilai.size > BATAS_FOTO_BYTE) return { galat: `${label} melebihi 8 MB.`, status: 413 };
  const isi = Buffer.from(await nilai.arrayBuffer());
  const mime = deteksiMime(isi.subarray(0, 16));
  if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp") {
    return { galat: `${label} harus berupa foto JPEG, PNG, atau WebP.`, status: 400 };
  }
  const bersih = bersihkanGambar(isi, mime);
  if (!bersih) return { galat: `${label} rusak atau tidak terbaca.`, status: 400 };
  if (bersih.piksel > BATAS_PIKSEL) return { galat: `Resolusi ${label.toLowerCase()} terlalu besar.`, status: 400 };
  return { isi: bersih.isi, mime };
}

async function simpanFoto(foto: FotoKtp): Promise<string> {
  const folder = folderKtp();
  if (!folder) throw new Error("KTP_DIR menunjuk ke folder yang dilayani publik");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const nama = `${randomBytes(16).toString("hex")}.${EKSTENSI[foto.mime]}`;
  // wx: tidak pernah menimpa berkas lain, mode 600: hanya proses app yang membaca.
  await writeFile(path.join(folder, nama), foto.isi, { mode: 0o600, flag: "wx" });
  return nama;
}

/** Hapus satu foto. Sudah tidak ada = beres; galat lain hanya dicatat (yang
 *  tertinggal disapu sapuYatim). */
export async function hapusFoto(nama: string | null | undefined): Promise<void> {
  const jalur = nama ? jalurFoto(nama) : null;
  if (!jalur) return;
  try {
    await unlink(jalur);
  } catch (e) {
    if ((e as { code?: unknown }).code !== "ENOENT") await catatGalat("hapus-foto-ktp", e, nama ?? "");
  }
}

export async function hapusFotoSemua(nama: (string | null | undefined)[]): Promise<void> {
  await Promise.all(nama.map(hapusFoto));
}

/** Berkasnya masih ada — mis. hilang bila KTP_DIR tidak di volume tetap dan
 *  container diganti saat deploy. */
export async function fotoAda(nama: string | null): Promise<boolean> {
  const jalur = nama ? jalurFoto(nama) : null;
  return jalur ? stat(jalur).then((s) => s.isFile(), () => false) : false;
}

/** Isi foto untuk halaman peninjau; null bila nama tak sah atau berkasnya hilang. */
export async function bacaFoto(nama: string | null): Promise<FotoKtp | null> {
  const jalur = nama ? jalurFoto(nama) : null;
  const mime = nama ? MIME_DARI_EKSTENSI[nama.slice(nama.lastIndexOf(".") + 1)] : undefined;
  if (!jalur || !mime) return null;
  try {
    return { isi: await readFile(jalur), mime };
  } catch {
    return null;
  }
}

// ── Pengajuan & keputusan ────────────────────────────────────────────────────

const GALAT_NIK_DIPAKAI = "NIK ini sudah dipakai akun lain.";

export type HasilAjuan = [status: number, jawaban: { status: StatusKtp } | { galat: string }];

/**
 * Simpan pengajuan baru (menggantikan pengajuan menunggu/ditolak sebelumnya
 * beserta fotonya), lalu tanyakan eKYC. Pemanggil sudah memastikan akun belum
 * terverifikasi, NIK lolos periksaNik, dan kunci tersedia.
 */
export async function ajukanVerifikasi(
  akun: { id: bigint; name: string },
  nik: string,
  ktp: FotoKtp,
  kunci: string,
): Promise<HasilAjuan> {
  const nikHash = sidikNik(nik, kunci);
  const dipakai = await prisma.users.findFirst({
    where: { ktp_nik_hash: nikHash, NOT: { id: akun.id } },
    select: { id: true },
  });
  if (dipakai) return [409, { galat: GALAT_NIK_DIPAKAI }];

  let baru: string | null = null;
  let id: bigint;
  let lama: (string | null)[];
  try {
    baru = await simpanFoto(ktp);
    const nama = baru;
    [id, lama] = await prisma.$transaction(async (tx) => {
      const sebelum = await tx.mobile_ktp_verifications.findMany({
        where: { user_id: akun.id, status: { in: ["menunggu", "ditolak"] } },
        select: { id: true, ktp_path: true },
      });
      if (sebelum.length) {
        await tx.mobile_ktp_verifications.deleteMany({ where: { id: { in: sebelum.map((s) => s.id) } } });
      }
      const dibuat = await tx.mobile_ktp_verifications.create({
        data: { user_id: akun.id, nik, nik_hash: nikHash, ktp_path: nama },
        select: { id: true },
      });
      return [dibuat.id, sebelum.map((s) => s.ktp_path)] as const;
    });
  } catch (e) {
    await hapusFoto(baru);
    throw e;
  }
  await hapusFotoSemua(lama);

  const periksa = await periksaEkyc({ nik, nama: akun.name, ktp });
  if (periksa.ocr) {
    // Untuk lencana peninjau. Gagal menyimpan bukan alasan menggagalkan pengajuan.
    await prisma.mobile_ktp_verifications
      .updateMany({
        where: { id, status: "menunggu" },
        data: { ocr_result: periksa.ocr.hasil, ocr_nik: periksa.ocr.nik, ocr_score: periksa.ocr.skor },
      })
      .catch((e) => catatGalat("simpan-ocr-ktp", e, `pengajuan ${id}`));
  }
  if (periksa.hasil === "lolos") {
    const putus = await putuskanVerifikasi(id, { setuju: true, metode: "ekyc", peninjauId: null });
    if (putus.ok) return [200, { status: "disetujui" }];
    // Mis. NIK keburu disetujui untuk akun lain: tetap di antrean petugas.
    await catatGalat("ekyc-setuju", new Error(putus.galat), `pengajuan ${id}`);
  }
  return [202, { status: "menunggu" }];
}

export type Keputusan =
  | { setuju: true; metode: "petugas" | "ekyc"; peninjauId: bigint | null }
  | { setuju: false; alasan: string; peninjauId: bigint };

export const BATAS_ALASAN = 500;

/** Keputusan yang tidak jadi diambil — melempar dari dalam transaksi supaya digulung balik. */
class GagalPutus extends Error {}

const unik = (e: unknown) => (e as { code?: unknown } | null)?.code === "P2002";

/**
 * Setujui atau tolak satu pengajuan `menunggu`. Apa pun keputusannya, NIK polos
 * (ketikan dan hasil OCR) dan path foto dikosongkan, dan fotonya dihapus setelah transaksi selesai.
 * Disetujui: users.ktp_verified_at + ktp_nik_hash diisi — gagal bila NIK itu
 * sudah dipegang akun lain (cek + indeks unik untuk dua peninjau serentak).
 */
export async function putuskanVerifikasi(
  id: bigint,
  k: Keputusan,
  kini = new Date(),
): Promise<{ ok: true } | { ok: false; galat: string }> {
  const alasan = k.setuju ? null : k.alasan.trim().slice(0, BATAS_ALASAN);
  if (!k.setuju && !alasan) return { ok: false, galat: "Tulis alasan penolakan — alasan ini dibaca warga di aplikasi." };

  let foto: (string | null)[];
  try {
    foto = await prisma.$transaction(async (tx) => {
      const v = await tx.mobile_ktp_verifications.findUnique({
        where: { id },
        select: { user_id: true, status: true, nik_hash: true, ktp_path: true, created_at: true },
      });
      if (!v || v.status !== "menunggu" || kedaluwarsa(v.created_at, kini)) {
        throw new GagalPutus("Pengajuan ini sudah diputuskan, kedaluwarsa, atau dihapus.");
      }
      const berkas = [v.ktp_path];
      const ubah = await tx.mobile_ktp_verifications.updateMany({
        where: { id, status: "menunggu" },
        data: {
          status: k.setuju ? "disetujui" : "ditolak",
          method: k.setuju ? k.metode : "petugas",
          reason: alasan,
          reviewer_id: k.peninjauId,
          decided_at: kini,
          nik: null,
          ocr_nik: null,
          ktp_path: null,
        },
      });
      // Peninjau lain memutuskannya di antara baca dan tulis di atas.
      if (ubah.count !== 1) throw new GagalPutus("Pengajuan ini baru saja diputuskan peninjau lain.");
      if (!k.setuju) return berkas;

      const pemegang = await tx.users.findFirst({
        where: { ktp_nik_hash: v.nik_hash, NOT: { id: v.user_id } },
        select: { id: true },
      });
      if (pemegang) throw new GagalPutus(`${GALAT_NIK_DIPAKAI} Tolak pengajuan ini.`);
      await tx.users.update({ where: { id: v.user_id }, data: { ktp_verified_at: kini, ktp_nik_hash: v.nik_hash } });
      // Kiriman ganda yang masih menunggu tidak berarti lagi setelah akunnya disetujui.
      const ganda = await tx.mobile_ktp_verifications.findMany({
        where: { user_id: v.user_id, status: "menunggu" },
        select: { id: true, ktp_path: true },
      });
      if (ganda.length) {
        await tx.mobile_ktp_verifications.deleteMany({ where: { id: { in: ganda.map((g) => g.id) } } });
      }
      return [...berkas, ...ganda.map((g) => g.ktp_path)];
    });
  } catch (e) {
    if (e instanceof GagalPutus) return { ok: false, galat: e.message };
    if (unik(e)) return { ok: false, galat: `${GALAT_NIK_DIPAKAI} Tolak pengajuan ini.` };
    throw e;
  }
  await hapusFotoSemua(foto);
  return { ok: true };
}

// ── Sapuan ───────────────────────────────────────────────────────────────────

/**
 * Hapus pengajuan `menunggu` yang sudah UMUR_PENGAJUAN_MS beserta fotonya —
 * statusnya kembali "belum". Dipanggil saat status akun dibaca (per akun) dan
 * saat antrean CMS dibuka (semua, plus foto yatim). Mengembalikan jumlahnya.
 */
export async function sapuKedaluwarsa(kini = new Date(), userId?: bigint): Promise<number> {
  const batas = new Date(kini.getTime() - UMUR_PENGAJUAN_MS);
  const basi = await prisma.mobile_ktp_verifications.findMany({
    where: { status: "menunggu", created_at: { lte: batas }, ...(userId !== undefined && { user_id: userId }) },
    select: { id: true, ktp_path: true },
  });
  if (basi.length) {
    await prisma.mobile_ktp_verifications.deleteMany({
      where: { id: { in: basi.map((b) => b.id) }, status: "menunggu" },
    });
    await hapusFotoSemua(basi.map((b) => b.ktp_path));
  }
  if (userId === undefined) await sapuYatim(kini);
  return basi.length;
}

/** Foto tanpa baris lebih tua dari ini dianggap yatim. Jedanya menghindari
 *  foto yang baru ditulis tapi transaksinya belum selesai. */
const UMUR_YATIM_MS = 60 * 60_000;

/**
 * Foto di KTP_DIR yang tidak dirujuk baris mana pun: proses mati di antara
 * tulis berkas dan simpan baris, galat saat menghapus, atau akun yang dihapus
 * dari luar aplikasi (FK cascade menghapus barisnya, bukan berkasnya).
 */
async function sapuYatim(kini: Date): Promise<void> {
  const folder = folderKtp();
  if (!folder) return;
  try {
    const nama = (await readdir(folder).catch(() => [] as string[])).filter((n) => NAMA_FOTO.test(n));
    if (!nama.length) return;
    const dirujuk = await prisma.mobile_ktp_verifications.findMany({
      where: { ktp_path: { in: nama } },
      select: { ktp_path: true },
    });
    const terpakai = new Set(dirujuk.map((d) => d.ktp_path));
    for (const n of nama) {
      if (terpakai.has(n)) continue;
      const info = await stat(path.join(folder, n)).catch(() => null);
      if (info && kini.getTime() - info.mtimeMs >= UMUR_YATIM_MS) await hapusFoto(n);
    }
  } catch (e) {
    await catatGalat("sapu-yatim-ktp", e);
  }
}

/**
 * Bagian hapus akun (DELETE /api/mobile/saya), di dalam transaksinya: baris
 * pengajuan dihapus, nama fotonya dikembalikan untuk dihapus SETELAH transaksi
 * berhasil (hapusFotoSemua) — gagal di tengah tidak meninggalkan baris tanpa foto.
 */
export async function hapusVerifikasiAkun(tx: Prisma.TransactionClient, userId: bigint): Promise<(string | null)[]> {
  const baris = await tx.mobile_ktp_verifications.findMany({
    where: { user_id: userId },
    select: { ktp_path: true },
  });
  await tx.mobile_ktp_verifications.deleteMany({ where: { user_id: userId } });
  return baris.map((b) => b.ktp_path);
}
