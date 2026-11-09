import { galat } from "@/lib/akun-mobile";
import { bacaJson } from "@/lib/batas-badan";
import { lewatBatasIp } from "@/lib/batas-laju";
import { hapusPerangkat, simpanPerangkat, tokenPushSah } from "@/lib/notifikasi-push";
import { ipDari } from "@/lib/turnstile";

const PLATFORM = new Set(["ios", "android"]);

/**
 * PUT /api/mobile/notifikasi { token, platform, live, laporan } → { ok, live, laporan }
 *
 * Mendaftarkan perangkat untuk notifikasi push (lib/notifikasi-push.ts) beserta pilihannya.
 * Tanpa akun: setiap pemasang aplikasi boleh menerima kabar siaran langsung & laporan baru.
 * Aplikasi memanggilnya saat izin notifikasi diberikan, token berganti, atau pilihan diubah.
 */
export async function PUT(req: Request) {
  if (await lewatBatasIp("notifikasi", ipDari(req), 30, 600)) {
    return galat("Terlalu sering. Coba lagi sebentar lagi.", 429);
  }
  const isi = await bacaJson(req);
  if (isi instanceof Response) return isi;
  if (!tokenPushSah(isi?.token)) return galat("Token notifikasi tidak sah.", 422);
  const platform = String(isi?.platform ?? "");
  if (!PLATFORM.has(platform)) return galat("Platform tidak dikenal.", 422);
  const pilihan = { live: isi?.live !== false, laporan: isi?.laporan !== false };
  await simpanPerangkat(isi.token, platform, pilihan);
  return Response.json({ ok: true, ...pilihan });
}

/** DELETE /api/mobile/notifikasi { token } → { ok } — berhenti menerima notifikasi. */
export async function DELETE(req: Request) {
  if (await lewatBatasIp("notifikasi", ipDari(req), 30, 600)) {
    return galat("Terlalu sering. Coba lagi sebentar lagi.", 429);
  }
  const isi = await bacaJson(req);
  if (isi instanceof Response) return isi;
  if (!tokenPushSah(isi?.token)) return galat("Token notifikasi tidak sah.", 422);
  await hapusPerangkat(isi.token);
  return Response.json({ ok: true });
}
