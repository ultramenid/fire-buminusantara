"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Peta } from "@/components/peta";
import { Nav } from "@/components/nav";
import { gunakanKolomUmpan } from "@/hooks/gunakan-kolom-umpan";
import { ambilStatistik, type Statistik as DataStatistik } from "@/lib/statistik";
import type { KunciSorotan } from "@/lib/statistik-sorotan-teks";
import { type Bahasa } from "@/lib/bahasa";
import type { Berita } from "@/lib/events";
import { waktuIso, waktuTeks } from "@/lib/tanggal";
import { PULAU_TAB } from "@/lib/wilayah";
import { BilahSaringan, SaklarSegmen } from "@/components/bilah-saringan";
import { useTheme } from "next-themes";
import { useMounted } from "@/hooks/use-mounted";
import { mediaLokal } from "@/lib/media";

/* Modul-modul pendukung hasil pemecahan berkas ini — lihat folder
   components/landing-karhutla/. Berkas utama tetap di sini supaya
   rute-rute pemanggilnya (/[locale], /karhutla, /fire/[slug], /panel)
   tak perlu berubah. */
import { TEKS } from "./landing-karhutla/teks";
import { UKURAN_FOTO_UMPAN, VideoOtomatis } from "./landing-karhutla/video-otomatis";
import { UmpanMasonry } from "./landing-karhutla/umpan-masonry";
import { KomposerLapor } from "./landing-karhutla/komposer-lapor";
import { IsiSaranLokasi } from "./landing-karhutla/saran-lokasi";
import { TabRelKiri } from "./landing-karhutla/tab-rel-kiri";
import { LembarKomentar } from "./landing-karhutla/lembar-komentar";
import { useCuacaLokal } from "./landing-karhutla/gunakan-cuaca";
import { useAliran } from "./landing-karhutla/gunakan-aliran";
import type { Laporan, SaranLokasi } from "./landing-karhutla/tipe";
import {
  IkonCari, IkonLokasi, IkonTutup, IkonCuaca, IkonPlus, IkonPanel, IkonUmpan,
} from "./landing-karhutla/ikon";

// Ekspor ulang API publik lama — postingan-halaman.tsx dan pemanggil lain
// mengimpornya dari berkas ini. Ditunjukkan ke modul aslinya satu per satu:
// "./landing-karhutla" saja ambigu dengan berkas ini sendiri.
export { TampilanPostingan } from "./landing-karhutla/tampilan-postingan";
export { LembarKomentar } from "./landing-karhutla/lembar-komentar";
export { IkonBeranda, IkonTulis, IkonUmpan } from "./landing-karhutla/ikon";
export type { Laporan, SaranLokasi } from "./landing-karhutla/tipe";

/* Dimuat terpisah: semuanya baru tampil sesudah interaksi (buka rincian,
   tekan provinsi), jadi tak perlu ikut bundel awal. Rincian tetap di-SSR
   karena rute /fire/<slug> merendernya terbuka sejak awal. */
const RincianLaporan = dynamic(() => import("@/components/rincian-laporan").then((m) => m.RincianLaporan));
const PopupPeta = dynamic(() => import("@/components/popup-peta").then((m) => m.PopupPeta), { ssr: false });

/** Panjang animasi keluar overlay peta selayar. Harus sama dengan
 *  @keyframes lk-peta-keluar di public/css/landing-karhutla.css. */
const DURASI_TUTUP_PETA = 200;

/* Default prop `berita` — WAJIB konstanta modul, bukan literal `[]` di
   parameter: literal dievaluasi ulang jadi array baru di setiap render,
   sehingga guard "prop berubah" di bawah (beritaAwal !== beritaAwalLama)
   tak pernah puas di halaman yang memanggil tanpa berita (mis. /panel) —
   setState saat render berputar tanpa henti → "Too many re-renders". */
const BERITA_KOSONG: Berita[] = [];

