import { type BarisPengguna, galat, penggunaDari } from "@/lib/akun-mobile";
import { bacaFormData } from "@/lib/batas-badan";
import { lewatBatas, lewatBatasIp, sudahLewat, sudahLewatIp } from "@/lib/batas-laju";
import { buangBadan } from "@/lib/batas-laporan";
import { catatGalat } from "@/lib/catat-galat";
import { periksaNik, rapikanNik } from "@/lib/nik";
import { ipDari } from "@/lib/turnstile";
import {
  ajukanVerifikasi, BATAS_BADAN_KTP, folderKtp, type HasilAjuan, kunciNik, siapkanFoto, statusVerifikasi,
  sudahTerverifikasi,
} from "@/lib/verifikasi-ktp";

/**
 * GET /api/mobile/saya/verifikasi
 * → { status: "belum" | "menunggu" | "disetujui" | "ditolak", alasan, diajukan, diputuskan }
 *
 * Status verifikasi KTP akun — syarat siaran langsung publik. `alasan` hanya
 * terisi bila ditolak; waktu dalam ISO 8601. Pengajuan yang 30 hari tidak
 * diputuskan kembali menjadi "belum" (lib/verifikasi-ktp.ts).
 */
export async function GET(req: Request) {
  const p = await penggunaDari(req);
  if (!p) return galat("Masuk dulu.", 401);
  return Response.json(await statusVerifikasi(p.id));
}

const SEHARI = 24 * 60 * 60;
/** Pengajuan tersimpan (atau dijawab "NIK sudah dipakai") per hari. Per IP lebih
 *  longgar: warga di balik NAT operator seluler berbagi satu IP. */
const BATAS_AKUN = 5;
const BATAS_IP = 20;
/** Semua percobaan yang sampai ke badan kiriman, termasuk yang gagal validasi. */
const COBA_AKUN = 15;
const COBA_IP = 60;

/**
 * POST /api/mobile/saya/verifikasi (multipart: nik, ktp)
 * → 202 { status: "menunggu" } | 200 { status: "disetujui" } (eKYC lolos)
 *
 * Cukup foto KTP. Bidang `selfie` dari aplikasi versi lama diabaikan — tidak
 * dibaca, tidak disimpan, dan tidak menjadi galat.
 *
 * Galat `{ galat }`: 401 belum masuk · 409 sudah terverifikasi / NIK dipakai
 * akun lain · 413 foto > 8 MB atau kiriman terlalu besar · 400 foto bukan
 * JPEG/PNG/WebP, rusak, atau tidak ada · 422 NIK · 429 batas harian ·
 * 503 server belum disiapkan (KTP_NIK_SECRET) atau sedang sibuk.
 *
 * Pengajuan baru menggantikan yang menunggu/ditolak sebelumnya (fotonya
 * dihapus). Seperti POST /api/mobile/laporan, semua yang bisa diputuskan dari
 * header diputuskan sebelum badan dibaca, dan penolakan dini membuang sisa
 * badan dulu supaya jawabannya sampai ke aplikasi (bukan galat jaringan iOS).
 */
export async function POST(req: Request) {
  const p = await penggunaDari(req);
  if (!p) {
    await buangBadan(req);
    return galat("Masuk dulu.", 401);
  }

  // Fail-closed: tanpa kunci HMAC, NIK tidak bisa disidik dengan aman.
  const kunci = kunciNik();
  if (!kunci || !folderKtp()) {
    void catatGalat(
      "verifikasi-ktp",
      new Error(kunci ? "KTP_DIR menunjuk ke folder yang dilayani publik" : "KTP_NIK_SECRET kosong atau kurang dari 32 karakter"),
    );
    await buangBadan(req);
    return galat("Verifikasi KTP belum disiapkan di server. Coba lagi nanti.", 503);
  }

  if (Number(req.headers.get("content-length") ?? 0) > BATAS_BADAN_KTP) {
    return galat("Kiriman terlalu besar. Foto KTP paling besar 8 MB.", 413);
  }

  // Jatah harian hanya dibaca di sini dan dipakai setelah hasilnya jelas (di
  // terima); ember "coba" yang longgar dipakai di muka, menahan banjir kiriman.
  const ip = ipDari(req);
  if (
    (await sudahLewat(`ktp-akun:${p.id}`, BATAS_AKUN)) ||
    (await sudahLewatIp("ktp", ip, BATAS_IP)) ||
    (await lewatBatas(`ktp-coba-akun:${p.id}`, COBA_AKUN, SEHARI)) ||
    (await lewatBatasIp("ktp-coba", ip, COBA_IP, SEHARI))
  ) {
    await buangBadan(req);
    return galat("Terlalu banyak pengajuan verifikasi. Coba lagi besok.", 429);
  }

  if (await sudahTerverifikasi(p.id)) {
    await buangBadan(req);
    return galat("Akun ini sudah terverifikasi.", 409);
  }

  return bergiliranKtp(req, () => terima(req, p, ip, kunci));
}

async function terima(req: Request, p: BarisPengguna, ip: string | null, kunci: string): Promise<Response> {
  const data = await bacaFormData(req, BATAS_BADAN_KTP);
  if (data instanceof Response) return data;
  if (!data) return galat("Kiriman tidak bisa dibaca server.", 400);

  const nik = rapikanNik(data.get("nik"));
  const salahNik = periksaNik(nik);
  if (salahNik) return galat(salahNik, 422);

  const ktp = await siapkanFoto(data.get("ktp"), "Foto KTP");
  if ("galat" in ktp) return galat(ktp.galat, ktp.status);

  let hasil: HasilAjuan;
  try {
    hasil = await ajukanVerifikasi(p, nik, ktp, kunci);
  } catch (e) {
    await catatGalat("verifikasi-ktp", e, `akun ${p.id}`);
    return galat("Gagal menyimpan pengajuan. Coba lagi.", 500);
  }
  // Jatah harian dipakai pengajuan yang tersimpan DAN jawaban "NIK sudah
  // dipakai": jawaban itu membocorkan apakah sebuah NIK terdaftar di sini,
  // jadi tidak boleh bisa ditanyakan berulang-ulang.
  await lewatBatas(`ktp-akun:${p.id}`, BATAS_AKUN, SEHARI);
  await lewatBatasIp("ktp", ip, BATAS_IP, SEHARI);
  return Response.json(hasil[1], { status: hasil[0] });
}

/**
 * Kiriman yang badannya disangga bersamaan (≤ 16 MB, ±3× itu saat diurai),
 * untuk SATU PROSES — terpisah dari jatah laporan (lib/batas-laporan.ts
 * bergiliran) supaya verifikasi tidak menahan unggahan laporan kebakaran.
 */
const BATAS_SERENTAK_KTP = 4;

async function bergiliranKtp(req: Request, kerja: () => Promise<Response>): Promise<Response> {
  // globalThis, bukan variabel modul: bundler bisa memberi tiap rute salinan modulnya.
  const g = globalThis as { __ktpSerentak?: { n: number } };
  const j = (g.__ktpSerentak ??= { n: 0 });
  if (j.n >= BATAS_SERENTAK_KTP) {
    await buangBadan(req);
    return galat("Server sedang sibuk. Coba kirim lagi sebentar lagi.", 503);
  }
  j.n++;
  try {
    return await kerja();
  } finally {
    j.n--;
  }
}
