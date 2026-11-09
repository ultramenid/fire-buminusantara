import { penggunaDari } from "@/lib/akun-mobile";
import { bacaJson } from "@/lib/batas-badan";
import { lewatBatas, lewatBatasIp } from "@/lib/batas-laju";
import { tokenWarga } from "@/lib/siaran";
import { ipDari } from "@/lib/turnstile";

const TERLALU_SERING = () => Response.json({ galat: "Terlalu sering. Coba lagi sebentar lagi." }, { status: 429 });

/**
 * POST /api/mobile/live/tonton { ruang, pratinjau? } → { url, token } untuk
 * menonton siaran publik. Tanpa Bearer sah token hanya untuk menonton
 * (canPublishData: false): komentar, hati, dan hadiah butuh akun.
 * `pratinjau: true` = video bisu di hero beranda & kisi tab Live: peserta
 * tersembunyi, tanpa akun (lihat tokenWarga).
 */
export async function POST(req: Request) {
  const ip = ipDari(req);
  const isi = await bacaJson(req);
  if (isi instanceof Response) return isi;
  const ruang = String(isi?.ruang ?? "").slice(0, 100);

  // Pratinjau diminta otomatis setiap kartu siaran tampil, tanpa ketukan: jatahnya
  // terpisah, supaya menggulir beranda tidak menghabiskan jatah menonton sungguhan.
  if (isi?.pratinjau === true) {
    if (await lewatBatasIp("pratinjau", ip, 120, 600)) return TERLALU_SERING();
    if (await lewatBatasIp(`pratinjau:${ruang}`, ip, 20, 600)) return TERLALU_SERING();
    const [status, jawab] = await tokenWarga(ruang, null, true);
    return Response.json(jawab, { status });
  }

  if (await lewatBatasIp("tonton", ip, 60, 600)) return TERLALU_SERING();
  const pengguna = await penggunaDari(req);
  // Per ruang: satu pengirim tidak boleh mengisi 50 kursi warga atau menghabiskan
  // jatah token ruang itu sendirian. Akun dihitung per akun, bukan per IP (CGNAT).
  const terlalu = pengguna
    ? await lewatBatas(`tonton-akun:${pengguna.id}:${ruang}`, 5, 600)
    : await lewatBatasIp(`tonton:${ruang}`, ip, 5, 600);
  if (terlalu) return TERLALU_SERING();
  const [status, jawab] = await tokenWarga(ruang, pengguna);
  return Response.json(jawab, { status });
}
