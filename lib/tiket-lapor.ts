import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { lewatBatas } from "./batas-laju.ts";

/**
 * Tiket captcha untuk kiriman laporan yang besar.
 *
 * Token Turnstile hidup 300 detik, tapi dulu baru diperiksa setelah seluruh
 * badan kiriman (sampai 100 MB) tiba — di sinyal 1 Mbps itu ±13 menit, dan
 * warga mendapat "captcha gagal" SETELAH unggahannya selesai. Sekarang form
 * menukar tokennya dulu lewat permintaan kecil (mintaTiketLapor) dengan tiket
 * bertanda tangan HMAC yang berlaku 30 menit, lalu tiket itulah yang menumpang
 * unggahan besar.
 *
 * Sekali pakai: nonce-nya dicatat lewat penghitung batas laju (Redis bila ada,
 * memori bila tidak) — tiket yang sama tidak bisa dipakai mengirim dua laporan.
 *
 * Bentuk: `<kedaluwarsa ms>.<nonce>.<hmac>`.
 */
const UMUR_MS = 30 * 60_000;

function tanda(isi: string): string {
  const rahasia = process.env.SESSION_SECRET;
  if (!rahasia) throw new Error("SESSION_SECRET belum disetel di .env");
  return createHmac("sha256", `tiket-lapor:${rahasia}`).update(isi).digest("base64url");
}

export function buatTiket(kini = Date.now()): string {
  const isi = `${kini + UMUR_MS}.${randomUUID()}`;
  return `${isi}.${tanda(isi)}`;
}

/** true = tiket sah, belum kedaluwarsa, dan baru sekarang dipakai. */
export async function pakaiTiket(tiket: string | null, kini = Date.now()): Promise<boolean> {
  if (!tiket || tiket.length > 200) return false;
  const bagian = tiket.split(".");
  if (bagian.length !== 3) return false;
  const [habis, nonce, sidik] = bagian;
  const harap = Buffer.from(tanda(`${habis}.${nonce}`));
  const dapat = Buffer.from(sidik);
  if (harap.length !== dapat.length || !timingSafeEqual(harap, dapat)) return false;
  if (!(Number(habis) > kini)) return false;
  // Pemakaian kedua (atau lebih) dari nonce yang sama ditolak.
  return !(await lewatBatas(`tiket:${nonce}`, 1, Math.ceil(UMUR_MS / 1000)));
}
