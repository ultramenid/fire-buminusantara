import { type Bahasa } from "./bahasa.ts";

/** Satu kartu pada strip "Angka hari ini". */
export type Statistik = {
  tanggal: string;
  label: string;
  nilai: string;
  keterangan: string;
};

/**
 * Isi strip statistik, per bahasa.
 *
 * Bawaan strip; CMS (/admin/statistik) menimpanya. `nilai` = angka besar, `keterangan`
 * = penjelas di bawahnya, lengkap dengan sumbernya dalam kurung. `tanggal` dan
 * `label` dikosongkan: rentangnya musiman (Jan-Jul, Jan-Agu 2026), bukan
 * "angka hari ini", jadi tak ada eyebrow tanggal harian maupun judul kartu —
 * kartunya cukup menampilkan angka dan penjelasnya.
 *
 * Angkanya sendiri (nilai) diformat sesuai bahasa: id memakai koma desimal &
 * titik ribuan ("Rp 123,1 triliun"), en memakai gaya Inggris.
 */
export const BAWAN_STATISTIK: Record<Bahasa, Statistik[]> = {
  id: [
    { tanggal: "", label: "", nilai: "321K+ ha", keterangan: "area terbakar Jan-Jul 2026 (MapBiomas Indonesia)" },
    { tanggal: "", label: "", nilai: "Rp 123,1 triliun", keterangan: "estimasi kerugian ekonomi dan biaya kesehatan akibat karhutla Jan-Agu 2026 (CELIOS)" },
    { tanggal: "", label: "", nilai: "13 juta jiwa", keterangan: "terdampak penurunan kualitas udara akibat kabut asap 2026" },
    { tanggal: "", label: "", nilai: "151K+", keterangan: "kasus infeksi saluran pernapasan akut akibat karhutla, hingga 16 Sep 2026 (KEMENKES)" },
  ],
  en: [
    { tanggal: "", label: "", nilai: "321K+ ha", keterangan: "burned area Jan-Jul 2026 (MapBiomas Indonesia)" },
    { tanggal: "", label: "", nilai: "Rp 123.1 trillion", keterangan: "estimated economic loss and health costs from forest and land fires, Jan-Aug 2026 (CELIOS)" },
    { tanggal: "", label: "", nilai: "13 million people", keterangan: "affected by declining air quality from haze in 2026" },
    { tanggal: "", label: "", nilai: "151K+", keterangan: "acute respiratory infection cases from forest and land fires, as of 16 Sep 2026 (Ministry of Health)" },
  ],
};

/** Bawaan bila CMS belum diisi — isi sungguhan dari lib/statistik-sorotan.ts. */
export function ambilStatistik(bahasa: Bahasa): Statistik[] {
  return BAWAN_STATISTIK[bahasa];
}
