"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * State klien CMS — HANYA yang memang milik peramban.
 *
 * Data (kejadian, laporan, komentar) tetap di server: RSC membacanya, server
 * action mengubahnya, router.refresh() menyegarkannya. Menyalinnya ke store
 * ini cuma membuat sumber kedua yang bisa basi.
 *
 * Yang tinggal di sini: antrean toast (aksi di komponen mana pun → satu
 * tempat umpan balik) dan preferensi tata letak per perangkat.
 */

export type Tautan = { href: string; label: string };
export type Toast = { id: number; nada: "kabar" | "galat"; teks: string; tautan?: Tautan };

type Toko = {
  toast: Toast[];
  kabari: (teks: string, nada?: Toast["nada"], tautan?: Tautan) => void;
  tutup: (id: number) => void;
  ciut: boolean;
  aturCiut: (ciut: boolean) => void;
};

let urut = 0;

export const useToko = create<Toko>()(
  persist(
    (set) => ({
      toast: [],
      kabari: (teks, nada = "kabar", tautan) => {
        const id = ++urut;
        // Teks yang sama berturut-turut (klik ganda) tidak ditumpuk.
        set((s) => ({ toast: [...s.toast.filter((t) => t.teks !== teks), { id, nada, teks, tautan }].slice(-4) }));
        // Galat bertahan lebih lama: ia butuh dibaca, bukan sekadar dilihat.
        setTimeout(() => useToko.getState().tutup(id), nada === "galat" || tautan ? 9000 : 4000);
      },
      tutup: (id) => set((s) => ({ toast: s.toast.filter((t) => t.id !== id) })),
      ciut: false,
      aturCiut: (ciut) => set({ ciut }),
    }),
    {
      name: "cms-tata",
      partialize: (s) => ({ ciut: s.ciut }),
      // SSR selalu merender sidebar lebar; preferensinya dibaca setelah
      // hidrasi (MenuAdmin) supaya markup server = klien.
      skipHydration: true,
    },
  ),
);

/** Pintasan untuk komponen klien: `kabari("Tersimpan")`. */
export const kabari = (teks: string, nada?: Toast["nada"], tautan?: Tautan) =>
  useToko.getState().kabari(teks, nada, tautan);
