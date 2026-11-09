import { buatSesiMobile, galat, penggunaEmail, publik, rapikanEmail, sidikToken } from "@/lib/akun-mobile";
import { bacaJson } from "@/lib/batas-badan";
import { lewatBatas, lewatBatasIp } from "@/lib/batas-laju";
import { ipDari } from "@/lib/turnstile";

/**
 * POST /api/mobile/masuk/email { email, sandi } → { token, pengguna }
 *
 * Masuk aplikasi dengan email & kata sandi: akun yang didaftarkan dari aplikasi
 * (POST /api/mobile/daftar) atau akun situs lama. Jatah per IP sama dengan masuk
 * Google/Apple, ditambah jatah per email supaya satu akun tidak bisa ditebak
 * kata sandinya dari banyak IP.
 */
export async function POST(req: Request) {
  const ip = ipDari(req);
  if (await lewatBatasIp("masuk-mobile", ip, 20, 600)) {
    return galat("Terlalu banyak percobaan masuk. Coba lagi dalam 10 menit.", 429);
  }
  const isi = await bacaJson(req);
  if (isi instanceof Response) return isi;
  const email = rapikanEmail(isi?.email);
  const sandi = String(isi?.sandi ?? "");
  if (!email || !sandi) return galat("Isi email dan kata sandi.", 422);
  if (await lewatBatas(`masuk-email:${sidikToken(email)}`, 10, 900)) {
    return galat("Terlalu banyak percobaan untuk email ini. Coba lagi dalam 15 menit.", 429);
  }

  const pengguna = await penggunaEmail(email, sandi);
  if ("galat" in pengguna) return galat(pengguna.galat, pengguna.status);
  return Response.json({ token: await buatSesiMobile(pengguna.id), pengguna: publik(pengguna) });
}