export function LandingKarhutla(
  {
    bahasa,
    jumlahLaporan,
    berita: beritaAwal = BERITA_KOSONG,
    totalBerita = 0,
    tampil = "semua",
    statistik,
    kejadianAwal = null,
    kolomAwal,
  }: {
    bahasa: Bahasa;
    /** Peta butuh angka provinsi — halaman umpan tak memakainya. */
    jumlahLaporan?: Record<string, number>;
    /** Potongan awal umpan (24 teratas) — sisanya diambil dari /api/umpan. */
    berita?: Berita[];
    /** Banyak kejadian seluruhnya; lebih besar dari `berita` = masih ada sisa. */
    totalBerita?: number;
    /** "semua" = dasbor (desktop dua rel; seluler hanya daftar laporan);
        "panel" = halaman panel situasi saja (peta+cuaca+statistik). */
    tampil?: "semua" | "panel";
    /** Enam angka kartu statistik dari CMS (bawaan 5.000 bila kosong). */
    sorotan?: Record<KunciSorotan, number>;
    /** Empat angka kartu statistik historis. */
    statistik?: DataStatistik[];
    /** Kejadian awal yang langsung dibuka saat halaman dimuat (mis. rute /fire/<slug>). */
    kejadianAwal?: Berita | null;
    /** Jumlah kolom awal untuk SSR (2 untuk seluler, 3 untuk desktop). */
    kolomAwal?: number;
  },
) {
  const t = TEKS[bahasa];
  const daftarStatistik = statistik ?? ambilStatistik(bahasa);
  /* Umpan penuh: server hanya mengirim potongan awal supaya payload RSC tetap
     kecil; daftar lengkap diambil saat peramban senggang, atau seketika saat
     pengunjung butuh (saringan, urutan, cari, pop-up provinsi, rincian).
     Gagal = tetap memakai potongan awal. Prop baru (router.refresh sesudah
     melapor) mengulang dari potongan barunya. */
  const [berita, setBerita] = useState(beritaAwal);
  const [beritaAwalLama, setBeritaAwalLama] = useState(beritaAwal);
  if (beritaAwal !== beritaAwalLama) {
    setBeritaAwalLama(beritaAwal);
    setBerita(beritaAwal);
  }
  const dimuatUntuk = useRef<Berita[] | null>(null);
  const muatPenuh = useCallback(() => {
    if (totalBerita <= beritaAwal.length || dimuatUntuk.current === beritaAwal) return;
    dimuatUntuk.current = beritaAwal;
    fetch(`/api/umpan?bahasa=${bahasa}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: unknown) => {
        if (dimuatUntuk.current === beritaAwal && Array.isArray(d)) setBerita(d as Berita[]);
      })
      .catch(() => {
        // Boleh dicoba lagi pada interaksi berikutnya.
        if (dimuatUntuk.current === beritaAwal) dimuatUntuk.current = null;
      });
  }, [beritaAwal, totalBerita, bahasa]);
  useEffect(() => {
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(muatPenuh, { timeout: 4000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(muatPenuh, 1500);
    return () => clearTimeout(id);
  }, [muatPenuh]);
  // Lokasi + suhu otomatis dari IP (tanpa izin geolokasi); sebelum tiba,
  // lokasi memakai teks statis dan suhu memakai garis jeda.
  const cuaca = useCuacaLokal(bahasa, t.lokasi);
  const [modeCariCuaca, setModeCariCuaca] = useState(false);
  const [kueriCuaca, setKueriCuaca] = useState("");
  const inputCuacaRef = useRef<HTMLInputElement>(null);
  const wadahSelectRef = useRef<HTMLDivElement>(null);
  const [daftarSaran, setDaftarSaran] = useState<
    Array<{
      id: string;
      nama: string;
      provinsi: string;
      lat: number;
      lng: number;
      adm4?: string;
      tipe?: string;
    }>
  >([]);
  const [memuatSaran, setMemuatSaran] = useState(false);
  const [indeksPilihan, setIndeksPilihan] = useState(-1);

  /* Memilih satu saran lokasi: peta + cuaca pindah ke sana, modenya tutup.
     Satu jalur untuk dropdown sumur lokasi dan panel bilah atas. */
  const pilihLokasi = useCallback(async (item: SaranLokasi) => {
    await cuaca.pilihSaran(item);
    setModeCariCuaca(false);
    setKueriCuaca("");
    setDaftarSaran([]);
  }, [cuaca]);

  /* Papan ketik kolom saran lokasi — panah memilih, Enter mencari/memilih,
     Escape menutup. Dipakai kolom sumur lokasi dan kolom bilah atas. */
  const tombolSaranLokasi = useCallback(async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setModeCariCuaca(false);
      setKueriCuaca("");
      setDaftarSaran([]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (daftarSaran.length > 0) {
        setIndeksPilihan((idx) => (idx + 1) % daftarSaran.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (daftarSaran.length > 0) {
        setIndeksPilihan((idx) => (idx - 1 + daftarSaran.length) % daftarSaran.length);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (indeksPilihan >= 0 && indeksPilihan < daftarSaran.length) {
        await pilihLokasi(daftarSaran[indeksPilihan]);
      } else if (kueriCuaca.trim()) {
        await cuaca.cari(kueriCuaca);
        setModeCariCuaca(false);
        setKueriCuaca("");
        setDaftarSaran([]);
      }
    }
  }, [cuaca, daftarSaran, indeksPilihan, kueriCuaca, pilihLokasi]);

  useEffect(() => {
    let aktif = true;
    if (!modeCariCuaca || !kueriCuaca.trim()) {
      const resetTimer = setTimeout(() => {
        if (!aktif) return;
        setDaftarSaran([]);
        setMemuatSaran(false);
        setIndeksPilihan(-1);
      }, 0);
      return () => {
        aktif = false;
        clearTimeout(resetTimer);
      };
    }
    const startTimer = setTimeout(() => {
      if (!aktif) return;
      setMemuatSaran(true);
    }, 0);
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/cuaca-lokal?saran=${encodeURIComponent(kueriCuaca.trim())}`, {
          signal: AbortSignal.timeout(6000),
          headers: { Accept: "application/json" },
        });
        if (!aktif) return;
        if (r.ok) {
          const j = (await r.json()) as Array<{
            id: string;
            nama: string;
            provinsi: string;
            lat: number;
            lng: number;
            adm4?: string;
            tipe?: string;
          }>;
          setDaftarSaran(Array.isArray(j) ? j : []);
          setIndeksPilihan(Array.isArray(j) && j.length > 0 ? 0 : -1);
        } else {
          setDaftarSaran([]);
        }
      } catch {
        if (aktif) setDaftarSaran([]);
      } finally {
        if (aktif) setMemuatSaran(false);
      }
    }, 220);

    return () => {
      aktif = false;
      clearTimeout(startTimer);
      clearTimeout(timer);
    };
  }, [modeCariCuaca, kueriCuaca]);

  /* Cap waktu mode cari dibuka — masa tenggang klik-luar di bawah. */
  const bukaCariCuacaRef = useRef(0);
  useEffect(() => {
    if (!modeCariCuaca) return;
    bukaCariCuacaRef.current = Date.now();
    const tanganiKlikLuar = (e: MouseEvent) => {
      /* Masa tenggang: ketukan pembukanya sendiri tak boleh langsung
         menutupnya. Sentuhan di sebagian peramban/harness otomasi tiba
         sebagai mousedown ganda yang mengapit pemasangan pendengar ini —
         tanpa ini ketukan pertama membuka lalu langsung menutup lagi. */
      if (Date.now() - bukaCariCuacaRef.current < 350) return;
      const sasaran = e.target as HTMLElement | null;
      /* Panel pencarian bilah atas adalah rumah kedua mode ini di seluler —
         ketukan di dalamnya (kolom maupun saran) bukan klik luar. */
      if (sasaran?.closest?.("#nav-panel-cari")) return;
      if (wadahSelectRef.current && !wadahSelectRef.current.contains(e.target as Node)) {
        setModeCariCuaca(false);
        setKueriCuaca("");
        setDaftarSaran([]);
      }
    };
    document.addEventListener("mousedown", tanganiKlikLuar);
    return () => {
      document.removeEventListener("mousedown", tanganiKlikLuar);
    };
  }, [modeCariCuaca]);
  const [cari, setCari] = useState("");
  /* Kolom pencarian tinggal di bilah kepala dan baru turun saat ikonnya
     diklik. Menutupnya sekaligus mengosongkan kata kuncinya: begitu kolomnya
     tak terlihat, penyaring yang masih aktif berubah jadi keadaan tersembunyi
     — umpan tampak memendek tanpa sebab yang kelihatan di layar. */
  const [cariBuka, setCariBuka] = useState(false);
  const ubahCariBuka = useCallback((buka: boolean) => {
    setCariBuka(buka);
    if (!buka) setCari("");
  }, []);
  /* Datang dari tombol cari di halaman panel seluler: di sana umpannya tidak
     dirender, jadi tombolnya mengantar ke halaman ini dan penanda ?cari=1
     inilah yang membuka kolomnya begitu sampai.

     Penandanya langsung dihapus dari URL: ia perintah sekali pakai, bukan
     keadaan halaman — kalau dibiarkan ia ikut terbagikan saat ditautkan dan
     membuka kolom lagi setiap kali halaman dimuat ulang. Sengaja tanpa
     dependensi apa pun: umpanTerlihat baru lahir jauh di bawah sini, dan
     mencantumkannya berarti daftar dependensi ini dievaluasi sebelum variabel
     itu ada. */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("cari") !== "1") return;
    // Async (bukan sinkron) supaya lolos react-hooks/set-state-in-effect.
    //
    // Penghapusan penandanya WAJIB ikut di dalam callback ini, bukan di luar.
    // Strict Mode menjalankan effect dua kali: kalau URL dibersihkan langsung
    // di badan effect, jalan pertama menghapus penandanya sementara cleanup
    // membatalkan timer-nya — tak ada yang terbuka — lalu jalan kedua membaca
    // URL yang sudah telanjur kosong dan menyerah. Dengan keduanya ditunda
    // bersama, jalan yang dibatalkan tidak meninggalkan jejak apa pun.
    const jam = window.setTimeout(() => {
      setCariBuka(true);
      const params = new URLSearchParams(window.location.search);
      params.delete("cari");
      const sisa = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (sisa ? `?${sisa}` : ""));
    }, 0);
    return () => window.clearTimeout(jam);
  }, []);
  /* Kembaran ?cari=1 untuk tombol "+" di bilah tab halaman panel: komposer
     tinggal di rel kanan yang tidak dirender di sana, jadi tombolnya mengantar
     ke halaman ini dan penanda inilah yang membukanya begitu sampai.

     Yang ditekan persis tombol yang sama dengan tab "+" di halaman daftar —
     satu jalur, bukan dua perilaku yang harus dijaga sinkron. Penandanya
     dihapus dari URL bersama-sama di dalam callback, dengan alasan Strict Mode
     yang sama seperti ?cari=1 di atas. */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tulis") !== "1") return;
    const jam = window.setTimeout(() => {
      (document.getElementById("lk-tulis") as HTMLButtonElement | null)?.click();
      window.setTimeout(() => document.getElementById("lk-judul")?.focus({ preventScroll: true }), 150);
      const params = new URLSearchParams(window.location.search);
      params.delete("tulis");
      const sisa = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (sisa ? `?${sisa}` : ""));
    }, 0);
    return () => window.clearTimeout(jam);
  }, []);
  /* Rel kiri (peta WebGL) hanya dirender bila terlihat: di halaman utama
     seluler ia dilepas supaya ponsel tak membayar MapLibre + tile + Zarr
     untuk peta yang tak tampil. Kelas lk-hanya-panggung tetap dipasang
     sebagai jaring pengaman (tanpa JS, CSS yang menyembunyikan). */
  const aliran = useAliran();
  /* Halaman /panel hanya untuk seluler: pengunjung desktop yang membuka
     langsung dikembalikan ke dasbor utuh. Dibaca live dari matchMedia (bukan
     state aliran): saat efek ini jalan pertama kali, state masih memegang
     snapshot server (panggung) sehingga membaca state salah mengusir
     pengunjung seluler ke dasbor.

     Tujuannya /<bahasa>, BUKAN /<bahasa>/karhutla. Keduanya merender dasbor
     yang sama sejak akar bahasa dijadikan halaman karhutla, tapi di mode
     etalase /<bahasa>/karhutla ditutup dan dialihkan 308 ke /<bahasa> — jadi
     mengarah ke sana membuat pengunjung desktop memantul DUA kali sebelum
     mendarat. Menuju akar bahasa langsung memangkas satu lompatan itu, dan
     berlaku benar di kedua mode.

     Catatan supaya tak salah duga di kemudian hari: sesudah pindah, DOM masih
     memuat subtree rute lama (terukur: dua .lk-bingkai, dua <main>) dan salah
     satunya membawa kelas mode panel. Itu bawaan navigasi lunak App Router,
     BUKAN akibat rantai pengalihan di atas — gejalanya sama persis di lokal
     yang tidak memakai mode etalase. Subtree itu display:none dan berukuran
     nol, jadi tak terlihat pengunjung. */
  const router = useRouter();
  useEffect(() => {
    if (tampil !== "panel") return;
    const panggung = window.matchMedia("(min-width: 1100px) and (min-height: 640px)").matches;
    if (panggung) {
      router.replace(`/${bahasa}`);
    }
  }, [tampil, bahasa, router]);
  /* Rel kiri bisa dilipat seperti di index. Lebarnya satu sumber: dipakai
     trek grid sekaligus posisi tombolnya. */
  const LEBAR_REL_KIRI = "clamp(340px,33.5vw,680px)";
  const [kiriBuka, setKiriBuka] = useState(true);
  /* Lembar panel seluler: terkatup atau mengintip. Hanya dipakai di halaman
     panel; di panggung kelasnya tak punya gaya apa pun.

     Mulai TERKATUP: halaman ini satu layar penuh peta, dan lembar yang terbuka
     duluan menutupi bilah waktu di dasar peta (z-2 di atas bingkai peta yang
     z-0). Angka situasi naik saat gagangnya ditekan — pola yang sama dengan
     lembar komentar. */
  const [lembarTutup, setLembarTutup] = useState(true);
  /* Seretan gagang. Tanpa pustaka dan tanpa mengikuti jari piksel demi
     piksel: begitu lewat ambang 24px arahnya sudah ketahuan, dan transisi
     `height` milik lembarlah yang menganimasikan sisanya. Ketukan tetap
     membalik lewat onClick — `jauh` yang membedakan keduanya. */
  const seretGagang = useRef<{ mulai: number; jauh: boolean } | null>(null);
  const panelTerlihat = tampil === "panel" || !aliran;
  const umpanTerlihat = tampil === "semua" || !aliran;

  // Pop-up rincian seperti index: tetap di halaman ini, URL ikut ke
  // /fire/<slug> supaya bisa dibagikan, kembali ke halaman ASAL saat ditutup
  // (rute mana pun yang me-render komponen ini: /, /karhutla, /panel).
  const [sorot, setSorot] = useState<Berita | null>(kejadianAwal ?? null);
  /* Provinsi yang ditekan di peta — pop-upnya tumbuh dari titik layar itu,
     pola yang sama dengan konsol /peta. */
  const [wilayah, setWilayah] = useState<
    { nama: string; pulau: string | null; asal: { x: number; y: number } } | null
  >(null);
  const pathAwalRef = useRef<string>("");
  const bukaRincian = useCallback(
    (b: Berita) => {
      setSorot(b);
      if (typeof window !== "undefined") {
        pathAwalRef.current = window.location.pathname;
        const pathTujuan = b.slug ? `/${bahasa}/fire/${b.slug}` : window.location.pathname;
        if (window.location.pathname !== pathTujuan) {
          window.history.replaceState({ lkRincian: b.slug ?? true }, "", pathTujuan);
        }
      }
    },
    [bahasa],
  );
  const tutupRincian = useCallback(() => {
    setSorot(null);
    if (typeof window !== "undefined") {
      const pathBeranda = `/${bahasa}`;
      const pathKembali =
        pathAwalRef.current && !/\/fire\/[^/]+$/.test(pathAwalRef.current)
          ? pathAwalRef.current
          : pathBeranda;
      if (window.location.pathname !== pathKembali) {
        window.history.replaceState(null, "", pathKembali);
      }
    }
  }, [bahasa]);
  useEffect(() => {
    const saatPopState = () => {
      const cocokan = window.location.pathname.match(/\/fire\/([^/]+)$/);
      if (cocokan && cocokan[1]) {
        const slug = decodeURIComponent(cocokan[1]);
        const ketemu = berita.find((b) => b.slug === slug || String(b.id) === slug);
        if (ketemu) {
          setSorot(ketemu);
          return;
        }
        muatPenuh();
      }
      setSorot(null);
    };
    window.addEventListener("popstate", saatPopState);
    return () => window.removeEventListener("popstate", saatPopState);
  }, [berita, muatPenuh]);
  const bukaDariId = useCallback(
    (id: number) => {
      const asli = berita.find((b) => b.id === id);
      if (asli) bukaRincian(asli);
    },
    [berita, bukaRincian],
  );

  // Tap media: di seluler pindah ke halaman Postingan; di desktop langsung
  // pop-up rincian. Tanpa slug (tak bisa ditautkan) langsung pop-up juga.
  // Dibaca live (bukan state aliran) supaya selalu benar.
  /* Overlay peta selayar — dibuka lewat tombol bentang di sudut bingkai.
     Di-render di portal body, tapi petanya BUKAN instance kedua: node <Peta>
     yang sudah hidup dipindah ke sini (lihat hostPeta di bawah). */
  const [petaPenuh, setPetaPenuh] = useState(false);
  /* Fase tutup: overlay bertahan selama animasi keluar, baru dilepas — tanpa
     ini petanya lompat balik ke bingkai tanpa transisi. */
  const [menutupPenuh, setMenutupPenuh] = useState(false);
  const menutupRef = useRef(false);
  const tutupPenuh = useCallback(() => {
    if (menutupRef.current) return;
    menutupRef.current = true;
    setMenutupPenuh(true);
    setTimeout(() => {
      menutupRef.current = false;
      setMenutupPenuh(false);
      setPetaPenuh(false);
    }, DURASI_TUTUP_PETA);
  }, []);

  /* Escape menutup overlay — pola yang sama dengan pop-up lain di konsol.
     Badan dikunci supaya roda/sentuh di belakang overlay tak ikut menggulir
     halaman. */
  useEffect(() => {
    if (!petaPenuh) return;
    const tekan = (e: KeyboardEvent) => {
      if (e.key === "Escape") tutupPenuh();
    };
    window.addEventListener("keydown", tekan);
    const limpahan = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tekan);
      document.body.style.overflow = limpahan;
    };
  }, [petaPenuh, tutupPenuh]);

  /* Skala bingkai peta. Dua hal dipisah di sini: BESAR pengecilnya dihitung
     dari lebar rel yang diukur (lihat di bawah), sedangkan PILIHAN modenya
     mengikuti breakpoint panggung/aliran halaman ini. */
  const bingkaiPetaRef = useRef<HTMLDivElement>(null);


  const isiPetaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bingkai = bingkaiPetaRef.current;
    const isi = isiPetaRef.current;
    if (!bingkai || !isi) return;
    /* Lebar LOGIS dibuat adaptif, bukan tetap. Tujuannya menjaga ukuran tampak
       perkakas konstan di ~0,35 ukuran asli — angka yang dipakai rujukan desain
       — berapa pun lebar relnya.

       Rumusnya turun dari peta-asap.tsx: hamparannya mengecil sendiri sebesar
       max(0,6; L/1760), dan legenda baru terbuka bila L >= AMBANG_SEMPIT (800).
       Selama L <= 1056 pengecilnya mentok di lantai 0,6, jadi ukuran tampak
       perkakas = 0,6 x (w / L). Menyetel itu ke 0,35 memberi L = 1,714 w.

       Versi sebelumnya memakai L tetap 1080px dengan ambang lebar 560px, dan
       pengukuran membuktikannya salah: HANYA layar 1920 yang lolos (bingkai
       603px) — 1728 sudah 539px, dan di zoom 125% (viewport 1536) relnya 475px,
       sehingga peta balik ke ukuran asli. */
    const RASIO = 1080 / 544;
    const SASARAN = 0.65;
    const LANTAI_HAMPARAN = 0.6;
    const AMBANG_SEMPIT = 800;
    const LEBAR_LOGIS_MAKS = 1760;
    /* Yang memilih mode adalah breakpoint panggung/aliran halaman ini, BUKAN
       ambang piksel pada bingkai peta. Di aliran peta digambar seukuran
       aslinya, memakai pola bingkai sempit milik PetaAsap yang memang
       dirancang untuk layar sempit.

       Ambang piksel sudah dicoba dua kali (560px lalu 380px) dan keduanya
       meleset, karena jarak antara kedua kasus cuma 31px: bingkai ponsel 382px
       di layar 414, bingkai desktop tersempit 413px di layar 1280. Ambang 380
       lolos hanya berkat selisih 2px — ponsel 430px atau ponsel melintang akan
       jatuh ke sisi yang salah. Dan jatuh ke sisi yang salah itu mahal: pada
       mode terskala perkakas ponsel menyusut ke 0,286, membuat tombol putar
       dan penggeser bilah waktu tinggal ~10px — terlalu kecil untuk disentuh,
       bukan sekadar sulit dibaca.

       Kuerinya sama persis dengan varian `panggung` di app/globals.css. */
    const panggung = window.matchMedia("(min-width: 1100px) and (min-height: 640px)");
    /* Gaya ditulis langsung ke elemen, bukan lewat state: menyetel state dari
       dalam effect dilarang `react-hooks/set-state-in-effect`, dan ini murni
       perkara tampilan yang tak perlu memicu render ulang. */
    const skalakan = () => {
      const lebar = bingkai.clientWidth;
      if (!lebar) return;
      const gaya = isi.style;
      /* Selagi membentang selayar, node peta tinggal di overlay: slot ini
         kosong dan skalanya tak berlaku lagi. */
      if (panggung.matches && !petaPenuh) {
        const logis = Math.min(
          LEBAR_LOGIS_MAKS,
          Math.max(AMBANG_SEMPIT, (LANTAI_HAMPARAN / SASARAN) * lebar),
        );
        gaya.inset = "auto";
        gaya.top = "0";
        gaya.left = "0";
        gaya.width = `${logis}px`;
        gaya.height = `${logis / RASIO}px`;
        gaya.transformOrigin = "top left";
        gaya.transform = `scale(${lebar / logis})`;
        /* min-h pembungkus hanya urusan mode ukuran asli. Dibiarkan menyala di
           sini ia menyisakan pita kosong di dasar kotak: pembungkus dipaksa
           280px sementara isi terskala cuma setinggi lebar/rasio. */
        bingkai.style.minHeight = "0px";
      } else {
        /* Kembali ke ukuran asli: gaya sebaris dilepas supaya aturan
           .lk-peta-isi (inset:0) dan min-h kelasnya yang berlaku lagi. min-h itu
           menjaga tinggi tetap di atas AMBANG_LIPAT (200px) milik peta-asap.tsx,
           yang di bawahnya buffer WebGL tak dialokasikan ulang. */
        gaya.inset = "";
        gaya.top = "";
        gaya.left = "";
        gaya.width = "";
        gaya.height = "";
        gaya.transformOrigin = "";
        gaya.transform = "";
        bingkai.style.minHeight = "";
      }
    };
    skalakan();
    const amati = new ResizeObserver(skalakan);
    amati.observe(bingkai);
    /* ResizeObserver saja buta terhadap perpindahan mode ini: melintasi ambang
       min-height 640px bisa terjadi tanpa lebar bingkai bergeser sedikit pun,
       padahal perlintasan itulah yang menentukan modenya. */
    panggung.addEventListener("change", skalakan);
    return () => {
      amati.disconnect();
      panggung.removeEventListener("change", skalakan);
    };
  }, [petaPenuh]);

  /* SATU instance <Peta> untuk bingkai kecil DAN overlay selayar. Node-nya
     dipindah antar slot lewat appendChild; React merendernya ke wadah lepas
     ini sekali saja, jadi tak ada pemasangan ulang.

     Instance kedua — pola sebelumnya — berarti MapLibre baru, konteks WebGL
     baru, dan 61 frame sebaran asap diunduh ulang ke cache instance itu:
     itulah kedipan saat membentang, walau peta kecilnya sudah lama siap.
     Kanvas tetap hidup saat dipindah; MapLibre menyesuaikan diri lewat
     ResizeObserver miliknya di peta-asap.tsx. */
  /* Wadahnya baru ada SESUDAH pasang. Bukan kerewelan: server tak merender
     portal sama sekali, jadi render pertama klien harus ikut kosong — kalau
     tidak, portalnya sudah ada saat hidrasi sementara HTML server tidak dan
     React membuang seluruh pohon ini ("Hydration failed").

     Gerbangnya useSyncExternalStore, bukan setState di effect: snapshot server
     (false) yang dipakai React saat hidrasi itulah yang menjamin kecocokan,
     dan aturan set-state-in-effect repo ini melarang jalur satunya. */
  const terpasang = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [wadahPeta] = useState<HTMLDivElement | null>(() => {
    if (typeof document === "undefined") return null;
    const el = document.createElement("div");
    el.style.cssText = "position:absolute;inset:0";
    return el;
  });
  const hostPeta = terpasang ? wadahPeta : null;
  const slotPenuhRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tujuan = petaPenuh ? slotPenuhRef.current : isiPetaRef.current;
    if (hostPeta && tujuan && hostPeta.parentNode !== tujuan) tujuan.appendChild(hostPeta);
  }, [hostPeta, petaPenuh]);
  /* Umpan langsung dari basis data — SELURUH kejadian tayang, terbaru dulu,
     sama seperti arsip di index. Media utama (video pertama, kalau tidak foto
     pertama) untuk tampilan tunggal; galeri penuh untuk carousel kartu
     bermedia banyak; tanpa media sama sekali kartunya memakai placeholder. */
  const laporan = useMemo<Laporan[]>(
    () =>
      berita.map((b) => {
        const vid = b.media.find((m) => m.jenis === "video");
        const gbr = b.media.find((m) => m.jenis === "gambar");
        return {
          id: b.id,
          gambar: vid
            ? (vid.poster ?? b.poster ?? b.gambar)
            : (gbr?.url ?? b.gambar ?? b.poster),
          video: vid?.url ?? b.video ?? undefined,
          galeri: b.media
            .filter((m) => (m.jenis === "gambar" || m.jenis === "video") && m.url)
            .map((m) => ({ url: m.url, jenis: m.jenis, poster: m.poster, keterangan: m.keterangan })),
          alt: b.alt,
          judul: b.judul,
          tanggal: b.tanggal,
          lokasi: b.lokasi ?? b.provinsi,
          deskripsi: b.deskripsi,
          slug: b.slug,
          href: b.slug ? `/${bahasa}/fire/${b.slug}` : `/${bahasa}`,
          pulau: b.pulau,
          komentar: b.jumlahKomentar ?? 0,
        };
      }),
    [berita, bahasa],
  );
  const kata = cari.trim().toLowerCase();

  /* Bilah saringan umpan — rentang tanggal, wilayah pulau, dan mode tampilan.
     Rupa dan perilakunya sama dengan pop-up wilayah peta (BilahSaringan
     dipakai bersama); bedanya di sini ada "Semua wilayah" dan itu bawaannya,
     karena umpan adalah seluruh laporan, bukan laporan satu provinsi. */
  const { resolvedTheme } = useTheme();
  const temaSiap = useMounted();
  const temaGelap = temaSiap && resolvedTheme === "dark";
  const [dariUmpan, setDariUmpan] = useState("");
  const [sampaiUmpan, setSampaiUmpan] = useState("");
  const [wilayahUmpan, setWilayahUmpan] = useState("semua");
  const [urutanUmpan, setUrutanUmpan] = useState<"terbaru" | "komentar">("terbaru");
  const adaSaringanUmpan = Boolean(dariUmpan || sampaiUmpan || wilayahUmpan !== "semua");
  const hapusSaringanUmpan = () => {
    setDariUmpan("");
    setSampaiUmpan("");
    setWilayahUmpan("semua");
  };

  // Kata kunci + rentang tanggal lebih dulu, wilayah belakangan: jumlah di
  // tiap opsi wilayah dihitung dari hasil tahap pertama, jadi "(5 laporan)"
  // selalu sama dengan banyak kartu yang muncul saat opsi itu dipilih.
  const sebelumWilayah = useMemo(() => {
    const awal = waktuIso(dariUmpan);
    const akhir = waktuIso(sampaiUmpan);
    return laporan.filter((l) => {
      if (!l.judul.toLowerCase().includes(kata)) return false;
      const waktu = waktuTeks(l.tanggal);
      if (waktu === null) return true; // tanggal tak terbaca: jangan disembunyikan
      if (awal !== null && waktu < awal) return false;
      if (akhir !== null && waktu > akhir) return false;
      return true;
    });
  }, [laporan, kata, dariUmpan, sampaiUmpan]);
  const opsiWilayah = useMemo(() => [
    { kunci: "semua", label: t.semuaWilayah, jumlah: sebelumWilayah.length },
    ...PULAU_TAB.map((tab: (typeof PULAU_TAB)[number]) => ({
      kunci: tab.kunci,
      label: tab.label,
      jumlah: sebelumWilayah.filter((l) => !!l.pulau && (tab.isi as readonly string[]).includes(l.pulau)).length,
    })),
  ], [sebelumWilayah, t.semuaWilayah]);
  const hasil = useMemo(() => {
    const tab = PULAU_TAB.find((x: (typeof PULAU_TAB)[number]) => x.kunci === wilayahUmpan);
    const isi = tab ? (tab.isi as readonly string[]) : null;
    const tersaring = isi ? sebelumWilayah.filter((l) => !!l.pulau && isi.includes(l.pulau)) : sebelumWilayah;
    // Terbaru: tanggal kejadian, lalu id (yang dibuat belakangan dulu).
    // Komentar terbanyak: jumlah komentar, seri → yang lebih baru dulu.
    // Bawaan ("semua", tanpa pil menyala): sama dengan Terbaru — seluruh
    // data tampil dengan yang terbaru di atas.
    const baru = (a: Laporan, b: Laporan) => (waktuTeks(b.tanggal) ?? 0) - (waktuTeks(a.tanggal) ?? 0) || b.id - a.id;
    return [...tersaring].sort(urutanUmpan === "komentar"
      ? (a, b) => (b.komentar ?? 0) - (a.komentar ?? 0) || baru(a, b)
      : baru);
  }, [sebelumWilayah, wilayahUmpan, urutanUmpan]);
  // Interaksi yang butuh daftar lengkap tak menunggu waktu senggang.
  const butuhPenuh = Boolean(kata || adaSaringanUmpan || urutanUmpan !== "terbaru" || wilayah || sorot);
  useEffect(() => {
    if (butuhPenuh) muatPenuh();
  }, [butuhPenuh, muatPenuh]);

  /* Geser/panah antar-laporan di rincian mengikuti umpan YANG TERLIHAT —
     urutan dan saringannya — jadi "berikutnya" selalu kartu berikutnya di
     layar. Laporan yang dibuka dari luar umpan (mis. pop-up peta, atau yang
     tersaring keluar) jatuh ke urutan seluruh `berita`. */
  const urutanNav = useMemo(() => {
    if (!sorot || !hasil.some((l) => l.id === sorot.id)) return berita;
    const perId = new Map(berita.map((b) => [b.id, b]));
    return hasil.map((l) => perId.get(l.id)).filter((b): b is Berita => !!b);
  }, [sorot, hasil, berita]);
  const indeksSorot = sorot ? urutanNav.findIndex((b) => b.id === sorot.id) : -1;
  const adaSebelumnya = indeksSorot > 0;
  const adaBerikutnya = indeksSorot >= 0 && indeksSorot < urutanNav.length - 1;
  const keSebelumnya = adaSebelumnya ? () => bukaRincian(urutanNav[indeksSorot - 1]) : undefined;
  const keBerikutnya = adaBerikutnya ? () => bukaRincian(urutanNav[indeksSorot + 1]) : undefined;
  // Jumlah kolom umpan mengikuti keadaan rel kiri di desktop: rel terbuka =
  // 3 kolom, rel dilipat = 4 kolom memakai ruang yang bebas. Pergantian kolom
  // merombak partisi kartu (isi[i % kolom]) sehingga kartu berpindah kolom —
  // itu memang yang diminta saat rel dilipat. Di seluler lebar layar yang
  // menentukan (2 kolom), keadaan rel tidak berpengaruh.
  const kolom = gunakanKolomUmpan(kiriBuka, kolomAwal);
  const bukaMedia = useCallback(
    (id: number) => {
      bukaDariId(id);
    },
    [bukaDariId],
  );
  const [komentarId, setKomentarId] = useState<number | null>(null);

  return (
    <div className={`lk-bingkai${tampil === "panel" ? " lk-mode-panel" : ""} min-h-dvh bg-white text-tinta dark:bg-[#0a0a0a] dark:text-[#f5f5f5] pt-16 antialiased`}>
      {/* Bilah kepala SAMA dengan halaman index — <Nav gelap>: fixed h-16,
          logo Fire + merek + tombol Lapor + pemilih bahasa. pt-16 pada bingkai
          memberi ruang di bawah bilah yang fixed (pola halaman-peta.tsx). */}
      <Nav
        bahasa={bahasa}
        gelap
        cari={
          umpanTerlihat
            ? {
                nilai: cari,
                ubah: setCari,
                terbuka: cariBuka,
                setTerbuka: ubahCariBuka,
                placeholder: t.cariLaporan,
              }
            : {
                /* Panel seluler: umpannya tidak dirender di halaman ini, jadi
                   kolom di bilah atas ini MENCARI LOKASI (kota/provinsi) —
                   satu-satunya pencarian yang bisa bekerja tanpa pindah
                   halaman — lengkap dengan dropdown sarannya, di letak yang
                   sama dengan kolom cari laporan di halaman daftar. */
                nilai: kueriCuaca,
                ubah: setKueriCuaca,
                terbuka: modeCariCuaca,
                setTerbuka: (buka: boolean) => {
                  setModeCariCuaca(buka);
                  if (!buka) {
                    setKueriCuaca("");
                    setDaftarSaran([]);
                  }
                },
                placeholder: t.cariLokasiCuaca,
                tombol: tombolSaranLokasi,
                saran:
                  kueriCuaca.trim() !== "" || memuatSaran || daftarSaran.length > 0 ? (
                    <div
                      role="listbox"
                      aria-label={bahasa === "en" ? "Location suggestions" : "Saran lokasi"}
                      className="mt-2 max-h-60 overflow-y-auto rounded-xl border border-black/10 bg-white/95 p-1.5 shadow-2xl backdrop-blur-xl text-tinta dark:border-white/15 dark:bg-[#1a1a1a]/95 dark:text-[#f5f5f5]"
                    >
                      <IsiSaranLokasi
                        daftar={daftarSaran}
                        indeks={indeksPilihan}
                        memuat={memuatSaran}
                        bahasa={bahasa}
                        onSorot={setIndeksPilihan}
                        onPilih={pilihLokasi}
                      />
                    </div>
                  ) : undefined,
              }
        }
      />
      {/* H1 ikut bahasa halaman — pola yang sama dengan index. */}
      <h1 className="sr-only">{t.judul}</h1>

      {/* Dua rel sejajar yang mengisi lebar layar. Rujukannya memang tanpa pias
          tengah — instrumen di kiri, umpan di kanan, keduanya sampai tepi.
          Desktop selalu utuh dua rel seperti awal; yang dipisah per halaman
          hanya seluler (halaman utama = daftar, /panel = panel). */}
      {/* Kedua trek dinyatakan minmax(0,<panjang>) — TANPA fr. grid-template-columns
          hanya bisa dianimasikan kalau daftar treknya cocok tipe, dan satu trek
          yang tak cocok mematikan interpolasi seluruh daftar; lajur sisa karena
          ditulis eksplisit sebagai 100% dikurangi rel dan selanya. Catatan
          yang sama ada di halaman-peta.tsx. */}
      <div
        style={{
          "--lk-kiri": LEBAR_REL_KIRI,
          "--kolom-kiri": kiriBuka
            ? "minmax(0,calc(var(--lk-kiri) + 0.5rem))"
            : "minmax(0,0px)",
          "--kolom-kanan": kiriBuka
            ? "minmax(0,calc(100% - var(--lk-kiri) - 0.5rem))"
            : "minmax(0,100%)",
        } as React.CSSProperties}
        className={`lk-isi relative grid w-full gap-2 aliran:gap-2 p-2 aliran:grid-cols-1 panggung:gap-0${tampil === "panel" ? " lk-penuh-mobile" : ""}
                   panggung:grid-cols-[var(--kolom-kiri)_var(--kolom-kanan)]
                   panggung:transition-[grid-template-columns] panggung:duration-500
                   panggung:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none`}
      >
        {/* ── Rel kiri: instrumen ──
            Tanpa panel sendiri: isinya berdiri langsung di atas latar halaman,
            dan kartu-kartu hitam di dalamnyalah yang memberi bentuk. */}
        {panelTerlihat && (
          <div
            className={`min-h-0 min-w-0 relative ${
              tampil === "semua" ? "aliran:hidden panggung:block" : "w-full"
            } panggung:col-start-1 panggung:row-start-1 panggung:h-full panggung:z-30`}
          >
            {/* Pembungkus tirai: memotong rel selebar lajur grid. Rel di dalamnya
                tetap selebar penuh (shrink-0) dan menempel ke tepi kanan lajur (justify-end),
                sehingga saat dilipat ia bergeser masuk ke balik bingkai kiri tanpa
                membuat teks atau kartu di dalamnya terlipat/menciut. */}
            <div className="min-h-0 min-w-0 panggung:h-full panggung:w-full panggung:overflow-hidden panggung:flex panggung:justify-end">
              <aside
                id="lk-rel-kiri"
                aria-label={t.situasi}
                inert={!kiriBuka}
                className={`lk-kiri min-h-0 min-w-0 px-2 pt-1
                           panggung:w-[var(--lk-kiri)] panggung:shrink-0 panggung:mr-2
                           panggung:transition-opacity panggung:duration-500 panggung:ease-[cubic-bezier(0.22,1,0.36,1)]
                           motion-reduce:transition-none panggung:[contain:layout_paint]
                           ${kiriBuka ? "panggung:opacity-100" : "panggung:opacity-0 panggung:pointer-events-none"}
                           ${tampil === "semua" ? " lk-hanya-panggung" : ""}`}
              >
          <div aria-hidden="true" className="lk-titik h-9" />

          {/* Peta yang sama persis dengan halaman index — komponen <Peta>,
              bukan tiruan statis. Impornya dinamis (ssr:false) di dalam
              peta.tsx, jadi MapLibre tidak ikut render server maupun bundel
              awal halaman ini.

              Di panggung peta digambar pada ukuran desain konsol lalu
              DIKECILKAN, bukan digambar langsung sebesar rel. Sebabnya ada di
              peta-asap.tsx: hamparannya menskalakan diri dari lebar bingkai,
              `lebar < 640 ? 1 : lebar / 1760`, dan AMBANG_SEMPIT=800 menentukan
              legenda terbuka atau menciut jadi cip. Rel kita 615px — jatuh ke
              kedua cabang sempit itu, jadi perkakasnya tergambar seukuran penuh
              dan legendanya menciut. Dengan lebar logis 1080px, PetaAsap
              melihat bingkai lega: skala hamparan 0,61 dan legenda terbuka,
              persis rujukan desain.

              Pengecilnya `transform`, BUKAN `zoom`: ResizeObserver membaca
              ukuran tata letak, dan `zoom` ikut mengubah ukuran itu sehingga
              justru membatalkan tujuannya. `transform` tidak menyentuhnya.
              Hasil akhirnya 0,61 x (615/1080) = 0,35 dari ukuran asli — sama
              dengan rujukan, yang 0,69 x (616/1220) = 0,35.

              Hanya di panggung. Di ponsel faktornya jadi 382/1080 = 0,35,
              sehingga perkakas tinggal 0,22 ukuran asli dan teksnya 2-3px;
              cabang `< 640` milik PetaAsap itu memang "pola ponsel tanpa
              skala", jadi di sana rendering apa adanya yang benar.

              min-h-[280px] hanya mengikat di aliran: rasio 1080/544 memberi
              tinggi ~192px di layar 414px, di bawah AMBANG_LIPAT (200px) yang
              membuat PetaAsap berhenti mengalokasikan buffer WebGL-nya. Di
              panggung rasio itu sudah memberi 308px, jadi ia menganggur.

              zoomRoda SENGAJA tidak dipasang, berbeda dari konsol: halaman ini
              menggulir, jadi roda tetikus yang dibajak peta akan mengunci
              guliran halaman begitu kursor melintasi bingkai. */}
          <div
            ref={bingkaiPetaRef}
            className="lk-bingkai-peta relative isolate aspect-[1080/544] min-h-[280px] w-full overflow-hidden rounded-xl ring-1 ring-black/[0.08] dark:ring-white/10"
          >
            {/* Slot bingkai kecil — isinya hostPeta, ditempelkan lewat effect. */}
            <div ref={isiPetaRef} className="lk-peta-isi" />
          </div>
          {/* Instance <Peta> satu-satunya. Dirender ke wadah lepas (hostPeta)
              yang dipindah antara slot bingkai dan slot overlay; prop yang
              berbeda antar kedua tempat cukup ikut `petaPenuh`.
              zoomRoda hanya menyala di selayar: di bingkai kecil halaman masih
              menggulir, jadi roda yang dibajak peta akan mengunci guliran. */}
          {hostPeta
            ? createPortal(
                <Peta
                  jumlahLaporan={jumlahLaporan ?? {}}
                  /* Provinsi bisa ditekan seperti di konsol: pop-upnya memakai
                     komponen dan data yang sama (berita + hitungan provinsi). */
                  onPilihWilayah={(nama, pulau, asal) => setWilayah({ nama, pulau, asal })}
                  isPenuh={petaPenuh}
                  legendaRingkas={!petaPenuh}
                  tombolRapat
                  muatNusantara
                  zoomRoda={petaPenuh}
                  onExpand={petaPenuh ? null : () => setPetaPenuh(true)}
                  expandLabel={t.bukaPetaSelayar}
                />,
                hostPeta,
              )
            : null}
          {/* Overlay selayar — hanya cangkang: peta, tombol tutup, pop-up.
              Portal ke body: bingkai memakai `isolate`, fixed di dalamnya
              tertahan (pola komposer-lapor/popup-peta). */}
          {petaPenuh
            ? createPortal(
                <div
                  id="lk-peta-selayar"
                  role="dialog"
                  aria-modal="true"
                  aria-label={t.bukaPetaSelayar}
                  className={`lk-peta-penuh fixed inset-0 z-[70] bg-white text-tinta dark:bg-[#0a0a0a] dark:text-[#f5f5f5]${menutupPenuh ? " lk-peta-penuh--tutup" : ""}`}
                >
                  <div ref={slotPenuhRef} className="absolute inset-0" />
                  <button
                    type="button"
                    onClick={tutupPenuh}
                    title={t.tutupPetaSelayar}
                    aria-label={t.tutupPetaSelayar}
                    className="lk-tutup-peta cursor-pointer pointer-events-auto absolute right-4 top-4 z-[1100] flex size-9 items-center justify-center rounded-full
                               bg-white/90 text-tinta border border-black/10 shadow-md dark:border-white/15 dark:bg-black/70 dark:text-white backdrop-blur-sm
                               transition hover:scale-105 hover:ring-2 hover:ring-[#ff5a26]/70 active:scale-95
                               motion-reduce:transition-none motion-reduce:hover:scale-100
                               focus-visible:ring-2 focus-visible:ring-black/50 dark:focus-visible:ring-white/70 focus-visible:outline-none"
                  >
                    <IkonTutup className="size-4" />
                  </button>
                  {/* Pop-up provinsi DI DALAM portal selayar. Latarnya z-44,
                      sedangkan overlay ini z-70 — dipasang di tingkat halaman
                      ia akan tertimbun peta dan tak pernah terlihat. Di sini ia
                      ikut konteks penumpukan overlay, jadi tampil di atas peta
                      tanpa perlu mengubah z-index komponen bersamanya. */}
                  {wilayah && (
                    <PopupPeta
                      nama={wilayah.nama}
                      pulau={wilayah.pulau}
                      jumlah={jumlahLaporan?.[wilayah.nama] ?? null}
                      asal={wilayah.asal}
                      berita={berita}
                      jumlahLaporan={jumlahLaporan ?? {}}
                      onBukaRincian={(i) => {
                        const ketemu = berita[i];
                        if (!ketemu) return;
                        // Rincian juga z-70: tutup petanya dulu supaya tidak
                        // beradu di lapisan yang sama.
                        setWilayah(null);
                        setPetaPenuh(false);
                        bukaRincian(ketemu);
                      }}
                      onTutup={() => setWilayah(null)}
                    />
                  )}
                </div>,
                document.body,
              )
            : null}

          {/* Pembungkus lembar bawah. Di panggung ia sekadar div tanpa gaya —
              isinya mengalir seperti biasa; di halaman panel seluler CSS
              mengangkatnya jadi lembar yang mengintip di atas peta selayar. */}
          {/* Latar penutup: menekan peta di luar lembar mengatupkannya, seperti
              lembar komentar. Hanya bergaya di panel seluler — di tempat lain
              CSS bawaannya display:none, pola yang sama dengan gagang. */}
          {!lembarTutup && (
            <button
              type="button"
              className="lk-lembar-latar cursor-pointer"
              onClick={() => setLembarTutup(true)}
              aria-label={bahasa === "en" ? "Collapse situation panel" : "Tutup panel situasi"}
            />
          )}

          <div className={`lk-lembar-panel${lembarTutup ? " lk-panel-katup" : ""} bg-white text-tinta border-t border-black/[0.08] shadow-lg dark:bg-[#101010] dark:text-[#f5f5f5] dark:border-white/10 panggung:bg-transparent panggung:text-inherit panggung:border-0 panggung:shadow-none`}>
            <button
              type="button"
              className="lk-lembar-gagang cursor-pointer"
              onPointerDown={(e) => {
                /* Tangkap pointer-nya: tanpa ini jari yang bergeser keluar
                   dari gagang berhenti mengirim pointermove. */
                e.currentTarget.setPointerCapture(e.pointerId);
                seretGagang.current = { mulai: e.clientY, jauh: false };
              }}
              onPointerMove={(e) => {
                const seret = seretGagang.current;
                if (!seret || Math.abs(e.clientY - seret.mulai) <= 24) return;
                seret.jauh = true;
                setLembarTutup(e.clientY > seret.mulai);
              }}
              onClick={() => {
                const seret = seretGagang.current;
                seretGagang.current = null;
                /* Seretan sudah menentukan arahnya — klik penutup jangan
                   membalikkannya lagi. */
                if (seret?.jauh) return;
                setLembarTutup((v) => !v);
              }}
              aria-expanded={!lembarTutup}
              aria-label={lembarTutup
                ? (bahasa === "en" ? "Open situation panel" : "Buka panel situasi")
                : (bahasa === "en" ? "Collapse situation panel" : "Tutup panel situasi")}
            >
              <span aria-hidden="true" className="block w-9 h-1 mx-auto my-1 rounded-full bg-black/20 dark:bg-white/30" />
            </button>

          {/* Sumur lokasi + cuaca: panel abu di atas latar hitam, pil lokasi
              yang lebih gelap di dalamnya — sesuai rujukan. mx-4: blok ini
              sengaja lebih sempit dan menengah dibanding peta di atasnya. */}
          <div className="mx-4 mt-3 rounded-xl bg-white border border-black/[0.06] text-tinta shadow-sm dark:bg-[#1e1e1e] dark:border-white/10 dark:text-[#f5f5f5] p-5">
            <div
              ref={wadahSelectRef}
              className={`lk-lokasi relative hidden panggung:flex items-center gap-3 rounded-xl px-5 py-4 text-[13px] sm:text-[15px] transition-all ${
                modeCariCuaca
                  ? "bg-white border border-black/20 shadow-md ring-1 ring-black/10 dark:bg-[#161616] dark:border-white/20 dark:shadow-xl dark:ring-white/10"
                  : "bg-white border border-black/[0.08] text-tinta hover:border-black/20 dark:bg-black/50 dark:border-white/5 dark:text-[#f5f5f5] dark:hover:bg-black/70"
              }`}
            >
              {modeCariCuaca ? (
                <div className="flex w-full items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (indeksPilihan >= 0 && indeksPilihan < daftarSaran.length) {
                        await cuaca.pilihSaran(daftarSaran[indeksPilihan]);
                      } else if (kueriCuaca.trim()) {
                        await cuaca.cari(kueriCuaca);
                      }
                      setModeCariCuaca(false);
                      setKueriCuaca("");
                      setDaftarSaran([]);
                    }}
                    disabled={cuaca.memuat}
                    aria-label={t.cariLokasiCuacaAria}
                    className="text-black/50 transition-colors hover:text-black dark:text-[#a0a0a0] dark:hover:text-white"
                  >
                    <IkonCari className="size-[18px] shrink-0" />
                  </button>
                  <input
                    ref={inputCuacaRef}
                    type="text"
                    value={kueriCuaca}
                    onChange={(e) => setKueriCuaca(e.target.value)}
                    onKeyDown={tombolSaranLokasi}
                    placeholder={t.cariLokasiCuaca}
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-tinta placeholder:text-black/40 focus:outline-none dark:text-[#f5f5f5] dark:placeholder:text-[#707070] sm:text-[15px]"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setModeCariCuaca(false);
                      setKueriCuaca("");
                      setDaftarSaran([]);
                    }}
                    aria-label={t.batalCariCuaca}
                    className="text-black/50 transition-colors hover:text-black dark:text-[#a0a0a0] dark:hover:text-white"
                  >
                    <IkonTutup className="size-4 shrink-0" />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setModeCariCuaca(true);
                      setTimeout(() => inputCuacaRef.current?.focus(), 50);
                    }}
                    aria-label={t.cariLokasiCuacaAria}
                    className="text-black/50 transition-colors hover:text-black dark:text-[#a0a0a0] dark:hover:text-white"
                  >
                    <IkonCari className="size-[18px] shrink-0" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModeCariCuaca(true);
                      setTimeout(() => inputCuacaRef.current?.focus(), 50);
                    }}
                    className="min-w-0 flex-1 truncate text-left text-tinta transition-colors hover:text-black dark:text-[#f5f5f5] dark:hover:text-white focus:outline-none"
                    title={cuaca.lokasi}
                  >
                    <span className="truncate" aria-live="polite">
                      {cuaca.lokasi}
                      <span className="text-black/50 dark:text-[#a0a0a0]">
                        /{cuaca.sumberLokasi === "gps"
                          ? t.lokasiTerdeteksi
                          : cuaca.sumberLokasi === "cari"
                          ? t.lokasiDicari
                          : t.lokasiOtomatis}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => cuaca.deteksiGps()}
                    disabled={cuaca.memuat}
                    aria-label={t.deteksiGpsCuacaAria}
                    className="ml-auto text-black/50 transition-colors hover:text-black dark:text-[#a0a0a0] dark:hover:text-white disabled:opacity-50"
                  >
                    <IkonLokasi className={`size-[22px] shrink-0 ${cuaca.memuat ? "animate-spin" : ""}`} />
                  </button>
                </>
              )}

              {/* Dropdown Select2 mengambang tepat di bawah bilah pencarian */}
              {modeCariCuaca && (kueriCuaca.trim() !== "" || memuatSaran || daftarSaran.length > 0) && (
                <div
                  role="listbox"
                  aria-label={bahasa === "en" ? "Location suggestions" : "Saran lokasi"}
                  className="absolute top-full left-0 right-0 mt-2 z-50 max-h-60 overflow-y-auto rounded-xl border border-black/10 bg-white/95 p-1.5 shadow-2xl backdrop-blur-xl text-tinta dark:border-white/15 dark:bg-[#1a1a1a]/95 dark:text-[#f5f5f5]"
                >
                  <IsiSaranLokasi
                    daftar={daftarSaran}
                    indeks={indeksPilihan}
                    memuat={memuatSaran}
                    bahasa={bahasa}
                    onSorot={setIndeksPilihan}
                    onPilih={pilihLokasi}
                  />
                </div>
              )}
            </div>
            <p className="lk-angka mt-0 panggung:mt-4 flex items-center gap-4 px-3 pb-1 text-[clamp(44px,3.8vw,68px)] leading-none font-semibold text-tinta dark:text-[#f5f5f5]"
               aria-live="polite"
               aria-label={cuaca.suhu === null ? t.suhuMenunggu : `${cuaca.suhu} derajat celcius di ${cuaca.lokasi}`}>
              {cuaca.suhu === null ? "–" : `${cuaca.suhu}°`}
              <IkonCuaca kode={cuaca.kodeCuaca} siang={cuaca.siang} className="size-[clamp(34px,3vw,56px)] shrink-0 text-tinta dark:text-[#f5f5f5]" />
            </p>
            {/* Atribusi sumber cuaca — wajib tampil bila datanya BMKG (syarat
                portal data terbuka mereka), dan jujur bila jatuh ke model. */}
            {cuaca.sumber !== null && (
              <p className="lk-sumber px-3 text-[11px] text-black/50 dark:text-[#a0a0a0]">
                {cuaca.sumber === "bmkg"
                  ? (bahasa === "en" ? "Source: BMKG" : "Sumber: BMKG")
                  : (bahasa === "en" ? "Source: weather model" : "Sumber: model cuaca")}
              </p>
            )}
          </div>

          {/* Empat angka situasi — mx-4: sejajar dengan panel cuaca, menengah
              terhadap peta. Kartu diberi min-w-0 + padding ramping supaya angka
              tidak meluap di rel sempit. */}
          <dl className="mx-4 mt-4 grid grid-cols-2 gap-3">
            {/* Ukuran teks ditakar untuk KETERANGAN TIGA BARIS: keterangan kini
                membawa rentang sekaligus sumbernya dalam kurung. Dengan ukuran
                sebelumnya (angka s/d 32px, keterangan 13px, py-6) isi rel
                meluber 31px di 1440x900 dan kaki halaman terpotong — rel boleh
                menggulir di layar pendek, tapi di ukuran desain tak perlu. */}
            {daftarStatistik.map((s, idx) => (
              <div key={s.keterangan || idx} className="flex min-w-0 flex-col justify-center rounded-xl bg-white border border-black/[0.06] text-tinta shadow-sm dark:bg-[#1e1e1e] dark:border-white/10 dark:text-[#f5f5f5] px-3 py-5 text-center">
                <dd className="lk-angka order-1 text-[clamp(18px,1.5vw,28px)] leading-tight font-medium text-tinta dark:text-[#f5f5f5]">
                  {s.nilai}
                </dd>
                <dt className="order-2 mt-1.5 text-[11px] leading-tight font-medium text-balance sm:text-[12px] text-black/60 dark:text-[#a0a0a0]">
                  {s.keterangan}
                </dt>
              </div>
            ))}
          </dl>

          <p className="lk-kaki mx-auto mt-4 max-w-[46ch] px-2 text-center text-[11px] leading-relaxed text-black/55 dark:text-[#a0a0a0]">
            <strong className="font-bold text-tinta dark:text-[#f5f5f5]">{t.merek}</strong> — {t.kaki}
          </p>
          </div>
          <div aria-hidden="true" className="lk-titik lk-titik--bawah mt-3 h-9" />
              </aside>
            </div>

            {tampil === "semua" && (
              <TabRelKiri
                terbuka={kiriBuka}
                onUbah={() => setKiriBuka((b) => !b)}
                label={kiriBuka
                  ? (bahasa === "en" ? "Collapse situation panel" : "Tutup panel situasi")
                  : (bahasa === "en" ? "Open situation panel" : "Buka panel situasi")}
              />
            )}
          </div>
        )}

        {/* ── Rel kanan: umpan laporan ──
            Halaman utama seluler: daftar gambar/video.

            Saat rel dilipat, isinya sengaja dibiarkan memakai lebar penuh —
            tanpa batas lebar dan tanpa pemusatan. */}
        {umpanTerlihat && (
          <main
            aria-label={t.umpan}
            className="lk-kanan pantau-rel min-h-0 min-w-0 panggung:col-start-2 panggung:row-start-1"
          >
          <KomposerLapor bahasa={bahasa} />

          <div className="mt-4">
            <BilahSaringan
              dari={dariUmpan}
              sampai={sampaiUmpan}
              gelap={temaGelap}
              onTanggal={({ dari, sampai }) => {
                setDariUmpan(dari);
                setSampaiUmpan(sampai);
              }}
              wilayah={wilayahUmpan}
              opsiWilayah={opsiWilayah}
              onWilayah={setWilayahUmpan}
              labelWilayah={t.saringanPilihWilayah}
              satuan={t.saringanSatuan}
              placeholderTanggal={t.tanggalPanjang}
              placeholderTanggalPendek={t.tanggalPendek}
              saklar={
                <SaklarSegmen
                  nilai={urutanUmpan}
                  onPilih={setUrutanUmpan}
                  label={t.urutan}
                  opsi={[
                    { kunci: "terbaru", label: t.urutTerbaru, isi: t.urutTerbaru },
                    { kunci: "komentar", label: t.urutKomentar, isi: t.urutKomentar },
                  ]}
                />
              }
            />
          </div>

          {hasil.length === 0 ? (
            <div className="mt-5 flex flex-col items-center rounded-xl border border-dashed border-black/15 px-4 py-12 text-center text-[14px] text-black/60 dark:border-white/15 dark:text-[#a0a0a0]">
              <IkonCari className="mb-3 size-7 opacity-50" />
              <p className="max-w-[40ch] text-balance">{adaSaringanUmpan && !kata ? t.saringanKosong : t.hasilKosong}</p>
              {adaSaringanUmpan && (
                <button
                  type="button"
                  onClick={hapusSaringanUmpan}
                  className="mt-2 cursor-pointer font-semibold text-bara underline underline-offset-2 transition-colors hover:text-api"
                >
                  {t.hapusSaringan}
                </button>
              )}
            </div>
          ) : (
            <UmpanMasonry
              daftar={hasil}
              kolom={kolom}
              kartu={(l, i) => (
                <article key={l.id} className="lk-kartu group text-tinta dark:text-[#f5f5f5]">
                  <div className="lk-kartu-teks">
                    <p className="lk-kartu-tanggal text-[13px] text-black/60 dark:text-white/85 sm:text-[14px]">{l.tanggal}</p>
                    <div className="lk-kartu-judulbar">
                      <h2 className="mt-1 min-w-0 flex-1 text-[16px] leading-[1.3] font-semibold text-pretty sm:text-[19px]">
                        <button
                          type="button"
                          onClick={() => bukaMedia(l.id)}
                          className="cursor-pointer text-left transition-colors hover:text-[#ff5a26] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5a26]"
                        >
                          {l.judul}
                        </button>
                      </h2>
                    </div>
                  </div>
                  {/* Media apa adanya: video diputar di tempat dengan poster
                      bingkainya, gambar ditampilkan langsung. preload metadata
                      supaya mp4 tidak ikut terunduh sebelum dimainkan. Tanpa
                      media sama sekali: placeholder logo. */}
                  <div className="lk-kartu-media">
                  {l.video ? (
                    <span className="lk-media-statis">
                      <VideoOtomatis
                        url={l.video}
                        poster={l.gambar}
                        label={l.judul}
                        onBuka={() => bukaMedia(l.id)}
                        bahasa={bahasa}
                      />
                      {l.galeri.length > 1 && (
                        <span aria-hidden="true" className="lk-galeri-lencana">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                               strokeLinecap="round" strokeLinejoin="round">
                            <rect x="8" y="8" width="12" height="12" rx="2.5" fill="rgb(0 0 0 / 0.35)" />
                            <path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4H6.5A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" />
                          </svg>
                        </span>
                      )}
                    </span>
                  ) : l.gambar ? (
                    <button
                      type="button"
                      onClick={() => bukaMedia(l.id)}
                      aria-label={l.judul}
                      className="lk-foto cursor-pointer relative mt-3 block w-full overflow-hidden transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5a26]"
                    >
                      {mediaLokal(l.gambar) ? (
                        /* Baris pertama (j === 0 tiap kolom) kandidat LCP: jangan ditunda. */
                        <Image src={l.gambar} alt={l.alt} loading={i % 100 === 0 ? "eager" : "lazy"} draggable={false}
                               width={0} height={0} sizes={UKURAN_FOTO_UMPAN}
                               className="lk-foto h-auto w-full transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element -- URL media remote warisan, host dinamis di luar remotePatterns
                        <img src={l.gambar} alt={l.alt} loading="lazy" draggable={false}
                             className="lk-foto h-auto w-full transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
                      )}
                      {l.galeri.length > 1 && (
                        <span aria-hidden="true" className="lk-galeri-lencana">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                               strokeLinecap="round" strokeLinejoin="round">
                            <rect x="8" y="8" width="12" height="12" rx="2.5" fill="rgb(0 0 0 / 0.35)" />
                            <path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4H6.5A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" />
                          </svg>
                        </span>
                      )}
                    </button>
                  ) : (
                    <span className="lk-foto mt-3 flex aspect-[16/10] items-center justify-center rounded-lg bg-black/[0.04] dark:bg-white/5" role="img" aria-label={l.alt}>
                      <Image src="/assets/img/logo-fire.png" alt="" aria-hidden="true" width={99} height={160} className="h-16 w-auto opacity-60" />
                    </span>
                  )}
                  </div>
                </article>
              )}
            />
          )}
        </main>
        )}
      </div>

      {/* Bilah tab seluler ala X — hanya tampil di aliran (CSS). Slot kedua
          adalah penyeberang halaman: di halaman utama (daftar) membuka panel,
          di halaman panel kembali ke daftar. */}
      <nav aria-label={t.umpan} className="lk-tabbar bg-white/95 border-t border-black/[0.08] text-tinta backdrop-blur-md dark:bg-[#14100f]/95 dark:border-white/10 dark:text-[#f5f5f5]">
        {tampil === "panel" ? (
          <Link
            href={`/${bahasa}`}
            aria-label={t.tabUmpan}
            className="cursor-pointer rounded-full p-2 text-tinta transition hover:bg-black/5 dark:text-[#f5f5f5] dark:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#ff5a26]"
          >
            <IkonUmpan />
          </Link>
        ) : (
          <Link
            href={`/${bahasa}/karhutla/panel`}
            aria-label={t.tabPanel}
            className="cursor-pointer rounded-full p-2 text-tinta transition hover:bg-black/5 dark:text-[#f5f5f5] dark:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#ff5a26]"
          >
            <IkonPanel />
          </Link>
        )}
        {/* Cari di panel membuka kolom pencarian lokasi di bilah ATAS halaman
            INI — di letak yang sama dengan kolom cari laporan di halaman
            daftar — tidak mengantar ke mana-mana. Fokusnya diurus Nav
            (nav-cari) begitu kolomnya terbuka. */}
        {tampil === "semua" ? (
          <button
            type="button"
            aria-label={t.tabCari}
            onClick={() => ubahCariBuka(!cariBuka)}
            className="cursor-pointer rounded-full p-2 text-tinta transition hover:bg-black/5 dark:text-[#f5f5f5] dark:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#ff5a26]"
          >
            <IkonCari className="size-7" />
          </button>
        ) : (
          <button
            type="button"
            aria-label={t.tabCari}
            onClick={() => setModeCariCuaca(true)}
            className="cursor-pointer rounded-full p-2 text-tinta transition hover:bg-black/5 dark:text-[#f5f5f5] dark:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#ff5a26]"
          >
            <IkonCari className="size-7" />
          </button>
        )}
        {tampil === "semua" ? (
          <button
            type="button"
            aria-label={t.tabTulis}
            onClick={() => {
              (document.getElementById("lk-tulis") as HTMLButtonElement | null)?.click();
              window.setTimeout(() => document.getElementById("lk-judul")?.focus({ preventScroll: true }), 150);
            }}
            className="cursor-pointer rounded-full p-2 text-tinta transition hover:bg-black/5 dark:text-[#f5f5f5] dark:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#ff5a26]"
          >
            <IkonPlus />
          </button>
        ) : (
          <Link href={`/${bahasa}/karhutla?tulis=1`} aria-label={t.tabTulis} className="cursor-pointer rounded-full p-2 text-tinta transition hover:bg-black/5 dark:text-[#f5f5f5] dark:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#ff5a26]">
            <IkonPlus />
          </Link>
        )}
      </nav>
      <div aria-hidden="true" className="lk-tabbar-ruang" />

      {/* Rincian di halaman yang sama seperti index (URL ikut pindah agar
          bisa dibagikan, isi halaman tetap). */}
      {sorot && (
        <RincianLaporan
          berita={sorot}
          bahasa={bahasa}
          onTutup={tutupRincian}
          onSebelumnya={keSebelumnya}
          onBerikutnya={keBerikutnya}
          adaSebelumnya={adaSebelumnya}
          adaBerikutnya={adaBerikutnya}
          indeksAktif={indeksSorot >= 0 ? indeksSorot : undefined}
          totalKejadian={urutanNav.length}
          beritaSebelumnya={adaSebelumnya ? urutanNav[indeksSorot - 1] : undefined}
          beritaBerikutnya={adaBerikutnya ? urutanNav[indeksSorot + 1] : undefined}
        />
      )}

      {/* Pop-up provinsi untuk peta INLINE. Digerbangi !petaPenuh karena versi
          selayar punya salinannya sendiri di dalam portal — tanpa gerbang ini
          keduanya akan terpasang bersamaan dari satu state yang sama. */}
      {wilayah && !petaPenuh && (
        <PopupPeta
          nama={wilayah.nama}
          pulau={wilayah.pulau}
          jumlah={jumlahLaporan?.[wilayah.nama] ?? null}
          asal={wilayah.asal}
          berita={berita}
          jumlahLaporan={jumlahLaporan ?? {}}
          onBukaRincian={(i) => {
            const ketemu = berita[i];
            if (!ketemu) return;
            setWilayah(null);
            bukaRincian(ketemu);
          }}
          onTutup={() => setWilayah(null)}
        />
      )}


      {/* Lembar komentar seluler dari ikon komentar postingan. */}
      {komentarId !== null && (
        <LembarKomentar
          id={komentarId}
          bahasa={bahasa}
          onTutup={() => setKomentarId(null)}
        />
      )}
    </div>
  );
}
