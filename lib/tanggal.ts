const BULAN = [
  "januari", "februari", "maret", "april", "mei", "juni",
  "juli", "agustus", "september", "oktober", "november", "desember",
];

/**
 * "13 Agustus 2026" -> milidetik.
 *
 * Tanggal di payload berita ditulis apa adanya untuk dibaca manusia, jadi
 * penerjemahannya dikerjakan di sini. Yang tak terbaca dikembalikan null dan
 * diperlakukan sebagai "selalu lolos saringan" — lebih baik ikut tampil
 * daripada hilang diam-diam karena format tanggalnya tak terduga.
 */
export function waktuTeks(teks: string | null): number | null {
  if (!teks) return null;
  const bagian = teks.trim().toLowerCase().split(/\s+/);
  if (bagian.length < 3) return null;
  const hari = parseInt(bagian[0], 10);
  const bulan = BULAN.indexOf(bagian[1]);
  const tahun = parseInt(bagian[2], 10);
  if (!hari || bulan < 0 || !tahun) return null;
  return Date.UTC(tahun, bulan, hari);
}

/** "2026-08-11" (nilai <input type="date">) -> milidetik. */
export function waktuIso(iso: string): number | null {
  if (!iso) return null;
  const b = iso.split("-");
  if (b.length !== 3) return null;
  const waktu = Date.UTC(+b[0], +b[1] - 1, +b[2]);
  return isNaN(waktu) ? null : waktu;
}
