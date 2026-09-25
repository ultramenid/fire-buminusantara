"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pemuat } from "../pemuat";
import { TombolKonfirmasi } from "../tombol-konfirmasi";
import { aksiSetujui, aksiHapus } from "./aksi";

/**
 * Tombol moderasi satu komentar.
 *
 * Server action yang memutuskan; komponen ini memanggil lalu menyegarkan
 * halaman. Menghapus butuh dua tekan melalui TombolKonfirmasi dengan hitung
 * mundur otomatis, sehingga pertanyaan tetap duduk di baris komentarnya.
 */
export function AksiKomentar({
  id, disetujui, bolehHapus,
}: {
  id: number;
  disetujui: boolean;
  /** Membuang komentar hanya untuk admin — editor boleh meninjau, tidak membuang. */
  bolehHapus: boolean;
}) {
  const [sibuk, mulai] = useTransition();
  const router = useRouter();

  const jalankan = (kerja: () => Promise<void>) =>
    mulai(async () => { await kerja(); router.refresh(); });

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {disetujui ? (
        <button type="button" disabled={sibuk} aria-busy={sibuk}
                onClick={() => jalankan(() => aksiSetujui(id, false))}
                className="cms-tombol cms-tombol--garis cms-tombol--kecil">
          {sibuk && <Pemuat />}
          Sembunyikan
        </button>
      ) : (
        <button type="button" disabled={sibuk} aria-busy={sibuk}
                onClick={() => jalankan(() => aksiSetujui(id, true))}
                className="cms-tombol cms-tombol--utama cms-tombol--kecil">
          {sibuk && <Pemuat />}
          Setujui
        </button>
      )}

      {bolehHapus && (
        <TombolKonfirmasi
          label="Hapus"
          labelKonfirmasi="Ya, hapus"
          className="cms-tombol cms-tombol--bahaya cms-tombol--kecil"
          classNameKonfirmasi="cms-tombol cms-tombol--bahaya-isi cms-tombol--kecil"
          sibuk={sibuk}
          durasiDetik={5}
          onKonfirmasi={() => jalankan(() => aksiHapus(id))}
        />
      )}
    </div>
  );
}

export { AksiKomentar as TombolAksi };
