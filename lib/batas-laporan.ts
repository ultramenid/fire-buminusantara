/**
 * Batas kiriman laporan warga.
 *
 * Berkas tersendiri, TANPA impor apa pun: angka-angka ini dibaca dua sisi —
 * form di peramban (untuk menahan kiriman sebelum berangkat) dan penyimpan di
 * server (untuk menolak yang lolos). Kalau ia menumpang lib/laporan-publik.ts,
 * mengimpornya dari komponen klien ikut menyeret lib/unggah.ts beserta
 * `node:fs` ke dalam bundel peramban, dan build gagal di sana.
 */

/**
 * Jumlah lampiran per laporan.
 *
 * Bukan sekadar angka enak: seluruh form dikirim sebagai SATU permintaan server
 * action, dan atapnya `serverActions.bodySizeLimit` di next.config.ts. Enam
 * berkas masih muat untuk foto ponsel; kalau semuanya video panjang, batas
 * ukuran total di bawahlah yang menahan lebih dulu.
 */
export const BATAS_BERKAS = 6;

/** Atap ukuran total satu kiriman, disamakan dengan bodySizeLimit. */
export const BATAS_TOTAL_BYTE = 100 * 1024 * 1024;

/** Angka koordinat ketikan warga: papan ketik Indonesia sering memberi koma
 *  desimal ("-1,234"), dan `Number("-1,234")` = NaN. */
function angkaKoordinat(mentah: string): number {
  return Number(mentah.trim().replace(",", "."));
}

/**
 * Koordinat opsional, tapi tidak setengah-setengah: satu tanpa yang lain
 * bukan lokasi, dan menyimpannya begitu hanya menipu peninjau.
 *
 * Dipakai form di peramban (menolak SEBELUM unggahan 100 MB berangkat) dan
 * server (menolak yang lolos), maka tinggal di berkas tanpa impor ini.
 */
export function koordinat(
  latMentah: string,
  lngMentah: string,
): { lat: number; lng: number } | null | { galat: string } {
  const adaLat = latMentah.trim() !== "";
  const adaLng = lngMentah.trim() !== "";
  if (!adaLat && !adaLng) return null;
  if (adaLat !== adaLng) return { galat: "Latitude dan longitude harus diisi berdua." };

  const lat = angkaKoordinat(latMentah);
  const lng = angkaKoordinat(lngMentah);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { galat: "Latitude harus angka antara -90 dan 90." };
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return { galat: "Longitude harus angka antara -180 dan 180." };
  }
  if (lat === 0 && lng === 0) {
    return { galat: "Titik 0, 0 bukan lokasi di Indonesia. Periksa lagi atau kosongkan." };
  }
  return { lat, lng };
}

/** Ukuran berkas untuk dibaca warga ("12.3 MB"), dipakai kedua form lapor. */
export function ukuranTeks(byte: number): string {
  if (byte >= 1024 * 1024) return `${(byte / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(byte / 1024))} KB`;
}
