import { catatGalat } from "./catat-galat.ts";
import type { MasukanEkyc, Pemeriksaan } from "./ekyc.ts";
import { periksaNik } from "./nik.ts";

/**
 * Penyedia eKYC "paddleocr" (EKYC_PROVIDER=paddleocr): layanan OCR internal
 * (layanan/ocr-ktp, PaddleOCR) membaca teks foto KTP, lalu NIK yang tercetak
 * dibandingkan dengan NIK ketikan warga.
 *
 * Batasnya jelas: OCR hanya MEMBACA. Ia tidak memeriksa keaslian KTP atau data
 * Dukcapil. Karena itu:
 *   - KTP_OCR_MODE=bantu (bawaan): tidak pernah memutuskan apa pun. Hasilnya
 *     disimpan di pengajuan dan tampil sebagai lencana untuk petugas.
 *   - KTP_OCR_MODE=otomatis: NIK cocok DAN skor baca ≥ AMBANG_OTOMATIS →
 *     langsung disetujui (metode "ekyc"). Selain itu tetap ke petugas.
 *   - OCR TIDAK PERNAH menolak: "beda" atau "tak terbaca" bisa saja foto yang
 *     buram atau silau, bukan pemalsuan.
 * Layanan mati / lambat = "gagal" → antrean petugas; pengajuan tetap tersimpan.
 */

export type HasilOcr = "cocok" | "beda" | "tak_terbaca" | "gagal";
export type CatatanOcr = { hasil: HasilOcr; nik: string | null; skor: number | null };
export type BarisOcr = { teks: string; skor: number };

/** Skor baca minimum baris NIK untuk persetujuan otomatis (mode otomatis). */
export const AMBANG_OTOMATIS = 0.9;

export type ModeOcr = "bantu" | "otomatis";

export function modeOcr(env: Record<string, string | undefined> = process.env): ModeOcr {
  return env.KTP_OCR_MODE?.trim().toLowerCase() === "otomatis" ? "otomatis" : "bantu";
}

// ── Membaca NIK dari baris OCR ───────────────────────────────────────────────

/** Huruf yang sering tertukar dengan angka di hasil OCR — diganti HANYA di dalam
 *  token yang memang berisi angka, jadi "BOGOR" atau "SD" tidak tersentuh. */
const KE_ANGKA: Record<string, string> = { O: "0", o: "0", D: "0", I: "1", l: "1", "|": "1", S: "5", B: "8", Z: "2" };
const TOKEN_ANGKA = /^[0-9OoDIl|SBZ]+$/;
/** Label "NIK" — termasuk salah baca N1K / NlK / N|K. Tanpa flag i: kelas
 *  angka di LABEL_MENEMPEL tidak boleh ikut menerima huruf kecil lain. */
const LABEL_NIK = /^[Nn][I1l|i][Kk]$/;
const LABEL_MENEMPEL = /^([Nn][I1l|i][Kk])([0-9OoDIl|SBZ]{4,})$/;

/** Pisah baris menjadi token; "NIK3201…" (label menempel) dipisah dua. NFKC dulu: PaddleOCR
 *  menulis titik dua lebar "：" ("NIK：3201…", terukur pada model latin PP-OCRv5) dan kadang angka lebar. */
function tokenBaris(teks: string): string[] {
  return teks
    .normalize("NFKC")
    .split(/[\s:;.,=_\-–—]+/)
    .filter(Boolean)
    .flatMap((t) => {
      const m = LABEL_MENEMPEL.exec(t);
      return m ? [m[1], m[2]] : [t];
    });
}

/** Deret angka dalam satu baris: token berangka yang berurutan disambung
 *  ("3201 0141 0190 0001" → satu deret), huruf kembar angka dinormalkan. */
function deretBaris(teks: string): { deret: string[]; awal: boolean; akhir: boolean } {
  const token = tokenBaris(teks);
  const angka = (t: string) => TOKEN_ANGKA.test(t) && /\d/.test(t);
  const deret: string[] = [];
  let kini = "";
  for (const t of token) {
    if (angka(t)) {
      kini += [...t].map((c) => KE_ANGKA[c] ?? c).join("");
    } else if (kini) {
      deret.push(kini);
      kini = "";
    }
  }
  if (kini) deret.push(kini);
  return { deret, awal: token.length > 0 && angka(token[0]), akhir: token.length > 0 && angka(token[token.length - 1]) };
}

/** Calon NIK dari satu deret: tepat 16 angka apa adanya; deret lebih panjang
 *  hanya jendela 16 angka yang lolos periksaNik (bukan sembarang potongan). */
function calonDari(angka: string): { nik: string; sah: boolean }[] {
  if (angka.length === 16) return [{ nik: angka, sah: periksaNik(angka) === null }];
  const hasil: { nik: string; sah: boolean }[] = [];
  for (let i = 0; i + 16 <= angka.length; i++) {
    const nik = angka.slice(i, i + 16);
    if (periksaNik(nik) === null) hasil.push({ nik, sah: true });
  }
  return hasil;
}

