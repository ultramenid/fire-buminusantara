import { prisma } from "@/lib/prisma";
import { pastikanBolehKelola } from "@/lib/sesi";
import { bacaFoto } from "@/lib/verifikasi-ktp";

/** Tidak boleh tersimpan di cache mana pun (peramban bersama, proxy, CDN). */
const TANPA_CACHE = "private, no-store, max-age=0";

/**
 * GET /api/admin/verifikasi/:id — foto KTP pengajuan verifikasi untuk halaman
 * peninjau /admin/verifikasi.
 *
 * Hanya admin/editor CMS, dan hanya selama pengajuannya menunggu: begitu
 * diputuskan path-nya dikosongkan dan berkasnya dihapus. Foto tidak pernah
 * lewat /media atau folder publik mana pun (lihat lib/verifikasi-ktp.ts).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await pastikanBolehKelola())) {
    return Response.json({ galat: "Masuk dulu." }, { status: 401, headers: { "Cache-Control": TANPA_CACHE } });
  }
  const { id } = await params;
  const tidakAda = () => new Response("Tidak ditemukan.", { status: 404, headers: { "Cache-Control": TANPA_CACHE } });
  if (!/^\d{1,18}$/.test(id)) return tidakAda();

  const v = await prisma.mobile_ktp_verifications.findUnique({
    where: { id: BigInt(id) },
    select: { status: true, ktp_path: true },
  });
  if (v?.status !== "menunggu") return tidakAda();
  const foto = await bacaFoto(v.ktp_path);
  if (!foto) return tidakAda();

  return new Response(new Uint8Array(foto.isi), {
    headers: {
      "Content-Type": foto.mime,
      "Content-Length": String(foto.isi.length),
      "Cache-Control": TANPA_CACHE,
      "Content-Disposition": "inline",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
