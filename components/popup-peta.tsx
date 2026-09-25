"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { gunakanTumbuh, type TitikAsal } from "@/hooks/gunakan-tumbuh";
import { waktuIso, waktuTeks } from "@/lib/tanggal";
import { PROVINSI_KE_PULAU, PULAU_TAB, tabDariPulau } from "@/lib/wilayah";
import { BilahSaringan, SaklarTampilan, type ModeTampilan } from "@/components/bilah-saringan";
import { useTheme } from "next-themes";
import { useMounted } from "@/hooks/use-mounted";
import type { Berita } from "@/lib/events";
import { mediaLokal, type ItemMedia } from "@/lib/media";

type Props = {
  nama: string;
  pulau: string | null;
  jumlah: number | null;
  /** Titik layar tempat pop-up tumbuh — provinsi yang ditekan. */
  asal: TitikAsal;
  berita: Berita[];
  jumlahLaporan?: Record<string, number>;
  onBukaRincian: (i: number) => void;
  onTutup: () => void;
  /** Sisa prop lama — jika ada, dipakai sebagai fallback sebelum mounted. */
  gelap?: boolean;
};

/** Banyak laporan per halaman — sepuluh baris pada mode daftar, atau dua
 *  baris lima kartu pada mode kartu. Satu angka untuk keduanya supaya ganti
 *  mode tak mengubah total halaman di kepala pengunjung. */
const PER_HALAMAN = 10;

/**
 * Pop-up berita wilayah, terbuka saat sebuah provinsi ditekan di peta.
 *
 * Wilayah yang ditekan hanya menentukan tab mana yang terbuka lebih dulu;
 * sesudah itu pop-up ini menjadi jalan masuk ke SELURUH berita, jadi tabnya
 * bebas dipindah.
 */
