"use client";

import { TombolKonfirmasi } from "@/app/admin/tombol-konfirmasi";

/**
 * Tombol hapus dua tekan.
 *
 * Menggunakan TombolKonfirmasi dengan hitung mundur otomatis dan pengiriman form.
 */
export function TombolHapus() {
  return (
    <TombolKonfirmasi
      label="Hapus kejadian"
      labelKonfirmasi="Ya, hapus permanen"
      className="cms-tombol cms-tombol--bahaya"
      classNameKonfirmasi="cms-tombol cms-tombol--bahaya-isi"
      tipe="submit"
      durasiDetik={6}
      gap="gap-3"
    />
  );
}
