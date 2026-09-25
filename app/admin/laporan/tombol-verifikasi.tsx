"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { StatusLaporan } from "@/lib/laporan-publik";
import { aksiStatus, aksiHapusLaporan } from "./aksi";
import { TombolKonfirmasi } from "../tombol-konfirmasi";

/** Aksi yang sedang menunggu konfirmasi kedua di barisnya. */
type Tindakan = "approved" | "rejected" | "pending" | "hapus";

/**
 * Tombol keputusan untuk satu laporan.
 *
 * Bentuknya mengikuti AksiKomentar: server action yang memutuskan, komponen ini
 * hanya memanggil lalu menyegarkan halaman, dan setiap keputusan (verifikasi,
 * tolak, kembalikan, hapus) butuh dua tekan melalui TombolKonfirmasi dengan hitung
 * mundur otomatis.
 */
export function TombolVerifikasi({
  id, status, bolehHapus, setelahHapus,
}: {
  id: number;
  status: StatusLaporan;
  bolehHapus: boolean;
  /** Ke mana pergi setelah laporan dibuang. Diisi halaman detail: barisnya
   *  sudah tidak ada, jadi menyegarkan halaman yang sama hanya menghasilkan
   *  404. Di daftar, dibiarkan kosong — menyegarkan di tempat sudah benar. */
  setelahHapus?: string;
}) {
  const [sibuk, mulai] = useTransition();
  const [pastikan, setPastikan] = useState<Tindakan | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const router = useRouter();

  const jalankan = async (kerja: () => Promise<{ ok: boolean; galat?: string }>, pergiKe?: string) => {
    mulai(async () => {
      const hasil = await kerja();
      if (!hasil.ok) {
        setGalat(hasil.galat ?? "Gagal memproses laporan.");
        return;
      }
      setGalat(null);
      if (pergiKe) router.push(pergiKe);
      else router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {status !== "approved" && (
          <TombolKonfirmasi
            label="Verifikasi"
            labelKonfirmasi="Ya, verifikasi"
            className="cms-tombol cms-tombol--utama cms-tombol--kecil"
            sibuk={sibuk}
            terbuka={pastikan === "approved"}
            onTerbukaChange={(buka) => setPastikan(buka ? "approved" : null)}
            onKonfirmasi={() => jalankan(() => aksiStatus(id, "approved"))}
            durasiDetik={5}
          />
        )}

        {status !== "rejected" && (
          <TombolKonfirmasi
            label="Tolak"
            labelKonfirmasi="Ya, tolak"
            className="cms-tombol cms-tombol--garis cms-tombol--kecil"
            sibuk={sibuk}
            terbuka={pastikan === "rejected"}
            onTerbukaChange={(buka) => setPastikan(buka ? "rejected" : null)}
            onKonfirmasi={() => jalankan(() => aksiStatus(id, "rejected"))}
            durasiDetik={5}
          />
        )}

        {/* Keputusan yang sudah diambil harus bisa dicabut: yang salah tekan
            tidak punya jalan lain selain mengembalikannya ke antrean. */}
        {status !== "pending" && (
          <TombolKonfirmasi
            label="Kembalikan"
            labelKonfirmasi="Ya, kembalikan"
            className="cms-tombol cms-tombol--redup cms-tombol--kecil"
            sibuk={sibuk}
            terbuka={pastikan === "pending"}
            onTerbukaChange={(buka) => setPastikan(buka ? "pending" : null)}
            onKonfirmasi={() => jalankan(() => aksiStatus(id, "pending"))}
            durasiDetik={5}
          />
        )}

        {bolehHapus && (
          <TombolKonfirmasi
            label="Hapus"
            labelKonfirmasi="Ya, hapus"
            className="cms-tombol cms-tombol--bahaya cms-tombol--kecil"
            classNameKonfirmasi="cms-tombol cms-tombol--bahaya-isi cms-tombol--kecil"
            sibuk={sibuk}
            terbuka={pastikan === "hapus"}
            onTerbukaChange={(buka) => setPastikan(buka ? "hapus" : null)}
            onKonfirmasi={() => jalankan(() => aksiHapusLaporan(id), setelahHapus)}
            durasiDetik={5}
          />
        )}
      </div>
      {galat && (
        <p role="alert" className="cms-mata text-red-700">{galat}</p>
      )}
    </div>
  );
}
