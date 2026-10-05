"use client";

import { useEffect } from "react";
import { kabari } from "./toko";

const PESAN = "Ada perubahan yang belum disimpan. Klik sekali lagi untuk membuangnya.";
let izinkanSampai = 0;

/**
 * Ada form yang sudah diketik tapi belum disimpan? Dipanggil navigasi
 * buatan (J/K, Esc, palet) sebelum router.push. Peringatan pertama menahan;
 * mengulang dalam 5 detik = sengaja membuang.
 */
export function adaPerubahan(): boolean {
  const kotor = document.querySelectorAll("form[data-kotor]");
  if (!kotor.length) return false;
  if (Date.now() < izinkanSampai) {
    kotor.forEach((f) => f.removeAttribute("data-kotor"));
    return false;
  }
  izinkanSampai = Date.now() + 5000;
  kabari(PESAN, "galat");
  return true;
}

/**
 * Penjaga perubahan untuk seluruh CMS — tanpa menyentuh tiap form.
 *
 * Mengetik di form mana pun menandainya `data-kotor`; kirim menghapus tanda.
 * Selama ada form kotor, klik tautan ditahan sekali (adaPerubahan) dan
 * menutup tab meminta konfirmasi peramban. Daftar & palet (`data-tanpa-jaga`)
 * tidak ikut menandai: kotak cari bukan pekerjaan yang bisa hilang.
 */
export function Penjaga() {
  useEffect(() => {
    const tandai = (e: Event) => {
      const el = e.target as HTMLInputElement;
      if (!el.form || el.closest("[data-tanpa-jaga]")) return;
      el.form.setAttribute("data-kotor", "");
    };
    // ponytail: tanda dihapus saat kirim, bukan saat sukses — kalau simpan
    // gagal, isiannya masih di layar tapi tidak lagi dijaga.
    const bersih = (e: Event) => (e.target as HTMLElement).removeAttribute?.("data-kotor");
    const klik = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      if (adaPerubahan()) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const tutup = (e: BeforeUnloadEvent) => {
      if (document.querySelector("form[data-kotor]")) e.preventDefault();
    };
    document.addEventListener("input", tandai, true);
    document.addEventListener("change", tandai, true);
    document.addEventListener("submit", bersih, true);
    document.addEventListener("click", klik, true);
    window.addEventListener("beforeunload", tutup);
    return () => {
      document.removeEventListener("input", tandai, true);
      document.removeEventListener("change", tandai, true);
      document.removeEventListener("submit", bersih, true);
      document.removeEventListener("click", klik, true);
      window.removeEventListener("beforeunload", tutup);
    };
  }, []);
  return null;
}
