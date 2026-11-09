import { penggunaDari } from "@/lib/akun-mobile";
import { bacaJson } from "@/lib/batas-badan";
import { lewatBatas, lewatBatasIp } from "@/lib/batas-laju";
import { tokenPelapor } from "@/lib/siaran";
import { ipDari } from "@/lib/turnstile";
import { statusVerifikasi, sudahTerverifikasi } from "@/lib/verifikasi-ktp";

/**
 * POST /api/mobile/live/token { judul, nama, anonim, publik, lat, lng }
 * → { url, token, ruang }. Dengan token akun (dan tidak anonim), nama pelapor
 * diambil dari akun bila kosong — siaran publik selalu memakai nama akun.
 *
 * Siaran publik (tampil di beranda semua warga, tanpa moderasi lebih dulu)
 * wajib akun, tidak boleh anonim, dan akunnya wajib lolos verifikasi KTP
 * (lib/verifikasi-ktp.ts) — harus ada orang sungguhan yang bisa dilaporkan dan
 * dimintai tanggung jawab. Belum terverifikasi → 403 { galat, verifikasi:
 * "belum" | "menunggu" | "ditolak" }, dan aplikasi membuka layar verifikasi.
 *
 * Aplikasi kini selalu mengirim publik: true. Permintaan TANPA publik (siaran
 * khusus petugas, dari versi aplikasi lama) tetap boleh tamu/anonim dan tidak
 * butuh verifikasi — siarannya tidak tampil ke warga lain.
 */
export async function POST(req: Request) {
  const ip = ipDari(req);
  // Siaran lebih mahal dari laporan: 3 siaran / 10 menit / IP.
  if (await lewatBatasIp("live", ip, 3, 600)) {
    return Response.json({ galat: "Terlalu banyak siaran dari jaringan ini. Coba lagi nanti." }, { status: 429 });
  }
  const isi = await bacaJson(req);
  if (isi instanceof Response) return isi;
  if (!isi) return Response.json({ galat: "Kiriman tidak bisa dibaca server." }, { status: 400 });
  const publik = isi.publik === true;
  if (publik && isi.anonim === true) {
    return Response.json({ galat: "Siaran di beranda warga tidak bisa anonim." }, { status: 422 });
  }
  const pengguna = isi.anonim === true ? null : await penggunaDari(req);
  if (publik && !pengguna) {
    return Response.json({ galat: "Masuk dulu untuk menyiarkan ke beranda warga." }, { status: 401 });
  }
  // Sebelum jatah per akun dipakai: akun yang belum terverifikasi tidak
  // menghabiskan jatah siarannya hanya karena ditolak di sini.
  if (publik && pengguna && !(await sudahTerverifikasi(pengguna.id))) {
    const { status } = await statusVerifikasi(pengguna.id);
    return Response.json({ galat: "Verifikasi KTP dulu untuk siaran langsung.", verifikasi: status }, { status: 403 });
  }
  if (pengguna && (await lewatBatas(`live-akun:${pengguna.id}`, 3, 600))) {
    return Response.json({ galat: "Terlalu banyak siaran. Coba lagi nanti." }, { status: 429 });
  }
  const [status, jawab] = await tokenPelapor(isi, pengguna);
  return Response.json(jawab, { status });
}
