"use client";

import { TombolKonfirmasi } from "../tombol-konfirmasi";
import { useAksi } from "../use-aksi";
import { aksiHapusTanggapan } from "./aksi";

export function TombolHapusTanggapan({ jenis, id }: { jenis: "suka" | "reaksi"; id: number }) {
  const [sibuk, jalankan] = useAksi();
  return (
    <TombolKonfirmasi
      label="Hapus"
      labelKonfirmasi="Ya, hapus"
      className="cms-tombol cms-tombol--hantu-bahaya cms-tombol--kecil"
      classNameKonfirmasi="cms-tombol cms-tombol--bahaya-isi cms-tombol--kecil"
      sibuk={sibuk}
      onKonfirmasi={() => jalankan(() => aksiHapusTanggapan(jenis, id), jenis === "suka" ? "Suka dihapus." : "Reaksi dihapus.")}
    />
  );
}