/**
 * NIK yang tercetak di foto KTP, dari baris-baris OCR (urutan atas ke bawah),
 * atau null bila tidak terbaca. `skor` = skor baca terendah dari baris asal
 * angkanya.
 *
 * Prioritas: deret 16 angka pada/sesudah baris berlabel "NIK" (yang lolos
 * periksaNik dulu, lalu yang tidak — salah baca satu angka tetap NIK di
 * fotonya, dan dilaporkan "beda"); kalau tidak ada, deret 16 angka di mana
 * pun yang lolos periksaNik. Angka yang terpotong ke baris berikutnya ikut
 * disambung.
 */
export function nikDariOcr(baris: BarisOcr[]): { nik: string; skor: number } | null {
  const per = baris.map((b) => ({ ...deretBaris(b.teks), skor: b.skor }));
  const calon: { nik: string; sah: boolean; skor: number; baris: number }[] = [];
  per.forEach((p, i) => {
    for (const d of p.deret) for (const c of calonDari(d)) calon.push({ ...c, skor: p.skor, baris: i });
    // Deret yang terpotong di akhir baris dan berlanjut di awal baris berikutnya.
    const lanjut = per[i + 1];
    if (p.akhir && lanjut?.awal) {
      const sambung = p.deret[p.deret.length - 1] + lanjut.deret[0];
      for (const c of calonDari(sambung)) calon.push({ ...c, skor: Math.min(p.skor, lanjut.skor), baris: i });
    }
  });

  const label = baris.findIndex((b) => tokenBaris(b.teks).some((t) => LABEL_NIK.test(t)));
  const sesudahLabel = label >= 0 ? calon.filter((c) => c.baris >= label) : [];
  const pilih = sesudahLabel.find((c) => c.sah) ?? sesudahLabel[0] ?? calon.find((c) => c.sah);
  return pilih ? { nik: pilih.nik, skor: pilih.skor } : null;
}

export function bandingkanNik(bacaan: { nik: string; skor: number } | null, nikKetikan: string): CatatanOcr {
  if (!bacaan) return { hasil: "tak_terbaca", nik: null, skor: null };
  return { hasil: bacaan.nik === nikKetikan ? "cocok" : "beda", nik: bacaan.nik, skor: bacaan.skor };
}

/** Jawaban layanan OCR: { baris: [{ teks, skor }] } — selain bentuk itu = rusak. */
function bacaJawaban(isi: unknown): BarisOcr[] {
  const baris = (isi as { baris?: unknown } | null)?.baris;
  if (!Array.isArray(baris)) throw new Error("jawaban OCR tanpa `baris`");
  return baris.flatMap((b) => {
    const { teks, skor } = (b ?? {}) as { teks?: unknown; skor?: unknown };
    return typeof teks === "string" && typeof skor === "number" && Number.isFinite(skor) ? [{ teks, skor }] : [];
  });
}

/** Hasil OCR → keputusan eKYC. "beda" bukan penolakan: tetap ke petugas. */
export function keputusanOcr(ocr: CatatanOcr, mode: ModeOcr): Pemeriksaan {
  const lolos = mode === "otomatis" && ocr.hasil === "cocok" && (ocr.skor ?? 0) >= AMBANG_OTOMATIS;
  const hasil = lolos ? "lolos" : ocr.hasil === "gagal" ? "tidak-tersedia" : ocr.hasil === "beda" ? "gagal" : "ragu";
  return { hasil, ocr };
}

const GAGAL: CatatanOcr = { hasil: "gagal", nik: null, skor: null };

/**
 * Adaptor PenyediaEkyc: kirim foto KTP (sudah tanpa EXIF) ke POST {OCR_URL}/ocr
 * dengan kunci X-Kunci-OCR, baca NIK-nya, bandingkan. Teks hasil OCR tidak
 * pernah dicatat — isinya data pribadi (nama, alamat, tanggal lahir).
 */
export async function periksaPaddleOcr(
  m: MasukanEkyc,
  env: Record<string, string | undefined> = process.env,
  ambil: typeof fetch = fetch,
): Promise<Pemeriksaan> {
  const mode = modeOcr(env);
  const url = env.OCR_URL?.trim().replace(/\/+$/, "");
  const kunci = env.OCR_KUNCI ?? "";
  if (!url || !kunci) {
    void catatGalat("ocr-ktp", new Error("EKYC_PROVIDER=paddleocr tetapi OCR_URL atau OCR_KUNCI kosong"));
    return keputusanOcr(GAGAL, mode);
  }
  let baris: BarisOcr[];
  try {
    const isi = new FormData();
    isi.set("gambar", new Blob([new Uint8Array(m.ktp.isi)], { type: m.ktp.mime }), "ktp");
    const r = await ambil(`${url}/ocr`, { method: "POST", body: isi, headers: { "X-Kunci-OCR": kunci }, signal: m.sinyal });
    if (!r.ok) throw new Error(`layanan OCR menjawab HTTP ${r.status}`);
    baris = bacaJawaban(await r.json());
  } catch (e) {
    // Hanya nama/pesan galat jaringan — bukan isi jawaban.
    void catatGalat("ocr-ktp", e instanceof Error ? new Error(`${e.name}: ${e.message}`) : new Error("galat OCR"));
    return keputusanOcr(GAGAL, mode);
  }
  return keputusanOcr(bandingkanNik(nikDariOcr(baris), m.nik), mode);
}
