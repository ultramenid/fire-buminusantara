"use client";

import { useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { mintaTutupOverlay } from "@/lib/peristiwa-popup";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { BAHASA, TEKS_NAV, type Bahasa } from "@/lib/bahasa";
import { SakelarTema } from "@/components/sakelar-tema";
import { useMounted } from "@/hooks/use-mounted";

/** Bagian halaman yang bisa dituju dari bilah ini — dua layar utama. */
const BAGIAN = ["beranda", "peta"] as const;

/**
 * Pencarian umpan yang dititipkan ke bilah ini. Hanya halaman yang PUNYA umpan
 * yang mengirimkannya; tanpa prop ini bilah tampil persis seperti semula, jadi
 * beranda dan halaman rincian tidak ikut berubah.
 *
 * Nilainya dipegang pemanggil, bukan di sini: penyaring umpan dan kolom
 * pencariannya harus membaca satu sumber yang sama.
 */
type PropsCari = {
  nilai: string;
  ubah: (nilai: string) => void;
  terbuka: boolean;
  setTerbuka: (terbuka: boolean) => void;
  placeholder: string;
  /** Tekan tombol keyboard (Enter/panah) di kolom — pemanggil yang mengelola
      daftar saran (mis. pencarian lokasi) memakainya untuk memilih saran. */
  tombol?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Isi tambahan di bawah kolom — daftar saran pemanggil. Hanya dirender
      bila ada; halaman tanpa saran tidak terpengaruh. */
  saran?: ReactNode;
};

type Props = { bahasa: Bahasa; gelap?: boolean; cari?: PropsCari };

/** Kaca pembesar. Bentuknya sengaja sama persis dengan ikon pencarian di
 *  halaman karhutla: tombol ini menggantikan kolom yang dulu berdiri di atas
 *  umpan, jadi ia harus terbaca sebagai benda yang sama yang cuma pindah. */
function IkonCari({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

/** Silang penutup kolom pencarian. Ketebalan garis dan ukurannya sengaja sama
 *  dengan IkonCari supaya keduanya terbaca sebagai sepasang di ujung kolom
 *  yang sama — kaca pembesar membuka, silang menutup. */
function IkonSilang({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" className={className}>
      <path d="M6 6 18 18M18 6 6 18" />
    </svg>
  );
}

/**
 * Bilah Navigasi Minimalis.
 *
 * Tingginya TETAP 4rem (h-16): seluruh halaman menghitung jarak amannya dari angka itu
 * (`pt-[calc(4rem+…)]` di kedua section, posisi atas pop-up peta), jadi
 * ukuran luarnya tetap dipertahankan.
 *
 * Varian `gelap` dipakai halaman dasbor /peta yang gelap: bilah near-black,
 * merek tertulis penuh, tanpa tautan bagian (jangkar #beranda/#peta milik
 * beranda). Ukuran luarnya identik — hanya warnanya yang berganti.
 */
export function Nav({ bahasa, gelap = false, cari }: Props) {
  const teks = TEKS_NAV[bahasa];
  const { resolvedTheme } = useTheme();
  const mounted = useMounted();
  const [aktif, setAktif] = useState<string>(BAGIAN[0]);
  const [tergulir, setTergulir] = useState(false);
  /** Menu hamburger di layar kecil — tautan bagian pindah ke sini. */
  const [menuTerbuka, setMenuTerbuka] = useState(false);
  const lokasi = usePathname();

  const temaGelap = mounted ? resolvedTheme === "dark" : gelap;

  // Sinkronisasi <html lang> dengan bahasa aktif
  useEffect(() => {
    document.documentElement.lang = bahasa;
  }, [bahasa]);

  // Pantau scroll untuk deteksi bagian aktif & efek border header
  useEffect(() => {
    const elemen = BAGIAN.map((b) => document.getElementById(b)).filter(
      (el): el is HTMLElement => el !== null,
    );

    const perbarui = () => {
      setTergulir(window.scrollY > 8);

      const tengah = window.innerHeight / 2;
      let terpilih: string = BAGIAN[0];
      for (const el of elemen) {
        const kotak = el.getBoundingClientRect();
        if (kotak.top <= tengah && kotak.bottom > tengah) terpilih = el.id;
      }
      setAktif(terpilih);
    };

    perbarui();
    window.addEventListener("scroll", perbarui, { passive: true });
    window.addEventListener("resize", perbarui);
    return () => {
      window.removeEventListener("scroll", perbarui);
      window.removeEventListener("resize", perbarui);
    };
  }, []);

  // Menu ponsel ditutup lewat Escape, dan tak perlu tersisa terbuka saat
  // layar membesar ke breakpoint tempat nav inline kembali tampil.
  useEffect(() => {
    const lepas = () => setMenuTerbuka(false);
    window.addEventListener("resize", lepas);
    return () => window.removeEventListener("resize", lepas);
  }, []);

  useEffect(() => {
    if (!menuTerbuka) return;
    const tombol = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuTerbuka(false);
    };
    window.addEventListener("keydown", tombol);
    return () => window.removeEventListener("keydown", tombol);
  }, [menuTerbuka]);

  /* Panel pencarian: kolomnya langsung menerima fokus begitu terbuka —
     tombolnya baru saja diklik, jadi mengetik adalah langkah berikutnya yang
     diharapkan — dan Escape menutupnya, sama seperti menu ponsel di atas.
     Yang dijadikan dependensi adalah nilai primitifnya, bukan objek `cari`
     yang identitasnya berganti tiap render pemanggil. */
  const cariTerbuka = cari?.terbuka ?? false;
  const setCariTerbuka = cari?.setTerbuka;
  useEffect(() => {
    if (!cariTerbuka) return;
    document.getElementById("nav-cari")?.focus();
    const tombol = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCariTerbuka?.(false);
    };
    window.addEventListener("keydown", tombol);
    return () => window.removeEventListener("keydown", tombol);
  }, [cariTerbuka, setCariTerbuka]);

  /* Klik di luar bilah ikut menutup. Wajib ada sejak sakelarnya bersembunyi di
     panggung selagi kolom terbuka: tanpa ini Escape jadi satu-satunya jalan
     keluar, dan itu tidak kelihatan bagi yang memakai tetikus.
     Hanya selagi kolomnya KOSONG: begitu ada kata kunci, hasilnya (umpan yang
     tersaring) justru di luar bilah — menutup di mousedown mengosongkan
     saringan sebelum klik mendarat, jadi hasilnya tak pernah bisa diklik.
     Silang dan Escape tetap menutup. */
  const cariBerisi = (cari?.nilai.trim() ?? "") !== "";
  useEffect(() => {
    if (!cariTerbuka || cariBerisi) return;
    const diLuar = (e: MouseEvent) => {
      const sasaran = e.target as HTMLElement | null;
      if (!sasaran?.closest?.("header")) setCariTerbuka?.(false);
    };
    document.addEventListener("mousedown", diLuar);
    return () => document.removeEventListener("mousedown", diLuar);
  }, [cariTerbuka, cariBerisi, setCariTerbuka]);

  /** Tukar prefiks bahasa pada URL */
  const tautanBahasa = useCallback(
    (target: Bahasa) => {
      const sisa = BAHASA.find((b) => lokasi.startsWith(`/${b}/`) || lokasi === `/${b}`);
      return sisa ? `/${target}${lokasi.slice(1 + sisa.length)}` : `/${target}`;
    },
    [lokasi],
  );

  /** Gulir halus ke sebuah bagian (terintegrasi dengan Lenis jika tersedia) */
  const keBagian = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    // Menggulir ke bagian halaman tidak ada gunanya selama pop-up masih
    // menutupi layar — tutup dulu, baru gulir.
    mintaTutupOverlay();

    let y = 0;
    if (id !== BAGIAN[0]) {
      const sasaran = document.getElementById(id);
      if (!sasaran) return;
      for (let n: HTMLElement | null = sasaran; n; n = n.offsetParent as HTMLElement | null) {
        y += n.offsetTop;
      }
    }

    // Penanda ANDAL bahwa sebuah pop-up masih mengunci guliran: gunakan-parallax.ts
    // memasang overflow:hidden bersamaan dengan lenis?.stop(). stop() itu
    // optional-chained — kalau pop-up dibuka sebelum impor dinamis Lenis
    // selesai, Lenis tidak pernah berhenti dan isStopped tetap false padahal
    // kuncinya sudah terpasang. Gaya inline inilah yang selalu benar.
    const terkunci = document.body.style.overflow === "hidden";

    const lenis = (
      window as unknown as {
        lenis?: {
          scrollTo(t: number, o?: { immediate?: boolean; force?: boolean }): void;
        };
      }
    ).lenis;
    if (lenis?.scrollTo) {
      // Pop-up yang terbuka membuat gunakan-parallax.ts memanggil lenis.stop()
      // dan memasang overflow:hidden. Kunci itu baru dilepas di pembersih efek
      // React — setelah paint, jadi belum terjadi di dalam handler ini.
      //
      // force  : tanpa ini Lenis membuang scrollTo selagi dirinya berhenti,
      //          dan itulah sebabnya klik logo menutup pop-up tapi halaman
      //          tetap tertinggal di bagian peta.
      // immediate: hanya saat berhenti. Animasi Lenis digerakkan rAF yang ikut
      //          mati bersama stop(), jadi gulir beranimasi tidak akan pernah
      //          maju; penulisan langsung menembus, dan sudah terbukti bekerja
      //          walau overflow:hidden masih terpasang. Saat tidak ada pop-up
      //          Lenis berjalan normal dan guliran halus tetap seperti semula.
      lenis.scrollTo(y, { force: true, immediate: terkunci });
      return;
    }

    // Jalur cadangan (Lenis tak pernah dimuat, mis. mode kurangi gerak): kunci
    // yang sama membuat guliran beranimasi tidak sampai tujuan, jadi saat
    // terkunci lompat langsung.
    const kurangiGerak = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: y, behavior: kurangiGerak || terkunci ? "auto" : "smooth" });
  };

  return (
    <header
      aria-label={teks.navigasi}
      className={`fixed top-0 left-0 z-50 h-16 w-full transition-[background-color,border-color,box-shadow] duration-200 motion-reduce:transition-none ${
        temaGelap
          ? "border-b border-white/10 bg-pantau-konsol/90 backdrop-blur-md"
          : tergulir
            ? "bg-white/80 border-b border-black/[0.08] shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)] backdrop-blur-md"
            : "bg-white/80 border-b border-black/[0.03] backdrop-blur-md"
      }`}
    >
      <div className={`mx-auto flex h-full items-center justify-between gap-4 ${
        gelap ? "max-w-7xl px-4 sm:px-6" : "max-w-7xl px-[var(--pias)]"
      }`}>
        {/* Logo LAPOR — tautan ke halaman utama (konsol peta) dalam bahasa
            aktif, di pojok kiri bilah. Di ponsel "Lapor" pindah ke cluster
            kanan supaya logo ini punya tempat. */}
        <Link href={`/${bahasa}`}
           onClick={(e) => {
             // SELALU ditangani di sini, tidak pernah lewat navigasi <Link>.
             // Pop-up rincian mengubah URL jadi /xx/fire/<slug> lewat pushState
             // mentah, jadi mencocokkan pathname dengan "/xx" akan meleset
             // justru saat pop-up terbuka — kasus yang paling butuh ini.
             // Lagi pula halaman rincian merender isi beranda yang sama persis
             // di belakang pop-upnya, jadi menutup + naik ke puncak memang
             // sudah "kembali ke beranda"; URL-nya dibereskan tutupRincian.
             keBagian(e, BAGIAN[0]);
           }}
           className="flex shrink-0 cursor-pointer items-center gap-2">
          {/* Dua varian yang sama persis kecuali warna huruf "Lapor": tinta di
              tema terang, putih di tema gelap; "in" dan sinyal oranyenya tetap.
              Dipilih lewat kelas .dark (dipasang next-themes sebelum cat
              pertama), bukan temaGelap, supaya tak berkedip ke varian salah
              sebelum mount.
              loading="eager": logo ada di bilah lengket yang selalu terlihat.
              Sinyal di atas "i" dan ekor "p" di bawah garis dasar kira-kira
              sama tinggi, jadi huruf kapitalnya sudah di tengah gambar — tak
              perlu digeser seperti logo bergelembung yang lama. */}
          <Image src="/assets/img/logo-laporin.png" alt={teks.merek}
                 width={1000} height={273} loading="eager"
                 className="h-8 w-auto sm:h-10 dark:hidden" />
          <Image src="/assets/img/logo-laporin-gelap.png" alt={teks.merek}
                 width={1000} height={273} loading="eager"
                 className="hidden h-8 w-auto sm:h-10 dark:block" />
        </Link>

        {/* Kolom pencarian — SATU markup, dua rupa, dan SELALU terpasang.

            Panggung: melipat keluar dari nol di dalam bilah dan berhenti
            sebelum gugus kanan, pola konsol yang jadi rujukan.

            Aliran: di 414px logo + ID/EN tak menyisakan ruang untuk kolom, jadi
            ia keluar dari baris (absolute) dan turun ke bawah bilah. Karena
            keluar dari aliran, tinggi bilah yang dipatok 4rem tetap utuh —
            seluruh halaman menghitung jarak amannya dari angka itu.

            Tidak dilepas-pasang mengikuti keadaannya: transisi tak pernah
            berjalan pada elemen yang baru muncul saat itu juga. Lebar, opasitas
            dan keadaan tertutupnya diurus landing-karhutla.css lewat
            [data-buka]. */}
        {cari && (
          <form
            role="search"
            id="nav-panel-cari"
            data-buka={cari.terbuka ? "1" : "0"}
            onSubmit={(e) => e.preventDefault()}
            className="min-w-0 flex-1
                       aliran:absolute aliran:top-full aliran:left-0 aliran:w-full aliran:flex-none
                       aliran:border-b aliran:border-white/10 aliran:bg-pantau-konsol aliran:px-4 aliran:py-3"
          >
            <label htmlFor="nav-cari" className="sr-only">{cari.placeholder}</label>
            <div
              className={`flex items-center gap-3 rounded-xl px-4 py-2.5 ${
                temaGelap
                  ? "bg-black ring-1 ring-white/5 focus-within:ring-2 focus-within:ring-[#ff5a26]"
                  : "bg-black/[0.04] ring-1 ring-black/[0.06] focus-within:ring-2 focus-within:ring-api"
              }`}
            >
              <IkonCari className={`size-[22px] shrink-0 ${temaGelap ? "text-[#a0a0a0]" : "text-tinta/50"}`} />
              <input
                id="nav-cari"
                type="search"
                value={cari.nilai}
                onChange={(e) => cari.ubah(e.target.value)}
                onKeyDown={cari.tombol}
                placeholder={cari.placeholder}
                className={`w-full bg-transparent text-[15px] focus:outline-none ${
                  temaGelap
                    ? "text-[#f5f5f5] placeholder:text-[#a0a0a0]/70"
                    : "text-tinta placeholder:text-tinta/40"
                }`}
              />
              <button
                type="button"
                onClick={() => cari.setTerbuka(false)}
                aria-label={teks.tutupCari}
                className={`shrink-0 cursor-pointer rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  temaGelap
                    ? "text-[#a0a0a0] hover:text-[#f5f5f5] focus-visible:outline-[#ff5a26]"
                    : "text-tinta/50 hover:text-tinta focus-visible:outline-api"
                }`}
              >
                <IkonSilang className="size-[22px]" />
              </button>
            </div>
            {cari.saran}
          </form>
        )}

        {/* Menu Navigasi & Penukar Bahasa */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Tautan bagian hanya milik beranda — dasbor gelap tidak pakai. */}
          {!gelap && (
          <nav aria-label={teks.navigasi} className="hidden sm:flex items-center gap-1 sm:gap-2">
            {BAGIAN.map((id) => {
              const sedang = aktif === id;
              return (
                <a
                  key={id}
                  href={`#${id}`}
                  onClick={(e) => keBagian(e, id)}
                  aria-current={sedang ? "page" : undefined}
                  className={`relative cursor-pointer rounded-full px-3 py-1.5 text-xs sm:text-sm font-semibold tracking-wide uppercase transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-api ${
                    sedang
                      ? "text-api"
                      : temaGelap
                        ? "text-white/70 hover:text-white hover:bg-white/[0.06]"
                        : "text-tinta/60 hover:text-tinta hover:bg-black/[0.04]"
                  }`}
                >
                  {teks.bagian[id]}
                  {sedang && (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-0.5 left-1/2 h-[2px] w-4 -translate-x-1/2 rounded-full bg-api"
                    />
                  )}
                </a>
              );
            })}
          </nav>
          )}

          {/* Sakelar pencarian — ikon saja; kolomnya sendiri berdiri di sebelah
              kiri gugus ini (panggung) atau turun di bawah bilah (aliran).

              Di aliran tombolnya sendiri TIDAK tampil: bilah tab di dasar layar
              sudah punya slot cari (`.lk-tabbar`), dan dua kaca pembesar di satu
              layar ponsel hanya saling berebut. Slot itulah yang membuka panel
              ini — keadaannya sama-sama satu `cariBuka` milik pemanggil. Di
              panggung bilah tab itu tersembunyi, jadi tombolnya tetap perlu. */}
          {cari && (
            <button
              type="button"
              onClick={() => cari.setTerbuka(!cari.terbuka)}
              aria-expanded={cari.terbuka}
              aria-controls="nav-panel-cari"
              aria-label={cari.terbuka ? teks.tutupCari : teks.cari}
              title={cari.terbuka ? teks.tutupCari : teks.cari}
              className={`inline-flex cursor-pointer shrink-0 items-center justify-center rounded-full p-1.5 text-xs font-bold transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-api ${
                temaGelap
                  ? "bg-white/[0.05] text-white/80 ring-1 ring-white/10 hover:bg-white/10 hover:text-white"
                  : "bg-black/[0.04] text-tinta/70 border border-black/[0.06] hover:bg-black/[0.08] hover:text-tinta"
              } aliran:hidden${
                /* Selagi kolomnya terbuka, sakelar ini menyingkir di KEDUA
                   ukuran: kolomnya sudah membawa kaca pembesarnya sendiri di
                   ujung kiri dan silang penutup di ujung kanan, jadi tombol ini
                   tak menyisakan pekerjaan — dan dua kaca pembesar berjajar di
                   satu bilah hanya membingungkan. */
                cari.terbuka ? " hidden" : ""
              }`}
            >
              <span className="size-4 sm:size-[18px] flex items-center justify-center">
                <IkonCari className="size-3.5 sm:size-4" />
              </span>
            </button>
          )}

          {/* Jalan masuk ke form laporan warga — hanya varian terang. Di dasbor
              gelap tombol ini sengaja TIDAK ada: komposer di puncak umpan sudah
              jadi jalan melapor di halaman itu, dan dua ajakan yang sama di satu
              layar hanya saling berebut. */}
          {!gelap && (
            <Link
              href={`/${bahasa}/lapor`}
              className="cursor-pointer rounded-full bg-api px-3 py-1.5 text-xs sm:text-sm font-semibold tracking-wide uppercase text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-api"
            >
              {teks.lapor}
            </Link>
          )}

          {/* Garis Pemisah Tipis — hanya varian terang. */}
          {!gelap && (
            <div className={`hidden h-4 w-[1px] ${temaGelap ? "bg-white/10" : "bg-black/10"} sm:block`} aria-hidden="true" />
          )}

          {/* Penukar Bahasa Minimalis */}
          <div
            role="group"
            aria-label={teks.ganti}
            className={`flex items-center rounded-full p-0.5 text-xs font-bold transition-colors ${
              temaGelap
                ? "bg-white/[0.05] ring-1 ring-white/10"
                : "bg-black/[0.04] border border-black/[0.06]"
            }`}
          >
            {BAHASA.map((kode) => {
              const terpilih = kode === bahasa;
              return terpilih ? (
                <span
                  key={kode}
                  aria-current="true"
                  className="rounded-full bg-[#c83800] px-2.5 py-0.5 uppercase text-white font-bold shadow-xs"
                >
                  {kode}
                </span>
              ) : (
                <Link
                  key={kode}
                  href={tautanBahasa(kode)}
                  prefetch={false}
                  aria-label={`${teks.ganti} (${kode.toUpperCase()})`}
                  className={`cursor-pointer rounded-full px-2.5 py-0.5 uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-api ${
                    temaGelap
                      ? "text-white/60 hover:text-white"
                      : "text-tinta/50 hover:text-tinta"
                  }`}
                >
                  {kode}
                </Link>
              );
            })}
          </div>

          {/* Sakelar Tema (Dark & Light) berdampingan langsung dengan penukar bahasa */}
          <SakelarTema bahasa={bahasa} gelap={temaGelap} />

          {/* Hamburger — hanya varian terang (varian gelap tak punya tautan
              bagian untuk disembunyikan). */}
          {!gelap && (
          <button
            type="button"
            onClick={() => setMenuTerbuka((b) => !b)}
            aria-expanded={menuTerbuka}
            aria-controls="menu-ponsel"
            aria-label={menuTerbuka ? teks.tutupNavigasi : teks.bukaNavigasi}
            className={`flex cursor-pointer h-9 w-9 items-center justify-center rounded-full transition-colors sm:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-api ${
              temaGelap
                ? "text-white/70 hover:bg-white/10 hover:text-white"
                : "text-tinta/70 hover:bg-black/[0.04] hover:text-tinta"
            }`}
          >
            {/* Garis-garisnya menukar bentuk jadi tanda silang saat terbuka. */}
            <span aria-hidden="true" className="relative block h-[14px] w-[18px]">
              <span className={`absolute left-0 top-0 h-[2px] w-full rounded-full bg-current transition-transform duration-200 ${menuTerbuka ? "translate-y-[6px] rotate-45" : ""}`} />
              <span className={`absolute left-0 top-[6px] h-[2px] w-full rounded-full bg-current transition-opacity duration-200 ${menuTerbuka ? "opacity-0" : ""}`} />
              <span className={`absolute bottom-0 left-0 h-[2px] w-full rounded-full bg-current transition-transform duration-200 ${menuTerbuka ? "-translate-y-[6px] -rotate-45" : ""}`} />
            </span>
          </button>
          )}
        </div>
      </div>

      {/* Panel menu ponsel — menggantung dari bilah, hanya di bawah `sm`.
          Tautannya menutup menu dulu baru menggulir, supaya panel tidak
          menutupi bagian tujuan saat gulirnya selesai. */}
      {menuTerbuka && (
        <nav
          id="menu-ponsel"
          aria-label={teks.navigasi}
          className={`sm:hidden absolute top-full left-0 w-full border-b backdrop-blur-md shadow-[0_8px_20px_-8px_rgba(0,0,0,0.12)] ${
            temaGelap
              ? "border-white/10 bg-pantau-konsol/95 text-white"
              : "border-black/[0.08] bg-white/95 text-tinta"
          }`}
        >
          <ul className="flex flex-col px-[var(--pias)] py-2">
            {BAGIAN.map((id) => {
              const sedang = aktif === id;
              return (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    onClick={(e) => {
                      setMenuTerbuka(false);
                      keBagian(e, id);
                    }}
                    aria-current={sedang ? "page" : undefined}
                    className={`block cursor-pointer rounded-lg px-3 py-3 text-sm font-semibold tracking-wide uppercase transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-api ${
                      sedang ? "text-api" : "text-tinta/70 hover:bg-black/[0.04] hover:text-tinta"
                    }`}
                  >
                    {teks.bagian[id]}
                  </a>
                </li>
              );
            })}
            <li className="mt-1 border-t border-black/[0.06] pt-1">
              <Link
                href={`/${bahasa}/lapor`}
                onClick={() => setMenuTerbuka(false)}
                className="block cursor-pointer rounded-lg px-3 py-3 text-sm font-semibold tracking-wide uppercase text-api transition-colors duration-150 hover:bg-black/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-api"
              >
                {teks.lapor}
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
