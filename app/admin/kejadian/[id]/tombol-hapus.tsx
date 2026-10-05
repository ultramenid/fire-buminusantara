"use client";

import { useRouter } from "next/navigation";
import { TombolKonfirmasi } from "@/app/admin/tombol-konfirmasi";
import { useAksi } from "../../use-aksi";
import { aksiHapusKejadian } from "../aksi";

/** Hapus dua tekan; sesudahnya kembali ke tabel (saringannya tetap). */
export function TombolHapus({ id }: { id: number }) {
  const [sibuk, jalankan] = useAksi();
  const router = useRouter();
  return (
    <TombolKonfirmasi
      label="Hapus kejadian"
      labelKonfirmasi="Ya, hapus permanen"
      className="cms-tombol cms-tombol--bahaya"
      classNameKonfirmasi="cms-tombol cms-tombol--bahaya-isi"
      sibuk={sibuk}
      durasiDetik={6}
      gap="gap-3"
      onKonfirmasi={() => jalankan(() => aksiHapusKejadian(id), "Kejadian dihapus.", () => router.push("/admin/kejadian"))}
    />
  );
}
