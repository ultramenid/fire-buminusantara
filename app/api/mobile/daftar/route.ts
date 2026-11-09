import { buatSesiMobile, daftarEmail, galat, publik, rapikanEmail } from "@/lib/akun-mobile";
import { bacaJson } from "@/lib/batas-badan";
import { lewatBatasIp } from "@/lib/batas-laju";
import { ipDari } from "@/lib/turnstile";

/**
 * POST /api/mobile/daftar { nama, email, sandi } → 201 { token, pengguna }
 *
 * Daftar akun warga dengan email & kata sandi, lalu langsung masuk. Tanpa
 * verifikasi email (lihat daftarEmail di lib/akun-mobile.ts); email yang sudah
 * terdaftar → 409.
 */
export async function POST(req: Request) {
  const ip = ipDari(req);
  if (await lewatBatasIp("daftar-mobile", ip, 5, 3600)) {
    return galat("Terlalu banyak pendaftaran dari jaringan ini. Coba lagi dalam 1 jam.", 429);
  }
  const isi = await bacaJson(req);
  if (isi instanceof Response) return isi;

  const pengguna = await daftarEmail(String(isi?.nama ?? ""), rapikanEmail(isi?.email), String(isi?.sandi ?? ""));
  if ("galat" in pengguna) return galat(pengguna.galat, pengguna.status);
  return Response.json({ token: await buatSesiMobile(pengguna.id), pengguna: publik(pengguna) }, { status: 201 });
}
