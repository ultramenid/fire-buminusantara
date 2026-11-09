"use client";

import type { ReactNode } from "react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useMediaQuery } from "@/hooks/use-media-query";

/** Mode tampilan daftar laporan: baris ringkas atau kartu bergambar. */
export type ModeTampilan = "daftar" | "kartu";

export type OpsiWilayah = { kunci: string; label: string; jumlah?: number };

/**
 * Bilah saringan laporan: rentang tanggal, pilihan wilayah, lalu satu saklar
 * (`saklar`) di ujung — pemanggil yang menentukan saklarnya: pop-up wilayah
 * peta memakai SaklarTampilan (daftar/kartu), umpan karhutla memakai saklar
 * urutan (terbaru/komentar terbanyak).
 *
 * Tata letaknya milik komponen ini, wadahnya (garis, padding) milik pemanggil:
 * - Ponsel: tanggal dan wilayah berdampingan (tanggal selebar isinya, sisanya
 *   untuk wilayah — labelnya membawa jumlah laporan), saklar selebar penuh di
 *   bawahnya. Ketiganya
 *   setinggi h-9 — dulu tanggal duduk sendirian di baris pertama selebar
 *   isinya, dan tinggi ketiga kontrol berbeda-beda. Placeholder tanggalnya
 *   dipendekkan jadi "Tanggal" supaya tak terpotong di kolom yang sempit.
 * - Layar lebar: satu baris — saringan (tanggal + wilayah) berkelompok di
 *   kiri, saklar di kanan. Dulu wilayah ikut ke kanan dan menyisakan rongga
 *   lebar di antara dua saringan yang sejenis.
 *
 * `tanpaSaringanPonsel`: di ponsel tanggal dan wilayah disembunyikan, tinggal
 * saklarnya — dipakai umpan beranda. Pop-up wilayah peta tetap memakai
 * keduanya.
 */
export function BilahSaringan({
  dari,
  sampai,
  onTanggal,
  gelap,
  wilayah,
  opsiWilayah,
  onWilayah,
  labelWilayah = "Pilih wilayah pulau tercatat",
  satuan = "laporan",
  placeholderTanggal = "Pilih rentang tanggal",
  placeholderTanggalPendek = "Tanggal",
  saklar,
  tanpaSaringanPonsel = false,
}: {
  dari: string;
  sampai: string;
  onTanggal: (rentang: { dari: string; sampai: string }) => void;
  gelap: boolean;
  wilayah: string;
  opsiWilayah: OpsiWilayah[];
  onWilayah: (kunci: string) => void;
  labelWilayah?: string;
  satuan?: string;
  placeholderTanggal?: string;
  placeholderTanggalPendek?: string;
  saklar: ReactNode;
  tanpaSaringanPonsel?: boolean;
}) {
  // Ambang yang sama dengan `sm:` Tailwind di bawah (640px).
  const sempit = useMediaQuery("(max-width: 639px)");
  const saringan = tanpaSaringanPonsel ? "hidden sm:block" : "";
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 sm:flex sm:gap-2.5">
      {/* Kolom tanggal selebar isinya (maks. 9rem — rentang terpilih yang
          panjang terpotong elipsis), sisanya untuk wilayah. */}
      <div className={`min-w-0 max-w-[9rem] sm:max-w-none ${saringan}`}>
        <DateRangePicker dari={dari} sampai={sampai} gelap={gelap} onChange={onTanggal} penuh
                         placeholder={sempit ? placeholderTanggalPendek : placeholderTanggal} />
      </div>

      <div className={`relative min-w-0 sm:w-[240px] ${saringan}`}>
        <select
          value={wilayah}
          onChange={(e) => onWilayah(e.target.value)}
          aria-label={labelWilayah}
          className="h-9 w-full appearance-none truncate rounded-lg
                     border border-black/15 bg-white text-tinta
                     hover:border-black/30 focus:border-black/40 focus:ring-1 focus:ring-black/20
                     dark:border-white/15 dark:bg-pantau-malam dark:text-white
                     dark:hover:border-white/30 dark:focus:border-white/40 dark:focus:ring-white/30
                     pl-2.5 pr-7 text-[11px] sm:text-xs font-medium shadow-xs outline-none transition-colors cursor-pointer"
        >
          {opsiWilayah.map((o) => (
            <option key={o.kunci} value={o.kunci} className="bg-white text-tinta dark:bg-[#1a1919] dark:text-white">
              {/* Layar sempit: jumlah tanpa satuan — "Semua wilayah (36)" muat di
                  kolomnya, "(36 laporan)" terpotong. */}
              {o.label} {o.jumlah !== undefined ? (sempit ? `(${o.jumlah})` : `(${o.jumlah} ${satuan})`) : ""}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-black/50 dark:text-white/50">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>

      <div className="col-span-2 sm:col-span-1 sm:ml-auto sm:shrink-0">{saklar}</div>
    </div>
  );
}

/**
 * Saklar bersegmen: satu pilihan aktif dari beberapa. Di ponsel selebar
 * wadahnya (segmen sama lebar), di layar lebar selebar isinya.
 */
export function SaklarSegmen<T extends string>({
  nilai,
  opsi,
  onPilih,
  label,
}: {
  nilai: T;
  opsi: { kunci: T; isi: ReactNode; label: string }[];
  onPilih: (kunci: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label}
         className="flex h-9 w-full items-stretch gap-0.5 rounded-lg
                    border border-black/15 bg-black/[0.04] p-0.5 shadow-xs
                    dark:border-white/15 dark:bg-pantau-malam sm:w-auto">
      {opsi.map((o) => {
        const aktif = o.kunci === nilai;
        return (
          <button key={o.kunci} type="button" onClick={() => onPilih(o.kunci)}
                  aria-pressed={aktif} aria-label={o.label} title={o.label}
                  className={`flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[6px] px-2.5
                              text-[11px] sm:text-xs font-medium whitespace-nowrap transition-colors sm:flex-none
                              ${aktif
                                ? "bg-white text-tinta shadow-2xs dark:bg-white/20 dark:text-white"
                                : "text-black/55 hover:bg-black/5 hover:text-tinta dark:text-white/55 dark:hover:bg-white/10 dark:hover:text-white"}`}>
            {o.isi}
          </button>
        );
      })}
    </div>
  );
}

/** Saklar daftar/kartu (ikon) — dipakai pop-up wilayah peta. */
export function SaklarTampilan({ nilai, onPilih }: { nilai: ModeTampilan; onPilih: (mode: ModeTampilan) => void }) {
  return (
    <SaklarSegmen
      nilai={nilai}
      onPilih={onPilih}
      label="Mode tampilan berita"
      opsi={[
        {
          kunci: "daftar",
          label: "Tampilan daftar",
          isi: (
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" className="size-[15px]">
              <path d="M9 6h11M9 12h11M9 18h11" />
              <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth="2.6" />
            </svg>
          ),
        },
        {
          kunci: "kartu",
          label: "Tampilan kartu",
          isi: (
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[15px]">
              <rect x="4" y="4" width="7" height="7" rx="1.5" />
              <rect x="13" y="4" width="7" height="7" rx="1.5" />
              <rect x="4" y="13" width="7" height="7" rx="1.5" />
              <rect x="13" y="13" width="7" height="7" rx="1.5" />
            </svg>
          ),
        },
      ]}
    />
  );
}
