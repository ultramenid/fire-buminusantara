"use client";

import Link from "next/link";
import { useToko } from "./toko";

/** Umpan balik aksi — satu tempat di pojok, untuk seluruh CMS. */
export function Toaster() {
  const toast = useToko((s) => s.toast);
  const tutup = useToko((s) => s.tutup);

  return (
    // Wilayah live selalu terpasang (kosong pun) supaya pembaca layar sudah
    // mendengarkannya sebelum toast pertama masuk.
    <div aria-live="polite"
         className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-5">
      {toast.map((t) => (
        <div key={t.id} role={t.nada === "galat" ? "alert" : "status"}
             className={`cms-toast pointer-events-auto ${t.nada === "galat" ? "cms-toast--galat" : ""}`}>
          <span aria-hidden="true" className="cms-toast__titik" />
          <p className="min-w-0 flex-1">
            {t.teks}
            {t.tautan && (
              <Link href={t.tautan.href} onClick={() => tutup(t.id)}
                    className="ml-1.5 font-medium underline underline-offset-4">{t.tautan.label}</Link>
            )}
          </p>
          <button type="button" onClick={() => tutup(t.id)} aria-label="Tutup"
                  className="cms-ikon-tombol -my-1 -mr-1 size-6">
            <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
