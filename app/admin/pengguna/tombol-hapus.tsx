"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { TombolKonfirmasi } from "../tombol-konfirmasi";
import { kabari } from "../toko";
import { aksiHapusPengguna } from "./aksi";

export function TombolHapusPengguna({ id }: { id: number }) {
  const [sibuk, mulai] = useTransition();
  const router = useRouter();

  return (
    <TombolKonfirmasi
      label="Hapus akun"
      labelKonfirmasi="Ya, hapus akun"
      className="cms-tombol cms-tombol--bahaya cms-tombol--kecil"
      classNameKonfirmasi="cms-tombol cms-tombol--bahaya-isi cms-tombol--kecil"
      sibuk={sibuk}
      onKonfirmasi={() => mulai(async () => {
        const hasil = await aksiHapusPengguna(id);
        if (!hasil.ok) return kabari(hasil.galat, "galat");
        kabari("Akun dihapus.");
        router.push("/admin/pengguna");
        router.refresh();
      })}
    />
  );
}
