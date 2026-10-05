"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { simpanLaporanPublik, type HasilLapor } from "@/lib/laporan-publik";
import { ipDari, turnstileSah } from "@/lib/turnstile";
import { buatTiket } from "@/lib/tiket-lapor";
import { lewatBatas } from "@/lib/batas-laju";

/** Keadaan yang dibaca form lewat useActionState. `null` = belum ada kiriman. */
export type KeadaanLapor = HasilLapor | null;

/**
 * Tukar token Turnstile (umur 300 dtk) dengan tiket 30 menit SEBELUM unggahan
 * besar berangkat — lihat lib/tiket-lapor.ts. Permintaannya kecil, jadi token
 * diperiksa selagi masih segar. `null` = captcha gagal.
 */
export async function mintaTiketLapor(token: string): Promise<string | null> {
  const ip = ipDari(new Request("http://lokal", { headers: await headers() }));
  return (await turnstileSah(token || null, ip)) ? buatTiket() : null;
}

/**
 * Terima laporan warga.
 *
 * Server action, bukan route JSON seperti komentar: yang dikirim di sini
 * termasuk berkas, dan <form> yang menyerahkan FormData apa adanya membuat
 * berkasnya sampai ke server tanpa disentuh sedikit pun — tidak ada langkah
 * baca-ulang di klien yang bisa menggugurkan EXIF gambar.
 *
 * Batas ukuran badannya disetel di next.config.ts (100 MB).
 */
export async function kirimLaporan(
  _sebelumnya: KeadaanLapor,
  data: FormData,
): Promise<KeadaanLapor> {
  // Server action tidak menerima Request, jadi headernya diambil sendiri.
  const kepala = await headers();
  const ip = ipDari(new Request("http://lokal", { headers: kepala }));

  // Captcha bukan satu-satunya gerbang: kebun pemecah captcha bisa mengisi
  // MinIO 100 MB per kiriman. 5 laporan / 10 menit / IP cukup untuk warga
  // yang melapor beruntun. Tanpa IP tepercaya (TRUSTED_PROXY_HOPS) tidak
  // dibatasi — IP palsu dari header bisa membuat warga lain terkunci.
  if (ip && (await lewatBatas(`lapor:${ip}`, 5, 600))) {
    return { ok: false, galat: "Terlalu banyak laporan dari jaringan ini. Coba lagi dalam 10 menit." };
  }

  const hasil = await simpanLaporanPublik(data, ip);
  if (hasil.ok || Boolean((hasil as { sukses?: boolean }).sukses)) {
    revalidatePath("/[locale]", "page");
    revalidatePath("/[locale]/lapor", "page");
    // Umpan landing karhutla membaca kejadian tayang yang sama.
    revalidatePath("/[locale]/karhutla", "page");
  }
  return hasil;
}
