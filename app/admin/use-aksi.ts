"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { kabari } from "./toko";

export type HasilAksi = { ok: true } | { ok: false; galat: string };

/** Jalankan server action → toast → segarkan daftar. Satu pola untuk semua
 *  tombol baris; koneksi putus jadi toast galat, bukan error boundary. */
export function useAksi() {
  const [sibuk, mulai] = useTransition();
  const router = useRouter();
  const jalankan = (kerja: () => Promise<HasilAksi>, berhasil: string, lalu?: () => void) =>
    mulai(async () => {
      let hasil: HasilAksi;
      try {
        hasil = await kerja();
      } catch {
        hasil = { ok: false, galat: "Koneksi terputus. Coba lagi." };
      }
      if (!hasil.ok) return kabari(hasil.galat, "galat");
      kabari(berhasil);
      lalu?.();
      router.refresh();
    });
  return [sibuk, jalankan] as const;
}
