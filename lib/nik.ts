/**
 * Bentuk NIK (Nomor Induk Kependudukan) — murni, tanpa impor: dipakai rute
 * pengajuan, halaman peninjau, dan pembaca OCR KTP (lib/ocr-ktp.ts).
 */

/** Bentuk ketikan: spasi pemisah (mis. "3201 0123 …") dibuang, sisanya apa adanya. */
export function rapikanNik(mentah: unknown): string {
  return String(mentah ?? "").replace(/\s+/g, "");
}

function hariDalamBulan(bulan: number, tahun2: number): number {
  // Abad tidak tertulis di NIK: 29 Februari sah bila tahunnya kabisat di salah
  // satu abad — "00" pun (2000 kabisat, 1900 tidak).
  if (bulan === 2) return tahun2 % 4 === 0 ? 29 : 28;
  return bulan === 4 || bulan === 6 || bulan === 9 || bulan === 11 ? 30 : 31;
}

/**
 * Pemeriksaan bentuk NIK — bukan bukti NIK itu ada (itu tugas petugas atau
 * eKYC). null = masuk akal; selain itu pesan galat untuk warga.
 *
 * NIK: PP KK CC DDMMYY NNNN — provinsi, kabupaten/kota, kecamatan, tanggal
 * lahir (perempuan: tanggal + 40), nomor urut. Kode provinsi 11–96: rentang
 * 11–94 ditambah Papua Pegunungan (95) dan Papua Barat Daya (96), provinsi
 * hasil pemekaran 2022.
 */
export function periksaNik(nik: string): string | null {
  if (!/^\d{16}$/.test(nik)) return "NIK harus 16 angka.";
  const dua = (i: number) => Number(nik.slice(i, i + 2));
  const provinsi = dua(0);
  const kabupaten = dua(2);
  const kecamatan = dua(4);
  const tanggal = dua(6);
  const hari = tanggal > 40 ? tanggal - 40 : tanggal;
  const bulan = dua(8);
  const tahun = dua(10);
  const urut = Number(nik.slice(12));
  const sah =
    provinsi >= 11 && provinsi <= 96 &&
    kabupaten > 0 && kecamatan > 0 && urut > 0 &&
    bulan >= 1 && bulan <= 12 &&
    hari >= 1 && hari <= hariDalamBulan(bulan, tahun);
  return sah ? null : "NIK tidak valid.";
}

/** Bagian NIK yang bisa dicocokkan peninjau dengan isi KTP: tanggal lahir
 *  (DD-MM-YY) dan jenis kelamin. Hanya untuk NIK yang lolos periksaNik. */
export function uraiNik(nik: string): { lahir: string; perempuan: boolean } {
  const tanggal = Number(nik.slice(6, 8));
  const perempuan = tanggal > 40;
  const hari = String(perempuan ? tanggal - 40 : tanggal).padStart(2, "0");
  return { lahir: `${hari}-${nik.slice(8, 10)}-${nik.slice(10, 12)}`, perempuan };
}
