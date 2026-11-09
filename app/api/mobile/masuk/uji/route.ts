import { buatSesiMobile, masukUjiBoleh, penggunaUji, publik } from "@/lib/akun-mobile";
import { bacaJson } from "@/lib/batas-badan";

/**
 * POST /api/mobile/masuk/uji { nama, kode? } → { token, pengguna }
 *
 * Masuk tanpa OAuth Google untuk menguji aplikasi: tombol "Masuk uji" muncul di
 * dev server dan di build preview internal. Tanpa MOBILE_MASUK_UJI=1 — dan di
 * produksi tanpa `kode` yang cocok dengan MOBILE_MASUK_UJI_KODE — rute ini tidak
 * ada (404), termasuk untuk badan yang tidak sah. Lihat masukUjiBoleh.
 */
export async function POST(req: Request) {
  const isi = await bacaJson(req);
  if (isi instanceof Response || !masukUjiBoleh(isi?.kode)) return new Response(null, { status: 404 });
  const pengguna = await penggunaUji(String(isi?.nama ?? ""));
  return Response.json({ token: await buatSesiMobile(pengguna.id), pengguna: publik(pengguna) });
}
