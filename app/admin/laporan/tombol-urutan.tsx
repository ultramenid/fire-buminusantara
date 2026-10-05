"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { aksiUrutanLampiran } from "./aksi";
import { Pemuat } from "../pemuat";

/**
 * Tombol pengatur urutan satu lampiran laporan warga.
 * Memungkinkan kurator menentukan media mana yang tampil pertama sebelum diverifikasi.
 */
export function TombolUrutanLampiran({
  id,
  url,
  indeks,
  total,
}: {
  id: number;
  url: string;
  indeks: number;
  total: number;
}) {
  const [sibuk, mulai] = useTransition();
  const [galat, setGalat] = useState<string | null>(null);
  const router = useRouter();

  const geser = (arah: "atas" | "bawah" | "pertama") => {
    if (sibuk) return;
    setGalat(null);
    mulai(async () => {
      const hasil = await aksiUrutanLampiran(id, url, arah);
      if (!hasil.ok) {
        setGalat(hasil.galat ?? "Gagal mengubah urutan.");
        return;
      }
      router.refresh();
    });
  };

  const isFirst = indeks === 0;
  const isLast = indeks === total - 1;

  return (
    <span className="mt-1 mb-2 inline-flex items-center gap-1">
      {isFirst ? (
        <span className="cms-cap border-[var(--api)] bg-[var(--api)] text-white font-bold text-[10px]">
          ★ 01 · TAMPIL PERTAMA
        </span>
      ) : (
        <>
          <button
            type="button"
            disabled={sibuk}
            onClick={() => geser("pertama")}
            title="Jadikan media ini tampil paling pertama"
            className="cms-mata rounded-[4px] border border-[var(--api)] bg-[var(--api)]/10 px-1.5 py-0.5 text-[var(--api)] font-bold hover:bg-[var(--api)] hover:text-white"
          >
            ★ Pertama
          </button>
          <button
            type="button"
            disabled={sibuk || isFirst}
            onClick={() => geser("atas")}
            title="Pindah ke atas"
            aria-label="Pindah ke atas"
            className="cms-mata rounded-[4px] border border-[var(--garis)] px-1.5 py-0.5 text-[var(--redup)] hover:text-[var(--jelaga)] disabled:opacity-30"
          >
            ↑
          </button>
        </>
      )}

      {!isLast && (
        <button
          type="button"
          disabled={sibuk}
          onClick={() => geser("bawah")}
          title="Pindah ke bawah"
          aria-label="Pindah ke bawah"
          className="cms-mata rounded-[4px] border border-[var(--garis)] px-1.5 py-0.5 text-[var(--redup)] hover:text-[var(--jelaga)] disabled:opacity-30"
        >
          ↓
        </button>
      )}

      {sibuk && <span className="ml-1 text-[var(--lirih)]"><Pemuat /></span>}
      {galat && <span role="alert" className="cms-mata text-[var(--bara)]">{galat}</span>}
    </span>
  );
}
