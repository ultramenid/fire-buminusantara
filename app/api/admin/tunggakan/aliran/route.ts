import { pastikanBolehKelola } from "@/lib/sesi";
import { hitungTunggakan } from "@/lib/tunggakan";
import { berlanggananTunggakan } from "@/lib/loket-tunggakan";

// Koneksi ini bertahan selama tab CMS terbuka dan berbagi EventEmitter dengan
// server action pengirim laporan — keduanya harus di proses Node yang sama.
// Tanpa `export const runtime`: Cache Components menolak konfigurasi segmen
// itu, dan runtime Node memang sudah bawaannya.

/** Komentar keep-alive. Proxy dan load balancer memutus koneksi yang diam;
 *  20 detik aman di bawah batas idle 60 detik yang lazim dipakai nginx. */
const DETAK_MS = 20_000;

/** Jaring pengaman: pengumuman dalam-proses tidak menyeberang replika (dan
 *  perubahan langsung di database tidak mengumumkan apa pun), jadi angkanya
 *  tetap dicek berkala. Inilah batas atas keterlambatan terburuk. */
const JARING_MS = 30_000;

/**
 * Aliran angka tunggakan untuk lencana menu CMS (Server-Sent Events).
 *
 * SSE, bukan WebSocket: arusnya satu arah (server → tab), lewat HTTP biasa,
 * dan browser menyambung ulang sendiri — tidak perlu server kustom di samping
 * `next start` standalone.
 */
export async function GET(req: Request) {
  // Angka antrean moderasi bukan konsumsi publik. Hanya pengguna dengan peran
  // yang berwenang (admin/editor) yang boleh mengakses aliran ini.
  const sesi = await pastikanBolehKelola();
  if (!sesi) {
    return new Response("Tidak berwenang.", { status: 401 });
  }

  const penyandi = new TextEncoder();
  let hidup = true;
  // Satu ledakan verifikasi bisa memicu banyak pengumuman beruntun; penjaga
  // ini mencegah kueri COUNT yang tumpang tindih, dan `lagi` memastikan
  // perubahan terakhir tetap terkirim sesudah kueri yang sedang jalan selesai.
  let sedangKirim = false;
  let adaSusulan = false;
  let tutup = () => {};

  const aliran = new ReadableStream<Uint8Array>({
    start(kendali) {
      const tulis = (teks: string) => {
        if (!hidup) return;
        try {
          kendali.enqueue(penyandi.encode(teks));
        } catch {
          // Peramban sudah pergi tanpa sempat memicu abort.
          tutup();
        }
      };

      const kirim = async () => {
        if (!hidup) return;
        if (sedangKirim) {
          adaSusulan = true;
          return;
        }
        sedangKirim = true;
        try {
          tulis(`data: ${JSON.stringify(await hitungTunggakan())}\n\n`);
        } catch {
          // Database sesaat tak terjangkau bukan alasan memutus aliran —
          // detak jaring berikutnya mencoba lagi.
        } finally {
          sedangKirim = false;
          if (adaSusulan && hidup) {
            adaSusulan = false;
            void kirim();
          }
        }
      };

      const lepasLangganan = berlanggananTunggakan(() => void kirim());
      const jaring = setInterval(() => void kirim(), JARING_MS);
      const detak = setInterval(() => tulis(": detak\n\n"), DETAK_MS);

      tutup = () => {
        if (!hidup) return;
        hidup = false;
        lepasLangganan();
        clearInterval(jaring);
        clearInterval(detak);
        req.signal.removeEventListener("abort", tutup);
        try {
          kendali.close();
        } catch {}
      };

      req.signal.addEventListener("abort", tutup);

      // Angka pertama dikirim segera supaya tab yang baru menyambung tidak
      // menampilkan nilai render lamanya sampai perubahan berikutnya.
      void kirim();
    },
    cancel() {
      tutup();
    },
  });

  return new Response(aliran, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, no-transform",
      Connection: "keep-alive",
      // nginx menyangga respons proksi secara bawaan: tanpa ini pesan menumpuk
      // di buffer dan tak pernah sampai ke tab CMS.
      "X-Accel-Buffering": "no",
    },
  });
}
