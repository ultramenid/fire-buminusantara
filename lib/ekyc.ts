import { catatGalat } from "./catat-galat.ts";
import { type CatatanOcr, periksaPaddleOcr } from "./ocr-ktp.ts";

/**
 * Pemeriksaan eKYC otomatis (opsional) untuk verifikasi KTP — lihat
 * lib/verifikasi-ktp.ts. Tanpa EKYC_PROVIDER jawabannya selalu
 * "tidak-tersedia" dan pengajuan masuk antrean petugas di /admin/verifikasi,
 * sama seperti "ragu" dan "gagal". Hanya "lolos" yang langsung menyetujui
 * (metode "ekyc"); tidak ada penyedia yang boleh MENOLAK.
 *
 * Penyedia terpasang:
 *   - paddleocr — layanan OCR internal (layanan/ocr-ktp): NIK di foto KTP
 *     dibandingkan NIK ketikan. Lihat lib/ocr-ktp.ts (OCR_URL, OCR_KUNCI,
 *     KTP_OCR_MODE).
 *
 * Menambah penyedia lain (VIDA, Privy, Verihubs, …): tulis adaptor
 * `PenyediaEkyc` (kirim data ke API-nya, terjemahkan jawabannya ke
 * HasilEkyc — jangan pernah "lolos" untuk jawaban yang tidak dipahami),
 * daftarkan di PENYEDIA, setel EKYC_PROVIDER=<nama>, dan perbarui kebijakan
 * privasi aplikasi bila datanya keluar ke pihak ketiga.
 */
export type HasilEkyc = "lolos" | "ragu" | "gagal" | "tidak-tersedia";

/** Hasil satu pemeriksaan; `ocr` disimpan di pengajuan untuk lencana peninjau. */
export type Pemeriksaan = { hasil: HasilEkyc; ocr?: CatatanOcr };

export type MasukanEkyc = {
  /** 16 angka, sudah lolos periksaNik. */
  nik: string;
  /** Nama akun — bukan nama di KTP; penyedia boleh mengabaikannya. */
  nama: string;
  /** Foto KTP, sudah tanpa EXIF. */
  ktp: { isi: Buffer; mime: string };
  /** Batal = jawaban terlalu lama; adaptor wajib meneruskannya ke fetch. */
  sinyal: AbortSignal;
};

export type PenyediaEkyc = (m: MasukanEkyc) => Promise<Pemeriksaan>;

/** ── TITIK SAMBUNG ADAPTOR eKYC ── nama EKYC_PROVIDER → adaptor. */
const PENYEDIA: Record<string, PenyediaEkyc> = {
  paddleocr: (m) => periksaPaddleOcr(m),
};

/** Batas tunggu jawaban penyedia: warga sedang menunggu di layar unggah. */
export const BATAS_TUNGGU_EKYC_MS = 20_000;

const TIDAK_TERSEDIA: Pemeriksaan = { hasil: "tidak-tersedia" };
const HASIL_SAH = new Set<string>(["lolos", "ragu", "gagal", "tidak-tersedia"]);

/**
 * Periksa satu pengajuan lewat penyedia eKYC yang dipasang (EKYC_PROVIDER).
 * Tidak pernah melempar: penyedia tak dikenal, galat jaringan, atau batas
 * waktu = "tidak-tersedia" (dicatat), dan pengajuannya ditinjau petugas.
 */
export async function periksaEkyc(
  m: Omit<MasukanEkyc, "sinyal">,
  daftar: Record<string, PenyediaEkyc> = PENYEDIA,
): Promise<Pemeriksaan> {
  const nama = (process.env.EKYC_PROVIDER ?? "").trim().toLowerCase();
  if (!nama) return TIDAK_TERSEDIA;
  const penyedia = Object.hasOwn(daftar, nama) ? daftar[nama] : undefined;
  if (!penyedia) {
    void catatGalat("ekyc", new Error(`EKYC_PROVIDER "${nama}" tidak dikenal — adaptornya belum ada di lib/ekyc.ts`));
    return TIDAK_TERSEDIA;
  }
  try {
    const p = await penyedia({ ...m, sinyal: AbortSignal.timeout(BATAS_TUNGGU_EKYC_MS) });
    // Jawaban asing tidak pernah dianggap lolos.
    return p && HASIL_SAH.has(p.hasil) ? p : { ...p, hasil: "tidak-tersedia" };
  } catch (e) {
    void catatGalat("ekyc", e, `penyedia ${nama}`);
    return TIDAK_TERSEDIA;
  }
}
