"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { StatusLaporan } from "@/lib/laporan-publik";
import { aksiStatus, aksiHapusLaporan } from "./aksi";
import { TombolKonfirmasi } from "../tombol-konfirmasi";
import { kabari } from "../toko";

/** Aksi yang sedang menunggu konfirmasi kedua di barisnya. */
type Tindakan = "approved" | "rejected" | "pending" | "hapus";

const KABAR: Record<Tindakan, string> = {
  approved: "Laporan diverifikasi.",
  rejected: "Laporan ditolak.",
  pending: "Laporan dikembalikan ke antrean.",
  hapus: "Laporan dihapus.",
};

/**
 * Tombol keputusan untuk satu laporan (di panel rincian).
 *
 * Setiap keputusan butuh dua tekan (TombolKonfirmasi, hitung mundur). Sesudah
 * diputuskan, halaman langsung pindah ke laporan berikutnya dalam saringan
 * tabel yang sama — atau kembali ke tabel bila antreannya habis.
 */
export function TombolVerifikasi({
  id, status, bolehHapus, berikutnya,
}: {
  id: number;
  status: StatusLaporan;
  bolehHapus: boolean;
  berikutnya: string | null;
}) {
  const [sibuk, mulai] = useTransition();
  const [pastikan, setPastikan] = useState<Tindakan | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const router = useRouter();

  const jalankan = (tindakan: Tindakan) => {
    mulai(async () => {
      let hasil: { ok: boolean; galat?: string; idKejadian?: number | null };
      try {
        hasil = tindakan === "hapus" ? await aksiHapusLaporan(id) : await aksiStatus(id, tindakan);
      } catch (e) {
        // Jaringan putus/aksi melempar: tampilkan di sini, jangan biarkan
        // seluruh panel jatuh ke batas galat.
        console.error("[TombolVerifikasi]", e);
        hasil = { ok: false, galat: "Tidak tersambung ke server. Coba lagi." };
      }
      if (!hasil.ok) {
        setGalat(hasil.galat ?? "Gagal memproses laporan.");
        return;
      }
      setGalat(null);
      kabari(
        hasil.idKejadian ? `Laporan diverifikasi — kejadian #${hasil.idKejadian} dibuat.` : KABAR[tindakan],
        "kabar",
        hasil.idKejadian ? { href: `/admin/kejadian/${hasil.idKejadian}`, label: "Buka" } : undefined,
      );
      router.push(berikutnya ?? "/admin/laporan");
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
            onKonfirmasi={() => jalankan("approved")}
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
            onKonfirmasi={() => jalankan("rejected")}
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
            onKonfirmasi={() => jalankan("pending")}
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
            onKonfirmasi={() => jalankan("hapus")}
            durasiDetik={5}
          />
        )}
      </div>
      {galat && (
        <p role="alert" className="cms-galat">{galat}</p>
      )}
    </div>
  );
}