export function PopupPeta({
  nama,
  pulau,
  jumlah,
  asal,
  berita,
  jumlahLaporan,
  onBukaRincian,
  onTutup,
  gelap: gelapProp,
}: Props) {
  const { resolvedTheme } = useTheme();
  const mounted = useMounted();
  const isDark = mounted ? resolvedTheme === "dark" : Boolean(gelapProp);

  const panelRef = useRef<HTMLDivElement | null>(null);
  /* Daftar beritanya ditunda sampai animasi tumbuh selesai — persis pekerjaan
     berat yang parameter ketiga gunakanTumbuh disediakan untuk menundanya,
     dan sampai sekarang tak ada yang memakainya. Sepuluh kartu bergambar yang
     lahir di frame yang sama dengan panel berarti dekode gambar + tata letak
     grid masuk ke dalam lapisan will-change yang sedang diskala 0,14 -> 1:
     itulah tersendatnya saat pop-up dibuka dari poligon.

     Penjaga waktunya bukan sabuk pengaman berlebih: prefers-reduced-motion
     mematikan animasinya (lihat peta-popup.css), jadi `animationend` tak
     pernah datang dan tanpa ini daftarnya tak akan pernah muncul di sana. */
  const [isiSiap, setIsiSiap] = useState(false);
  // eslint-disable-next-line react-hooks/refs
  gunakanTumbuh(panelRef, asal, () => setIsiSiap(true));
  useEffect(() => {
    const jaga = setTimeout(() => setIsiSiap(true), 460);
    return () => clearTimeout(jaga);
  }, []);
  const [tabAktif, setTabAktif] = useState(() => tabDariPulau(pulau) ?? PULAU_TAB[0].kunci);
  const [prevPulau, setPrevPulau] = useState(pulau);
  if (pulau !== prevPulau) {
    setPrevPulau(pulau);
    setTabAktif(tabDariPulau(pulau) ?? PULAU_TAB[0].kunci);
  }
  // `dari` dan `sampai` disimpan terpisah karena penyaringnya memakai keduanya.
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  // Mode tampilan daftar berita — bawaan kartu bergambar (sesuai rujukan),
  // dipilih lewat saklar kartu/daftar di bilah saringan.
  const [tampilan, setTampilan] = useState<ModeTampilan>("kartu");
  // Halaman aktif pada kedua mode. Kembali ke halaman pertama saat tab pulau
  // atau saringan tanggal berganti — daftarnya baru, halamannya ikut baru.
  const [halaman, setHalaman] = useState(1);
  const [kunciSaringanSebelumnya, setKunciSaringanSebelumnya] = useState(() => `${tabAktif}:${dari}:${sampai}`);
  const kunciSaringanKini = `${tabAktif}:${dari}:${sampai}`;
  if (kunciSaringanKini !== kunciSaringanSebelumnya) {
    setKunciSaringanSebelumnya(kunciSaringanKini);
    setHalaman(1);
  }
  // Rel gulir daftar — pindah halaman mengembalikannya ke atas supaya
  // pengunjung selalu mulai dari laporan pertama halaman itu.
  const daftarRef = useRef<HTMLDivElement | null>(null);
  const keHalaman = (h: number) => {
    setHalaman(h);
    daftarRef.current?.scrollTo({ top: 0 });
  };

  const adaSaringan = Boolean(dari || sampai);
  const hapusTanggal = () => {
    setDari("");
    setSampai("");
  };

  const tabAwal = useMemo(() => tabDariPulau(pulau) ?? PULAU_TAB[0].kunci, [pulau]);
  const tab = PULAU_TAB.find((t) => t.kunci === tabAktif) ?? PULAU_TAB[0];

  // Hitung total laporan per tab pulau dari seluruh provinsi
  const totalLaporanTab = useMemo(() => {
    if (!jumlahLaporan) return null;
    const isi = tab.isi as readonly string[];
    let total = 0;
    for (const [prov, jml] of Object.entries(jumlahLaporan)) {
      const p = PROVINSI_KE_PULAU[prov];
      if (p && isi.includes(p)) {
        total += jml;
      }
    }
    return total;
  }, [tab, jumlahLaporan]);

  // Hitung total laporan untuk setiap tab pulau untuk ditampilkan di dropdown select
  const jumlahLaporanSemuaTab = useMemo(() => {
    const hasil: Record<string, number> = {};
    if (!jumlahLaporan) return hasil;
    for (const t of PULAU_TAB) {
      const isi = t.isi as readonly string[];
      let total = 0;
      for (const [prov, jml] of Object.entries(jumlahLaporan)) {
        const p = PROVINSI_KE_PULAU[prov];
        if (p && isi.includes(p)) {
          total += jml;
        }
      }
      hasil[t.kunci] = total;
    }
    return hasil;
  }, [jumlahLaporan]);

  const adalahWilayahAwal = tabAktif === tabAwal;
  const judulTampil = adalahWilayahAwal ? nama : tab.label;
  const subTampil = adalahWilayahAwal ? (pulau ?? tab.label) : tab.label;
  const jumlahTampil = adalahWilayahAwal ? jumlah : totalLaporanTab;

  const tampil = useMemo(() => {
    const isi = tab.isi as readonly string[];
    const awal = waktuIso(dari);
    const akhir = waktuIso(sampai);

    return berita
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => {
        if (!b.pulau || !isi.includes(b.pulau)) return false;
        const waktu = waktuTeks(b.tanggal);
        if (waktu === null) return true; // tanggal tak terbaca: jangan disembunyikan
        if (awal !== null && waktu < awal) return false;
        if (akhir !== null && waktu > akhir) return false;
        return true;
      })
      // Pop-up ini arsip, bukan etalase: selalu terbaru dulu (lalu id), apa pun
      // urutan `berita` yang diterimanya — umpan halaman karhutla mengirimnya
      // dalam urutan "terbaru + komentar terbanyak". `i` tetap indeks asli.
      .sort((x, y) => (waktuTeks(y.b.tanggal) ?? 0) - (waktuTeks(x.b.tanggal) ?? 0) || y.b.id - x.b.id);
  }, [berita, tab, dari, sampai]);

  // Potongan daftar untuk halaman aktif — berlaku untuk kedua mode. Indeks
  // `i` di tiap butir tetap menunjuk ke posisi global di `berita` supaya
  // rincian yang dibuka tak salah sasaran. totalHalaman dihitung turun (bukan
  // state) agar penyegaran data yang menyusutkan daftar tak meninggalkan
  // halaman hantu.
  const totalHalaman = Math.max(1, Math.ceil(tampil.length / PER_HALAMAN));
  const halamanAktif = Math.min(Math.max(1, halaman), totalHalaman);
  const tampilHalaman = tampil.slice((halamanAktif - 1) * PER_HALAMAN, halamanAktif * PER_HALAMAN);
  const awalNomor = tampil.length === 0 ? 0 : (halamanAktif - 1) * PER_HALAMAN + 1;
  const akhirNomor = Math.min(halamanAktif * PER_HALAMAN, tampil.length);

  useEffect(() => {
    const saatTombol = (e: KeyboardEvent) => { if (e.key === "Escape") onTutup(); };
    window.addEventListener("keydown", saatTombol);
    return () => window.removeEventListener("keydown", saatTombol);
  }, [onTutup]);

  return (
    /* Tanpa tabir gelap. Pop-up ini memang panel yang menutupi sebagian besar
       layar, bukan dialog di atas kain hitam — petanya masih terlihat di
       tepinya, dan itu yang membuat kaitannya dengan wilayah yang ditekan
       tetap terbaca. Menutupnya lewat tombol tutup atau Escape. */
    <>
      {/* Backdrop semi-transparan yang menutup saat disentuh/diklik di luar popup */}
      <div
        className="fixed inset-0 z-[44] cursor-pointer bg-black/50 backdrop-blur-[2px] transition-opacity"
        onClick={onTutup}
        aria-hidden="true"
      />

      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Berita karhutla wilayah terpilih"
           className="peta-popup fixed inset-x-2.5 sm:inset-x-[clamp(10px,4vw,190px)]
                      top-[calc(3.75rem+env(safe-area-inset-top,0px))] sm:top-[calc(4rem+clamp(10px,2.4vw,26px))]
                      bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:bottom-[clamp(10px,2.4vw,26px)]
                      z-[45] flex flex-col overflow-hidden rounded-[14px]
                      border border-black/[0.08] bg-white text-tinta shadow-[0_26px_70px_rgb(0_0_0/0.25)]
                      dark:border-white/10 dark:bg-pantau-konsol dark:text-white dark:shadow-[0_26px_70px_rgb(0_0_0/0.75)]
                      panggung:inset-x-[7vw] panggung:top-[calc(4rem+3vh)] panggung:bottom-[5vh]">

        {/* Kepala: wilayah yang ditekan / tab yang aktif */}
        <div className="flex shrink-0 items-start gap-2.5 sm:gap-[clamp(10px,2.6vw,14px)]
                        border-b border-black/[0.08] dark:border-white/10
                        p-3 sm:p-5 pr-12 sm:pr-[54px] panggung:p-[22px_28px] panggung:pr-[76px]">
          <div className="grid min-w-0 flex-1 gap-[2px]">
            <p className="text-[length:var(--ukuran-rincian-nama)] leading-[1.1] font-bold tracking-[-0.01em] text-tinta dark:text-white">
              {judulTampil}
            </p>
            {subTampil && (
              <p className="text-[length:var(--ukuran-catatan)] font-medium tracking-[0.1em] uppercase text-bara">
                {subTampil}
              </p>
            )}
            {jumlahTampil !== null && (
              <p className="mt-1 text-[length:var(--ukuran-catatan)] text-black/60 dark:text-white/60">
                <span className="font-bold text-tinta dark:text-white">{jumlahTampil.toLocaleString("id-ID")}</span>{" "}
                <span>laporan tercatat</span>
              </p>
            )}
          </div>

          <button type="button" aria-label="Tutup berita wilayah" onClick={onTutup}
                  className="absolute top-3 right-3 sm:top-[clamp(12px,3vw,18px)] sm:right-[clamp(12px,3vw,18px)] z-[1] grid size-8 sm:size-[32px]
                             cursor-pointer place-items-center rounded-full
                             border border-black/10 bg-black/5 text-tinta hover:bg-black/10
                             dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/20
                             transition hover:rotate-90 active:scale-95 panggung:size-[34px]">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" className="size-4">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        {/* Saringan tanggal + dropdown pilih pulau */}
        <div className="shrink-0 border-b border-black/[0.08] dark:border-white/10
                        p-3 sm:p-5 py-2.5 sm:py-[10px] panggung:px-[28px]">
          <BilahSaringan
            dari={dari}
            sampai={sampai}
            gelap={isDark}
            onTanggal={({ dari, sampai }) => {
              setDari(dari);
              setSampai(sampai);
            }}
            wilayah={tabAktif}
            opsiWilayah={PULAU_TAB.map((t) => ({ kunci: t.kunci, label: t.label, jumlah: jumlahLaporanSemuaTab[t.kunci] }))}
            onWilayah={setTabAktif}
            saklar={<SaklarTampilan nilai={tampilan} onPilih={setTampilan} />}
          />
        </div>

        {/* Daftar berita. data-lenis-prevent: saat pop-up terbuka Lenis
            dihentikan (gunakanParallax), dan Lenis yang berhenti tetap menelan
            event roda dengan preventDefault — rel inilah satu-satunya yang
            dikecualikan, sehingga gulir bawaan peramban hidup kembali di
            dalamnya. overscroll-contain menahan rantai gulir agar menyentuh
            dasar/tepinya tidak ikut menggulirkan halaman di belakang. */}
        <div data-lenis-prevent
             ref={daftarRef}
             className="tanpa-bilah-gulir min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y
                        p-3 sm:p-5 panggung:px-[28px]">
          {!isiSiap ? (
            <RangkaDaftar mode={tampilan} />
          ) : tampil.length > 0 ? (
            tampilan === "kartu" ? (
              /* Mode kartu: kotak bergambar berpetak — pratinjau 16:10 di
                 atas, tanggal + judul di bawah, lokasi menempel di dasar
                 supaya barisan kartu terlihat rapi meski judulnya beda panjang. */
              <>
              <ul className="grid grid-cols-1 min-[430px]:grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3
                             panggung:grid-cols-5 panggung:gap-[20px] xl:grid-cols-5">
                {tampilHalaman.map(({ b, i }) => {
                  const awal = b.media[0];
                  return (
                    <li key={b.id} className="flex">
                      <button type="button" onClick={() => onBukaRincian(i)}
                              className="group flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-xl
                                         border border-black/[0.08] bg-white text-left shadow-xs
                                         dark:border-white/10 dark:bg-pantau-malam
                                         transition-all duration-200 ease-out
                                         hover:-translate-y-1 hover:border-black/20 hover:shadow-md
                                         dark:hover:border-white/30 dark:hover:shadow-[0_10px_24px_rgb(0_0_0/0.5)]
                                         active:translate-y-0">
                        <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-black/5 dark:bg-white/10">
                          <PratinjauMedia awal={awal} pulau={b.pulau}
                                          sizes="(max-width: 429px) 95vw, (max-width: 767px) 48vw, 33vw"
                                          kelas="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                        </div>
                        <div className="flex flex-1 flex-col justify-between p-3 sm:p-3.5">
                          <div>
                            <p className="text-[11px] sm:text-xs font-medium text-black/50 transition-colors group-hover:text-black/70 dark:text-white/50 dark:group-hover:text-white/70">
                              {b.tanggal}
                            </p>
                            <h3 className="mt-1 text-[13.5px] sm:text-[14px] font-semibold leading-snug
                                           text-tinta transition-colors group-hover:text-api dark:text-white dark:group-hover:text-white line-clamp-2 sm:line-clamp-3">
                              {b.judul}
                            </h3>
                          </div>
                          {b.lokasi && (
                            <div className="mt-3 pt-2.5 border-t border-black/[0.06] dark:border-white/10">
                              <p className="flex items-start gap-1.5 text-[11px] sm:text-[11.5px] leading-snug text-black/60 dark:text-white/55">
                                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
                                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                     className="mt-0.5 size-3 shrink-0 text-black/40 transition-colors group-hover:text-black/60 dark:text-white/40 dark:group-hover:text-white/60">
                                  <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
                                  <circle cx="12" cy="10" r="3" />
                                </svg>
                                <span className="line-clamp-2 transition-colors group-hover:text-black/80 dark:group-hover:text-white/80" title={b.lokasi}>
                                  {b.lokasi}
                                </span>
                              </p>
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <NavigasiHalaman halaman={halamanAktif} totalHalaman={totalHalaman}
                               awal={awalNomor} akhir={akhirNomor} total={tampil.length}
                               onPilih={keHalaman} />
              </>
            ) : (
            <>
            <ul>
              {tampilHalaman.map(({ b, i }) => {
                /* Pratinjau diambil dari media asli kejadian (galeri `media`),
                   bukan dari `gambar` yang tadinya selalu diberi foto bawaan —
                   kartu kejadian bervideo-galeri tampil dengan foto dummy yang
                   sama semua. Kejadian tanpa media sama sekali menampilkan
                   placeholder lokasi, bukan foto dummy. */
                const awal = b.media[0];
                return (
                <li key={b.id} className="border-b border-black/[0.06] dark:border-white/10 last:border-b-0">
                  <button type="button" onClick={() => onBukaRincian(i)}
                          className="group -mx-2 flex w-[calc(100%+1rem)] sm:-mx-2.5 sm:w-[calc(100%+1.25rem)] cursor-pointer items-center
                                     gap-3 sm:gap-[clamp(14px,3.6vw,36px)] rounded-[10px] p-2 sm:px-2.5 sm:py-[clamp(14px,2.8vw,22px)]
                                     text-left transition-colors
                                     hover:bg-black/[0.04] active:bg-black/[0.08]
                                     dark:hover:bg-white/10 dark:active:bg-white/15
                                     panggung:gap-[48px] panggung:py-[24px]">
                    <div className="relative shrink-0 overflow-hidden rounded-[10px] bg-black/5 ring-1 ring-black/10 dark:bg-white/10 dark:ring-white/15">
                      <PratinjauMedia awal={awal} pulau={b.pulau} sizes="210px"
                                      kelas="h-[76px] w-[104px] sm:h-[clamp(80px,18vw,120px)] sm:w-[clamp(120px,27vw,190px)] object-cover
                                             transition-transform duration-300 group-hover:scale-105
                                             panggung:h-[130px] panggung:w-[210px]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-black/60 dark:text-white/55">
                        <span className="font-medium text-black/60 transition-colors group-hover:text-black/80 dark:text-white/55 dark:group-hover:text-white/80">
                          {b.tanggal}
                        </span>
                        {b.lokasi && (
                          <>
                            <span className="text-black/30 dark:text-white/30">·</span>
                            <span className="truncate text-black/50 dark:text-white/50">{b.lokasi}</span>
                          </>
                        )}
                      </div>
                      <p className="mt-1 sm:mt-1.5 text-sm sm:text-base font-semibold leading-snug
                                    text-tinta transition-colors group-hover:text-api dark:text-white dark:group-hover:text-white">
                        {b.judul}
                      </p>
                    </div>
                  </button>
                </li>
                );
              })}
            </ul>
            <NavigasiHalaman halaman={halamanAktif} totalHalaman={totalHalaman}
                             awal={awalNomor} akhir={akhirNomor} total={tampil.length}
                             onPilih={keHalaman} />
            </>
            )
          ) : (
            <p className="py-6 sm:py-[clamp(24px,7vw,48px)] text-[length:var(--ukuran-catatan)] leading-[1.5] text-black/65 dark:text-white/65">
              Belum ada laporan untuk <span className="font-semibold text-tinta dark:text-white">{tab.label}</span>
              {adaSaringan ? " pada rentang tanggal ini" : ""}.
              {adaSaringan && (
                <button type="button" onClick={hapusTanggal}
                        className="mt-2 block font-semibold text-bara underline underline-offset-2
                                   transition-colors hover:text-api">
                  Hapus saringan tanggal
                </button>
              )}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

/** Navigasi halaman daftar berita — dipakai kedua mode tampilan. Klien murni
 *  (tanpa query URL): datanya sudah ada semua di `berita`, jadi pindah halaman
 *  hanya mengiris tampilan tanpa memuat ulang. Disembunyikan bila semuanya
 *  muat dalam satu halaman. */
function NavigasiHalaman({ halaman, totalHalaman, awal, akhir, total, onPilih }: {
  halaman: number;
  totalHalaman: number;
  awal: number;
  akhir: number;
  total: number;
  onPilih: (h: number) => void;
}) {
  if (totalHalaman <= 1) return null;

  // Nomor dengan elipsis cerdas (1 … 4 5 6 … 12) — pola yang sama dengan
  // paginasi CMS supaya pengunjung hanya belajar sekali.
  const nomor: (number | "...")[] = [];
  for (let i = 1; i <= totalHalaman; i++) {
    if (i === 1 || i === totalHalaman || (i >= halaman - 1 && i <= halaman + 1)) {
      nomor.push(i);
    } else if (nomor[nomor.length - 1] !== "...") {
      nomor.push("...");
    }
  }

  const kelasTombol =
    "flex min-h-[34px] cursor-pointer items-center justify-center gap-1 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs sm:text-sm font-semibold text-tinta shadow-xs transition-colors hover:border-black/20 hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-black/10 disabled:hover:bg-white focus-visible:border-black/30 focus-visible:ring-1 focus-visible:ring-black/20 focus-visible:outline-none dark:border-white/15 dark:bg-pantau-malam dark:text-white dark:hover:border-white/30 dark:hover:bg-white/10 dark:disabled:hover:border-white/15 dark:disabled:hover:bg-pantau-malam dark:focus-visible:border-white/40 dark:focus-visible:ring-white/40";

  return (
    <nav aria-label="Paginasi laporan"
         className="mt-4 flex flex-col items-center gap-2.5 border-t border-black/[0.08] dark:border-white/10 pt-3.5 sm:mt-5">
      <p className="text-[length:var(--ukuran-catatan)] text-black/60 dark:text-white/55">
        Menampilkan {awal}–{akhir} dari {total} laporan
      </p>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <button type="button" onClick={() => onPilih(halaman - 1)} disabled={halaman <= 1}
                aria-label="Halaman sebelumnya" className={kelasTombol}>
          ← Sebelumnya
        </button>
        <div className="hidden items-center gap-1 px-1 min-[430px]:flex">
          {nomor.map((item, idx) =>
            item === "..." ? (
              <span key={`ellipsis-${idx}`} className="select-none px-1.5 text-[13px] text-black/40 dark:text-white/40">
                …
              </span>
            ) : item === halaman ? (
              <span key={item} aria-current="page"
                    className="grid min-h-[34px] min-w-[34px] place-items-center rounded-lg bg-tinta text-white px-2 py-1.5 text-xs sm:text-sm font-bold shadow-xs dark:bg-white dark:text-black">
                {item}
              </span>
            ) : (
              <button key={item} type="button" onClick={() => onPilih(item)}
                      aria-label={`Halaman ${item}`} className={kelasTombol}>
                {item}
              </button>
            ),
          )}
        </div>
        <button type="button" onClick={() => onPilih(halaman + 1)} disabled={halaman >= totalHalaman}
                aria-label="Halaman selanjutnya" className={kelasTombol}>
          Selanjutnya →
        </button>
      </div>
    </nav>
  );
}

/** Pratinjau media pertama kejadian untuk kedua mode tampilan: video (dengan
 *  poster/bingkai #t=0.5), foto, atau petunjuk lokasi saat kejadian tak punya
 *  media sama sekali — bukan foto dummy. `kelas` menentukan kotaknya agar
 *  baris daftar (kotak tetap) dan kartu (kotak 16:10) bisa berbagi logika. */
function PratinjauMedia({ awal, pulau, kelas, sizes }: {
  awal: ItemMedia | undefined;
  pulau: string | null;
  kelas: string;
  /** Lebar kotak untuk srcset next/image (hanya unggahan lokal). */
  sizes: string;
}) {
  if (awal?.jenis === "video") {
    /* #t=0.5 meminta peramban melompat ke detik itu; tanpa itu <video> tanpa
       poster berhenti di bingkai kosong. Poster bingkai otomatis (bila ada)
       tampil lebih instan. */
    return (
      <video src={`${awal.url}#t=0.5`} poster={awal.poster} preload="none" muted
             playsInline aria-hidden="true" className={kelas} />
    );
  }
  if (awal) {
    /* loading+decoding: berkasnya media asli pengunggah (tanpa turunan kecil),
       jadi satu halaman = sepuluh bitmap penuh. `lazy` menyisakan yang di
       bawah lipatan rel gulir, `async` menjauhkan dekodenya dari jalur utama. */
    if (mediaLokal(awal.url)) {
      // Unggahan lokal: optimizer memotong bitmap penuh itu seukuran kotaknya.
      return <Image src={awal.url} alt="" aria-hidden="true" loading="lazy" width={0} height={0}
                    sizes={sizes} className={kelas} />;
    }
    // eslint-disable-next-line @next/next/no-img-element -- URL media remote warisan, host dinamis di luar remotePatterns
    return <img src={awal.url} alt="" aria-hidden="true" loading="lazy" decoding="async" className={kelas} />;
  }
  return (
    <div aria-hidden="true"
         className={`flex items-center justify-center bg-black/5 dark:bg-white/10 ${kelas}`}>
      <span className="rounded-full bg-black/10 dark:bg-white/15 px-2 py-0.5 text-[10px] font-semibold
                       uppercase tracking-wide text-black/60 dark:text-white/60">
        {pulau || "Belum ada foto"}
      </span>
    </div>
  );
}

/** Rangka daftar selama panel tumbuh — bentuknya mengikuti mode tampilan
 *  supaya isinya tidak melompat saat menggantikan rangka ini. */
function RangkaDaftar({ mode }: { mode: ModeTampilan }) {
  const petak = Array.from({ length: mode === "kartu" ? 10 : 5 });
  return (
    <div aria-hidden="true" className="animate-pulse">
      {mode === "kartu" ? (
        <div className="grid grid-cols-1 min-[430px]:grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3
                        panggung:grid-cols-5 panggung:gap-[20px] xl:grid-cols-5">
          {petak.map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-black/[0.08] bg-white dark:border-white/10 dark:bg-pantau-malam">
              <div className="aspect-[16/10] w-full bg-black/5 dark:bg-white/10" />
              <div className="space-y-2 p-3 sm:p-3.5">
                <div className="h-2.5 w-1/3 rounded bg-black/5 dark:bg-white/10" />
                <div className="h-3 w-full rounded bg-black/5 dark:bg-white/10" />
                <div className="h-3 w-2/3 rounded bg-black/5 dark:bg-white/10" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>
          {petak.map((_, i) => (
            <div key={i} className="flex items-center gap-3 sm:gap-[clamp(14px,3.6vw,36px)] border-b border-black/[0.06] dark:border-white/10 py-2 last:border-b-0
                                    sm:py-[clamp(14px,2.8vw,22px)]">
              <div className="h-[76px] w-[104px] shrink-0 rounded-[10px] bg-black/5 dark:bg-white/10
                              sm:h-[clamp(80px,18vw,120px)] sm:w-[clamp(120px,27vw,190px)]" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-2.5 w-1/4 rounded bg-black/5 dark:bg-white/10" />
                <div className="h-3.5 w-full rounded bg-black/5 dark:bg-white/10" />
                <div className="h-3.5 w-3/5 rounded bg-black/5 dark:bg-white/10" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Satu segmen saklar mode tampilan (daftar/kartu). */
