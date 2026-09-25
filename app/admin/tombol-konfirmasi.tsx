"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Pemuat } from "./pemuat";

export type TombolKonfirmasiProps = {
  /** Label pada tombol awal (sebelum ditekan). */
  label: ReactNode;
  /** Label pada tombol konfirmasi kedua (misal: "Ya, hapus"). */
  labelKonfirmasi?: ReactNode;
  /** Label pada tombol batal. Bawaan: "Batal". */
  labelBatal?: ReactNode;
  /** Kelas CSS untuk tombol awal. */
  className?: string;
  /** Kelas CSS untuk tombol konfirmasi. Bawaan: sama dengan className. */
  classNameKonfirmasi?: string;
  /** Kelas CSS untuk tombol batal. Bawaan: "cms-mata px-1 underline-offset-4 hover:underline". */
  classNameBatal?: string;
  /** Tipe tombol konfirmasi ("button" atau "submit"). Bawaan: "button". */
  tipe?: "button" | "submit";
  /** Callback saat tombol konfirmasi kedua ditekan. */
  onKonfirmasi?: () => void | Promise<void>;
  /** Callback saat status terbuka berubah (untuk mode terkontrol). */
  onTerbukaChange?: (terbuka: boolean) => void;
  /** Callback saat dibatalkan (baik klik tombol Batal atau waktu habis). */
  onBatal?: () => void;
  /** State terkontrol untuk menentukan apakah konfirmasi sedang aktif. */
  terbuka?: boolean;
  /** Durasi hitung mundur dalam detik sebelum otomatis batal. Bawaan: 5. */
  durasiDetik?: number;
  /** Menampilkan hitung mundur detik di tombol batal. Bawaan: true. */
  tampilkanHitungMundur?: boolean;
  /** Menandakan aksi sedang berjalan di server (menonaktifkan tombol dan menampilkan pemuat). */
  sibuk?: boolean;
  /** Nonaktifkan tombol. */
  disabled?: boolean;
  /** Jarak antara tombol konfirmasi dan tombol batal. Bawaan: "gap-2". */
  gap?: string;
};

/**
 * Tombol dua langkah (two-step confirmation) dengan hitung mundur otomatis.
 *
 * Mencegah tindakan destruktif atau genting dilakukan secara tidak sengaja tanpa
 * perlu modal dialog yang menyita layar. Langkah pertama meminta penegasan di baris
 * yang sama, dan jika diabaikan, hitung mundur akan otomatis memulihkan tombol ke
 * keadaan semula.
 */
export function TombolKonfirmasi({
  label,
  labelKonfirmasi,
  labelBatal = "Batal",
  className = "cms-tombol",
  classNameKonfirmasi,
  classNameBatal = "cms-mata px-1 underline-offset-4 hover:underline",
  tipe = "button",
  onKonfirmasi,
  onTerbukaChange,
  onBatal,
  terbuka: terbukaProp,
  durasiDetik = 5,
  tampilkanHitungMundur = true,
  sibuk = false,
  disabled = false,
  gap = "gap-2",
}: TombolKonfirmasiProps) {
  const [internalTerbuka, setInternalTerbuka] = useState(false);
  const isTerkontrol = typeof terbukaProp !== "undefined";
  const terbuka = isTerkontrol ? Boolean(terbukaProp) : internalTerbuka;

  const setTerbuka = useCallback((nilai: boolean) => {
    if (!isTerkontrol) setInternalTerbuka(nilai);
    onTerbukaChange?.(nilai);
    if (!nilai) onBatal?.();
  }, [isTerkontrol, onTerbukaChange, onBatal]);

  if (!terbuka) {
    return (
      <button
        type="button"
        disabled={disabled || sibuk}
        aria-busy={sibuk}
        onClick={() => setTerbuka(true)}
        className={className}
      >
        {sibuk && <Pemuat />}
        {label}
      </button>
    );
  }

  const teksKonfirmasi =
    labelKonfirmasi ??
    (typeof label === "string" ? `Ya, ${label.toLowerCase()}` : "Ya, lanjutkan");

  return (
    <TombolKonfirmasiAktif
      labelKonfirmasi={teksKonfirmasi}
      labelBatal={labelBatal}
      classNameKonfirmasi={classNameKonfirmasi ?? className}
      classNameBatal={classNameBatal}
      tipe={tipe}
      onKonfirmasi={onKonfirmasi}
      onTutup={() => setTerbuka(false)}
      durasiDetik={durasiDetik}
      tampilkanHitungMundur={tampilkanHitungMundur}
      sibuk={sibuk}
      disabled={disabled}
      gap={gap}
    />
  );
}

function TombolKonfirmasiAktif({
  labelKonfirmasi,
  labelBatal,
  classNameKonfirmasi,
  classNameBatal,
  tipe,
  onKonfirmasi,
  onTutup,
  durasiDetik,
  tampilkanHitungMundur,
  sibuk,
  disabled,
  gap,
}: {
  labelKonfirmasi: ReactNode;
  labelBatal: ReactNode;
  classNameKonfirmasi: string;
  classNameBatal: string;
  tipe: "button" | "submit";
  onKonfirmasi?: () => void | Promise<void>;
  onTutup: () => void;
  durasiDetik: number;
  tampilkanHitungMundur: boolean;
  sibuk: boolean;
  disabled: boolean;
  gap: string;
}) {
  const [sisaDetik, setSisaDetik] = useState(durasiDetik);

  useEffect(() => {
    const pewaktu = setInterval(() => {
      setSisaDetik((sisa) => {
        if (sisa <= 1) {
          clearInterval(pewaktu);
          onTutup();
          return 0;
        }
        return sisa - 1;
      });
    }, 1000);

    return () => clearInterval(pewaktu);
  }, [durasiDetik, onTutup]);

  return (
    <span className={`inline-flex items-center ${gap}`}>
      <button
        type={tipe}
        disabled={disabled || sibuk}
        aria-busy={sibuk}
        onClick={onKonfirmasi}
        className={classNameKonfirmasi}
      >
        {sibuk && <Pemuat />}
        {labelKonfirmasi}
      </button>
      <button
        type="button"
        disabled={sibuk}
        onClick={onTutup}
        className={classNameBatal}
      >
        {labelBatal}
        {tampilkanHitungMundur && (
          <span className="ml-1 tabular-nums text-[var(--lirih)]">({sisaDetik}s)</span>
        )}
      </button>
    </span>
  );
}
