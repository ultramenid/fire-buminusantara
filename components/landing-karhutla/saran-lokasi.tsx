"use client";

import type { Bahasa } from "@/lib/bahasa";
import { IkonPin } from "./ikon";
import type { SaranLokasi } from "./tipe";

/* Isi daftar saran lokasi — dipakai di dua tempat: dropdown Select2 di sumur
   lokasi (panggung) dan panel pencarian di bilah atas (panel seluler).
   Wadah listbox-nya milik masing-masing pemanggil (posisinya beda), isinya
   sama persis supaya perilakunya tak perlu dijaga sinkron di dua tempat. */
export function IsiSaranLokasi({ daftar, indeks, memuat, bahasa, onSorot, onPilih }: {
  daftar: SaranLokasi[];
  indeks: number;
  memuat: boolean;
  bahasa: Bahasa;
  onSorot: (i: number) => void;
  onPilih: (s: SaranLokasi) => void;
}) {
  if (memuat && daftar.length === 0) {
    return (
      <div className="flex items-center gap-2.5 px-3 py-3 text-[13px] text-black/60 dark:text-[#a0a0a0]">
        <svg
          className="size-4 shrink-0 animate-spin text-tinta dark:text-white"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        <span>{bahasa === "en" ? "Searching locations..." : "Mencari lokasi..."}</span>
      </div>
    );
  }
  if (daftar.length > 0) {
    return (
      <>
        {daftar.map((item, idx) => {
          const dipilih = idx === indeks;
          return (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={dipilih}
              onMouseEnter={() => onSorot(idx)}
              onClick={() => onPilih(item)}
              className={`group flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] transition-colors ${
                dipilih
                  ? "bg-black/10 text-tinta font-medium dark:bg-white/15 dark:text-white"
                  : "text-black/80 hover:bg-black/5 hover:text-black dark:text-[#d0d0d0] dark:hover:bg-white/10 dark:hover:text-white"
              }`}
            >
              <IkonPin
                className={`size-4 shrink-0 ${
                  dipilih ? "text-orange-400" : "text-[#888888] group-hover:text-orange-400"
                }`}
              />
              <span className="truncate font-medium">{item.nama}</span>
              <span className="ml-auto shrink-0 rounded bg-black/5 px-2 py-0.5 text-[11px] text-black/60 dark:bg-white/5 dark:text-[#909090]">
                {item.provinsi}
              </span>
            </button>
          );
        })}
      </>
    );
  }
  return (
    <div className="px-3 py-3 text-center text-[13px] text-black/50 dark:text-[#888888]">
      {bahasa === "en" ? "No locations found" : "Tidak ada lokasi yang cocok"}
    </div>
  );
}