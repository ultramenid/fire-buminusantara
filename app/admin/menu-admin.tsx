"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import type { Tunggakan } from "@/lib/tunggakan";
import { useMounted } from "@/hooks/use-mounted";
import { gunakanTunggakan } from "./tunggakan-hidup";
import { useToko } from "./toko";
import { keluar } from "./aksi-sesi";
import { bukaPalet } from "./palet";

type Ikon = keyof typeof IKON;
type Tautan = { href: string; label: string; ikon: Ikon; tepat?: boolean; admin?: boolean };

const KELOMPOK: { judul?: string; tautan: Tautan[] }[] = [
  { tautan: [{ href: "/admin", label: "Ringkasan", ikon: "rumah", tepat: true }] },
  {
    judul: "Konten",
    tautan: [
      { href: "/admin/kejadian", label: "Kejadian", ikon: "api" },
      { href: "/admin/laporan", label: "Laporan warga", ikon: "kotak" },
      { href: "/admin/statistik", label: "Statistik", ikon: "grafik", tepat: true },
    ],
  },
  {
    judul: "Moderasi",
    tautan: [
      { href: "/admin/komentar", label: "Komentar", ikon: "balon" },
      { href: "/admin/reaksi", label: "Reaksi", ikon: "senyum" },
      { href: "/admin/suka", label: "Suka", ikon: "jempol" },
    ],
  },
  {
    judul: "Pengaturan",
    tautan: [
      { href: "/admin/pengguna", label: "Pengguna", ikon: "orang", admin: true },
      { href: "/admin/biometrik", label: "Biometrik", ikon: "sidik" },
    ],
  },
];

/* Garis 16×16, gaya lucide — satu ukuran untuk semua supaya kolom ikon rata. */
const IKON = {
  rumah: "M2.5 7 8 2.5 13.5 7v6.5h-4v-4h-3v4h-4z",
  api: "M8 14c2.8 0 4.5-1.9 4.5-4.4C12.5 6.5 9.5 5 9 1.5 7 3 6.6 5 6.8 6.5 5.6 6 5 4.8 5 4 3.8 5.2 3.5 7.2 3.5 9.6 3.5 12.1 5.2 14 8 14z",
  kotak: "M2.5 4.5h11v8h-11zM2.5 4.5 8 9l5.5-4.5",
  grafik: "M2.5 13.5h11M4.5 11V7.5M8 11V4M11.5 11V9",
  balon: "M2.5 3.5h11v7.5H7l-3 2.5V11H2.5z",
  senyum: "M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM5.5 9.5s.9 1.5 2.5 1.5 2.5-1.5 2.5-1.5M6 6.5h0M10 6.5h0",
  jempol: "M5 7v6.5H2.5V7zM5 7l2.5-5c1 0 1.8.8 1.6 1.8L8.7 6.5h3.6c.9 0 1.5.8 1.3 1.6l-1 4.4c-.2.6-.7 1-1.3 1H5",
  sidik: "M4.5 13.5c.6-1.6 1-3.4 1-5.5a2.5 2.5 0 0 1 5 0c0 1.3-.1 2.5-.4 3.7M8 8c0 2.3-.4 4.3-1.2 6M2.5 10.5c.3-.8.5-1.6.5-2.5a5 5 0 0 1 9.6-2M13 8.5c0 1.5-.2 3-.6 4.3",
  orang: "M8 7.5a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5zM2.5 14c.4-2.8 2.6-4.5 5.5-4.5s5.1 1.7 5.5 4.5",
  panel: "M2.5 3h11v10h-11zM6 3v10",
  keluar: "M6 2.5H3v11h3M10 5l3 3-3 3M13 8H6.5",
  matahari: "M8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1",
  bulan: "M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z",
  tambah: "M8 3v10M3 8h10",
  tutup: "M4 4l8 8M12 4l-8 8",
  kiri: "M10 3 5 8l5 5",
  kanan: "M6 3l5 5-5 5",
  atas: "M4 10l4-4 4 4",
  bawah: "M4 6l4 4 4-4",
  cari: "M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM14 14l-3.5-3.5",
  luar: "M9.5 2.5h4v4M13.5 2.5 7.5 8.5M11.5 9.5v4h-9v-9h4",
  masuk: "M2.5 9.5h3l1 2h3l1-2h3M2.5 9.5 4.5 3h7l2 6.5v4h-11z",
  mata: "M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  centang: "M3 8.5l3 3 7-7",
  peta: "M8 14s4.5-4 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 10 8 14 8 14zM8 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  gambar: "M2.5 3h11v10h-11zM2.5 10.5 5.5 7.5l3 3 2-2 3 3M10.5 6.5h0",
  terbit: "M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM2.5 8h11M8 2.5c1.5 1.6 2.2 3.4 2.2 5.5S9.5 11.9 8 13.5C6.5 11.9 5.8 10.1 5.8 8S6.5 4.1 8 2.5z",
  kunci: "M13.5 6.5a4 4 0 1 0-5.5 3.7V11h2v2h2v-2.3a4 4 0 0 0 1.5-4.2zM8 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z",
};

