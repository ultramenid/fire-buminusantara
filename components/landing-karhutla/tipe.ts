/** Bentuk satu laporan/kartu umpan di dasbor karhutla — turunan `Berita`
 *  dari lib/events yang sudah diratakan untuk komponen klien. */
export type Laporan = {
  id: number;
  gambar: string | null; // foto — atau poster bingkai bila laporannya video
  video?: string; // mp4 bila laporannya video
  /** Seluruh media galeri (berurut) — >1 berarti ada lencana. */
  galeri: { url: string; jenis: "gambar" | "video"; poster?: string; keterangan?: string }[];
  alt: string;
  judul: string;
  tanggal: string;
  lokasi: string | null;
  deskripsi: string | null;
  slug: string | null;
  href: string;
  /** Pulau payload berita (Sumatra, Kalimantan, …) — kunci saringan wilayah
   *  di bilah saringan umpan. Opsional: pemakai lain tipe ini tak menyaring. */
  pulau?: string | null;
  /** Jumlah komentar — kunci urutan "komentar terbanyak" umpan. */
  komentar?: number;
};

/** Satu saran lokasi dari pencarian wilayah BMKG/Kemendagri. */
export type SaranLokasi = {
  id: string;
  nama: string;
  provinsi: string;
  lat: number;
  lng: number;
  adm4?: string;
  tipe?: string;
};