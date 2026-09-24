"use client";

/** Tab gagang pelipat rel kiri — padanan TabRel di halaman index, ditulis
 *  lokal karena di sana ia fungsi internal yang tidak diekspor. Satu bedanya:
 *  index mewarnainya menurut lapisan peta aktif (ungu asap / hijau windy),
 *  halaman ini tak punya pengalih lapisan jadi ia memakai aksen halamannya
 *  sendiri. Keyframe apungnya dipakai bersama — sudah ada di app/globals.css.
 *
 *  Posisi `left` sengaja dua nilai panjang yang konkret, bukan calc berisi
     var: custom property tidak diinterpolasi, jadi tombolnya akan melompat
     sementara kolomnya beranimasi. */
export function TabRelKiri({ terbuka, onUbah, label }: {
  terbuka: boolean;
  onUbah: () => void;
  label: string;
}) {
  return (
    <span
      className={`absolute top-1/2 left-full z-[41] hidden -translate-y-1/2
                  transition-[translate] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]
                  motion-reduce:transition-none panggung:block ${
        terbuka ? "-translate-x-1/2" : "translate-x-3"
      }`}
    >
      <button
        type="button"
        onClick={onUbah}
        aria-expanded={terbuka}
        aria-controls="lk-rel-kiri"
        aria-label={label}
        title={label}
        className="lk-tab-rel cursor-pointer group flex size-9 items-center justify-center rounded-full bg-[#ff5a26] text-white dark:text-black
                   ring-1 ring-inset ring-black/10 dark:ring-white/25 shadow-[0_6px_20px_rgb(255_90_38/0.45)]
                   transition-[scale,box-shadow,background-color] duration-300 ease-out
                   hover:scale-110 hover:shadow-[0_10px_28px_rgb(255_90_38/0.6)] active:scale-90
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5a26]
                   motion-safe:animate-[tab-rel-apung_3.2s_ease-in-out_infinite] hover:[animation-play-state:paused]"
      >
        {/* Satu panah yang berputar 180°: arahnya menunjuk ke mana relnya akan
            bergerak, jadi pergantiannya terbaca sebagai gerak, bukan ganti
            bentuk. */}
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5"
             strokeLinecap="round" strokeLinejoin="round"
             className={`size-4 transition-[rotate,translate] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]
                         motion-reduce:transition-none ${
              terbuka ? "rotate-0 group-hover:-translate-x-0.5" : "rotate-180 group-hover:translate-x-0.5"
            }`}>
          <path d="m14 6-6 6 6 6" />
        </svg>
      </button>
    </span>
  );
}