export function Ikon({ nama, className = "size-4" }: { nama: Ikon; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path d={IKON[nama]} />
    </svg>
  );
}

/** "Komentar" dan "Reaksi" berbagi awalan jalur — yang pertama dicocokkan
 *  persis, kalau tidak keduanya menyala saat halaman reaksi dibuka. */
function sedangDibuka(jalur: string, t: Tautan) {
  return t.tepat ? jalur === t.href : jalur.startsWith(t.href);
}

export function kelompokUntuk(peran: string) {
  return KELOMPOK
    .map((k) => ({ ...k, tautan: k.tautan.filter((t) => !t.admin || peran === "admin") }))
    .filter((k) => k.tautan.length);
}

export type { Tunggakan };

function tunggakanUntuk(href: string, t: Tunggakan): number {
  if (href === "/admin/komentar") return t.belumDitinjau;
  if (href === "/admin/laporan") return t.laporanMenunggu;
  return 0;
}

function SakelarTema({ label = false }: { label?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const terpasang = useMounted();
  const gelap = terpasang && resolvedTheme === "dark";
  const teks = gelap ? "Tema terang" : "Tema gelap";
  return (
    <button type="button" onClick={() => setTheme(gelap ? "light" : "dark")}
            aria-label={teks} title={teks}
            className={label ? "cms-tautan w-full" : "cms-ikon-tombol"}>
      <Ikon nama={gelap ? "matahari" : "bulan"} />
      {label && <span className="cms-label">{teks}</span>}
    </button>
  );
}

/** Sidebar desktop: berkelompok, bisa diciutkan jadi kolom ikon. */
export function MenuAdmin({ tunggakan, peran, nama }: { tunggakan: Tunggakan; peran: string; nama: string }) {
  const jalur = usePathname();
  const angka = gunakanTunggakan(tunggakan);
  const ciut = useToko((s) => s.ciut);
  const aturCiut = useToko((s) => s.aturCiut);

  // Preferensi ciut dibaca setelah hidrasi (skipHydration di toko.ts).
  useEffect(() => { useToko.persist.rehydrate(); }, []);

  return (
    <aside data-ciut={ciut || undefined}
           className="cms-punggung group/sisi z-20 hidden h-full shrink-0 flex-col border-r
                      transition-[width] duration-150 lg:flex w-[232px] data-[ciut]:w-[56px]">
      <div className="flex h-12 items-center justify-end px-3 group-data-[ciut]/sisi:justify-center">
        <button type="button" onClick={() => aturCiut(!ciut)}
                aria-label={ciut ? "Lebarkan sidebar" : "Ciutkan sidebar"} aria-expanded={!ciut}
                title={ciut ? "Lebarkan sidebar" : "Ciutkan sidebar"}
                className="cms-ikon-tombol">
          <Ikon nama="panel" />
        </button>
      </div>

      <div className="px-2 pb-1">
        <button type="button" onClick={bukaPalet} title="Cari & perintah (⌘K)" className="cms-tautan w-full">
          <Ikon nama="cari" />
          <span className="cms-label flex-1 text-left">Cari…</span>
          <kbd className="cms-kbd cms-label">⌘K</kbd>
        </button>
      </div>

      <nav aria-label="Bagian CMS" className="flex-1 overflow-y-auto px-2 pb-3">
        {kelompokUntuk(peran).map((k, i) => (
          <div key={k.judul ?? i}>
            {k.judul && (ciut ? <hr className="mx-2 my-2 border-[var(--garis)]" />
                              : <p className="cms-kelompok">{k.judul}</p>)}
            {k.tautan.map((t) => {
              const aktif = sedangDibuka(jalur, t);
              const menunggu = tunggakanUntuk(t.href, angka);
              return (
                <Link key={t.href} href={t.href} aria-current={aktif ? "page" : undefined}
                      title={ciut ? t.label : undefined} className="cms-tautan relative">
                  <Ikon nama={t.ikon} />
                  <span className="cms-label truncate">{t.label}</span>
                  {menunggu > 0 && (ciut ? (
                    <span className="absolute top-1.5 left-6 size-2 rounded-full bg-[var(--api)]"
                          aria-label={`${menunggu} menunggu`} />
                  ) : (
                    <span className="cms-angka ml-auto rounded-full bg-[var(--api)] px-1.5 text-[11px] leading-[18px] text-white">
                      {menunggu}
                    </span>
                  ))}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--garis)] p-2">
        <a href="/" target="_blank" rel="noreferrer" className="cms-tautan" title={ciut ? "Lihat situs" : undefined}>
          <Ikon nama="luar" />
          <span className="cms-label">Lihat situs</span>
        </a>
        <SakelarTema label />
        <div className="mt-1 flex items-center gap-2.5 rounded-[var(--jari)] px-2 py-1.5 group-data-[ciut]/sisi:flex-col group-data-[ciut]/sisi:px-0">
          <span aria-hidden="true" title={ciut ? `${nama} (${peran})` : undefined}
                className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--rona-kuat)] text-[11.5px] font-semibold">
            {nama.slice(0, 1).toUpperCase()}
          </span>
          <div className="cms-label min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-medium">{nama}</p>
            <p className="cms-mata capitalize">{peran}</p>
          </div>
          <form action={keluar}>
            <button type="submit" aria-label="Keluar" title="Keluar" className="cms-ikon-tombol">
              <Ikon nama="keluar" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

/** Kerangka sempit: bar atas tetap, menu digulir mendatar. */
export function MenuAdminAtas({ tunggakan, peran }: { tunggakan: Tunggakan; peran: string }) {
  const jalur = usePathname();
  const angka = gunakanTunggakan(tunggakan);
  const navRef = useRef<HTMLElement>(null);

  // Tab aktif bisa jauh di kanan baris gulir — geser ke pandangan.
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [jalur]);

  return (
    <div className="cms-punggung z-20 shrink-0 border-b lg:hidden">
      <div className="flex h-12 items-center justify-end gap-1 px-4">
        <button type="button" onClick={bukaPalet} aria-label="Cari & perintah" className="cms-ikon-tombol">
          <Ikon nama="cari" />
        </button>
        <SakelarTema />
        <form action={keluar}>
          <button type="submit" aria-label="Keluar" title="Keluar" className="cms-ikon-tombol">
            <Ikon nama="keluar" />
          </button>
        </form>
      </div>
      <nav ref={navRef} aria-label="Bagian CMS" className="tanpa-bilah-gulir flex gap-1 overflow-x-auto px-2 pb-2">
        {kelompokUntuk(peran).flatMap((k) => k.tautan).map((t) => {
          const aktif = sedangDibuka(jalur, t);
          const menunggu = tunggakanUntuk(t.href, angka);
          return (
            <Link key={t.href} href={t.href} aria-current={aktif ? "page" : undefined}
                  className="cms-tautan h-8 shrink-0">
              {t.label}
              {menunggu > 0 && (
                <span className="cms-angka rounded-full bg-[var(--api)] px-1.5 text-[11px] leading-[18px] text-white">
                  {menunggu}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
