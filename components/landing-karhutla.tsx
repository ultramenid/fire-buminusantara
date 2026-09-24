"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Peta } from "@/components/peta";
import { Nav } from "@/components/nav";
import { Switch } from "@/components/ui/switch";
import { gunakanKomentar } from "@/hooks/gunakan-komentar";
import { gunakanKolomUmpan } from "@/hooks/gunakan-kolom-umpan";
import { BATAS_BERKAS, BATAS_TOTAL_BYTE } from "@/lib/batas-laporan";
import { ambilStatistik, type Statistik as DataStatistik } from "@/lib/statistik";
import type { KunciSorotan } from "@/lib/statistik-sorotan-teks";
import { BAHASA, type Bahasa } from "@/lib/bahasa";
import type { Berita } from "@/lib/events";
import { PULAU_TAB, waktuIso, waktuTeks } from "@/lib/tanggal";
import { BilahSaringan, SaklarSegmen } from "@/components/bilah-saringan";
import { useTheme } from "next-themes";
import { useMounted } from "@/hooks/use-mounted";
import { kirimLaporan, type KeadaanLapor } from "@/app/[locale]/lapor/aksi";
import { bacaDraf, simpanDraf } from "@/lib/draf-lapor";
import { mediaLokal } from "@/lib/media";

/* Dimuat terpisah: semuanya baru tampil sesudah interaksi (buka rincian,
   tekan provinsi, buka komentar), jadi tak perlu ikut bundel awal. Rincian
   tetap di-SSR karena rute /fire/<slug> merendernya terbuka sejak awal. */
const RincianLaporan = dynamic(() => import("@/components/rincian-laporan").then((m) => m.RincianLaporan));
const PopupPeta = dynamic(() => import("@/components/popup-peta").then((m) => m.PopupPeta), { ssr: false });
const UlasanKomentar = dynamic(() => import("@/components/kolom-komentar").then((m) => m.UlasanKomentar), { ssr: false });
const FormulirKomentar = dynamic(() => import("@/components/kolom-komentar").then((m) => m.FormulirKomentar), { ssr: false });

/* Lebar kartu umpan untuk srcset next/image: 2 kolom di bawah 1100px (1 kolom
   di layar sangat sempit), 3-4 kolom di panggung — 33vw batas atasnya. */
const UKURAN_FOTO_UMPAN = "(max-width: 359px) 100vw, (max-width: 1099px) 50vw, 33vw";

/** Site key Turnstile — sama seperti form /lapor. */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

/** Panjang animasi keluar overlay peta selayar. Harus sama dengan
 *  @keyframes lk-peta-keluar di public/css/landing-karhutla.css. */
const DURASI_TUTUP_PETA = 200;

/* Jenis berkas ditulis satu per satu, BUKAN "image/*,video/*" — sama seperti
   form /lapor: dengan daftar eksplisit, iOS mengubah foto HEIC-nya jadi JPEG
   saat dipilih sehingga lolos pemeriksaan MIME di server. */
const DITERIMA = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm";

type TurnstileInstance = {
  render: (wadah: HTMLElement, opsi: Record<string, unknown>) => number;
  reset: (id: number) => void;
  remove: (id: number | null) => void;
};

function turnstile(): TurnstileInstance | null {
  return (window as Window & { turnstile?: TurnstileInstance }).turnstile ?? null;
}

/** Dua berkas dianggap sama kalau nama, ukuran, dan waktu ubahnya sama. */
function kunciBerkas(b: File): string {
  return `${b.name}|${b.size}|${b.lastModified}`;
}

export type Laporan = {
  id: number;
  gambar: string | null; // foto — atau poster bingkai bila laporannya video
  video?: string; // mp4 bila laporannya video
  /** Seluruh media galeri (berurut) — >1 berarti ada lencana. */
  galeri: { url: string; jenis: "gambar" | "video"; poster?: string; keterangan?: string }[];
  alt: string;
  judul: string;
  tanggal: string;
  lokasi: string | null;
  deskripsi: string | null;
  slug: string | null;
  href: string;
  /** Pulau payload berita (Sumatra, Kalimantan, …) — kunci saringan wilayah
   *  di bilah saringan umpan. Opsional: pemakai lain tipe ini tak menyaring. */
  pulau?: string | null;
  /** Jumlah komentar — kunci urutan "komentar terbanyak" umpan. */
  komentar?: number;
};


const TEKS = {
  id: {
    // Judul penuh halaman — dipakai H1 sr-only; judul pendek + tombol lapor
    // kini milik <Nav gelap> yang dipakai bersama halaman index.
    judul: "Kebakaran Hutan dan Lahan",
    cariLaporan: "Lapor apa yang kamu lihat",
    lokasi: "Kalimantan Barat",
    lokasiOtomatis: "secara otomatis dibaca lokasi",
    lokasiTerdeteksi: "lokasi terdeteksi",
    lokasiDicari: "lokasi dicari",
    cariLokasiCuaca: "Cari kota/provinsi...",
    cariLokasiCuacaAria: "Cari lokasi cuaca",
    deteksiGpsCuacaAria: "Deteksi lokasi cuaca via GPS",
    batalCariCuaca: "Batal cari lokasi cuaca",
    petaJudul: "Aerosol Karhutla",
    petaAngin: "Angin dan kualitas udara",
    petaWaktu: "8 Sep, 00:00 WIB",
    petaLegenda: "Kepekatan aerosol asap kebakaran, dibaca dari satelit Sentinel-5P.",
    petaTipis: "Tipis",
    petaPekat: "Pekat",
    kaki: "Laporan warga terkurasi sebelum ditampilkan. Menyaksikan kebakaran atau dampak asapnya? Ceritakan di kotak laporan.",
    merek: "©2026 Lapor Karhutla",
    hasilKosong: "Tidak ada laporan yang cocok. Coba kata lain, atau kirim laporanmu sendiri.",
    saringanKosong: "Tidak ada laporan pada wilayah atau rentang tanggal ini.",
    hapusSaringan: "Hapus saringan",
    semuaWilayah: "Semua wilayah",
    saringanPilihWilayah: "Pilih wilayah pulau",
    saringanSatuan: "laporan",
    urutan: "Urutan laporan",
    tanggalPanjang: "Pilih rentang tanggal",
    tanggalPendek: "Tanggal",
    urutTerbaru: "Terbaru",
    urutKomentar: "Komentar terbanyak",
    umpan: "Laporan warga",
    situasi: "Panel situasi",
    mainkan: "Mainkan rekaman sebaran",
    tulis: "Apa yang terjadi di sekitarmu?",
    kirim: "Kirim",
    lampirFoto: "Lampirkan foto",
    lampirVideo: "Lampirkan video",
    tandaiLokasi: "Tandai lokasi",
    judulPh: "Judul singkat laporannya",
    ceritaPh: "Ceritakan yang kamu lihat…",
    judulWajib: "Isi judul singkat dulu.",
    ceritaWajib: "Ceritakan kejadiannya sedikit.",
    berkasWajib: "Sertakan minimal satu foto atau video.",
    lokasiOk: "Lokasi ditandai",
    lokasiGagal: "Lokasi gagal dibaca.",
    mencariLokasi: "Mencari…",
    terkirim: "Laporan terkirim.",
    terkirimIsi: "Terima kasih — laporanmu sedang diverifikasi dan akan tampil di beranda setelah lolos kurasi.",
    tulisLagi: "Tulis lagi",
    batal: "Batal",
    mengirim: "Mengirim…",
    memverifikasi: "Memverifikasi…",
    keamananGagal: "Pemeriksaan keamanan gagal dimuat. Periksa koneksi lalu coba lagi.",
    terlaluBanyak: "Maksimal 6 berkas per laporan.",
    terlaluBesar: "Total berkas terlalu besar.",
    suhuMenunggu: "Suhu sedang dimuat",
    bukaPetaSelayar: "Buka peta selayar",
    tutupPetaSelayar: "Tutup peta selayar",
    namaPh: "Nama (opsional)",
    anonim: "Anonim",
    lokasiHapus: "Hapus lokasi",
    wajibMedia: "Foto/video wajib",
    latPh: "Lat",
    lngPh: "Lng",
    tabBeranda: "Beranda",
    tabCari: "Cari laporan",
    tabTulis: "Tulis laporan",
    tabLapor: "Formulir lapor",
    tabPanel: "Buka panel situasi",
    tabUmpan: "Buka daftar laporan",
    videoBisu: "Nyalakan suara video",
    videoSenyap: "Bisukan video",
    videoUlang: "Putar ulang video",
    galeriSebelumnya: "Foto sebelumnya",
    galeriBerikutnya: "Foto berikutnya",
    postingan: "Postingan",
    kembali: "Kembali",
    suka: "Suka",
    komentar: "Komentar",
    selengkapnya: "selengkapnya",
    lebihSedikit: "lebih sedikit",
    lembarBagikan: "Bagikan",
    lembarTersalin: "Tautan tersalin",
  },
  en: {
    judul: "Forest and Land Fires",
    cariLaporan: "Report what you see",
    lokasi: "West Kalimantan",
    lokasiOtomatis: "location read automatically",
    lokasiTerdeteksi: "detected location",
    lokasiDicari: "searched location",
    cariLokasiCuaca: "Search city/province...",
    cariLokasiCuacaAria: "Search weather location",
    deteksiGpsCuacaAria: "Detect weather location via GPS",
    batalCariCuaca: "Cancel weather location search",
    petaJudul: "Wildfire Aerosol",
    petaAngin: "Wind and air quality",
    petaWaktu: "8 Sep, 00:00 WIB",
    petaLegenda: "Smoke aerosol density, read from the Sentinel-5P satellite.",
    petaTipis: "Thin",
    petaPekat: "Dense",
    kaki: "Citizen reports are curated before they appear. Seeing a fire or its haze? Tell us in the report box.",
    merek: "©2026 Lapor Karhutla",
    hasilKosong: "No reports match that. Try other words, or send a report of your own.",
    saringanKosong: "No reports in this region or date range.",
    hapusSaringan: "Clear filters",
    semuaWilayah: "All regions",
    saringanPilihWilayah: "Choose an island region",
    saringanSatuan: "reports",
    urutan: "Report order",
    tanggalPanjang: "Choose a date range",
    tanggalPendek: "Dates",
    urutTerbaru: "Newest",
    urutKomentar: "Most commented",
    umpan: "Citizen reports",
    situasi: "Situation panel",
    mainkan: "Play the spread recording",
    tulis: "What's happening around you?",
    kirim: "Post",
    lampirFoto: "Attach a photo",
    lampirVideo: "Attach a video",
    tandaiLokasi: "Tag location",
    judulPh: "Short report title",
    ceritaPh: "Describe what you see…",
    judulWajib: "Give it a short title first.",
    ceritaWajib: "Describe what happened, briefly.",
    berkasWajib: "Attach at least one photo or video.",
    lokasiOk: "Location tagged",
    lokasiGagal: "Could not read location.",
    mencariLokasi: "Locating…",
    terkirim: "Report sent.",
    terkirimIsi: "Thank you — your report is being verified and will appear on the homepage once approved.",
    tulisLagi: "Write another",
    batal: "Cancel",
    mengirim: "Sending…",
    memverifikasi: "Verifying…",
    keamananGagal: "Security check could not load. Check your connection and try again.",
    terlaluBanyak: "Maximum 6 files per report.",
    terlaluBesar: "Total files too large.",
    suhuMenunggu: "Loading temperature",
    bukaPetaSelayar: "Open fullscreen map",
    tutupPetaSelayar: "Close fullscreen map",
    namaPh: "Name (optional)",
    anonim: "Anonymous",
    lokasiHapus: "Clear location",
    wajibMedia: "Photo/video required",
    latPh: "Lat",
    lngPh: "Lng",
    tabBeranda: "Home",
    tabCari: "Search reports",
    tabTulis: "Write report",
    tabLapor: "Report form",
    tabPanel: "Open situation panel",
    tabUmpan: "Open report list",
    videoBisu: "Unmute video",
    videoSenyap: "Mute video",
    videoUlang: "Replay video",
    galeriSebelumnya: "Previous photo",
    galeriBerikutnya: "Next photo",
    postingan: "Post",
    kembali: "Back",
    suka: "Like",
    komentar: "Comments",
    selengkapnya: "more",
    lebihSedikit: "less",
    lembarBagikan: "Share",
    lembarTersalin: "Link copied",
  },
} satisfies Record<Bahasa, Record<string, string>>;

function IkonCari({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function IkonLokasi({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"
         className={className}>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
    </svg>
  );
}

function IkonTutup({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4"
         strokeLinecap="round" className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/**
 * Cuaca lokal pengunjung: lokasi + suhu dibaca otomatis dari IP, tanpa
 * meminta izin geolokasi browser.
 *
 * - Muat: judul lokasi menampilkan teks statis (Kalimantan Barat); suhu
 *   menampilkan garis jeda agar tak ada angka bohong sebelum data tiba.
 * - useEffect menembak /api/cuaca-lokal (IP -> kota via ipwho.is +
 *   BigDataCloud, suhu live via Open-Meteo) lalu state ditimpa.
 * - Gagal total: lokasi + suhu cadangan server (DKI Jakarta + suhu live
 *   Monas) - panel tak pernah kosong.
 *
 * Ikon: pakaian WMO weather_code Open-Meteo - 0 cerah (matahari/bulan), 1-3
 * berawan lipat tiga, 45/48 kabut, 51-67 gerimis/hujan, 71-77 salju, 80-82
 * hujan rintik, 95-99 badai petir.
 */
function useCuacaLokal(bahasa: Bahasa, lokasiAwal: string) {
  const [lokasi, setLokasi] = useState(lokasiAwal);
  const [suhu, setSuhu] = useState<number | null>(null);
  const [kodeCuaca, setKodeCuaca] = useState<number | null>(null);
  const [siang, setSiang] = useState(true);
  const [sumber, setSumber] = useState<"bmkg" | "model" | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [sumberLokasi, setSumberLokasi] = useState<"otomatis" | "gps" | "cari">("otomatis");

  type Muatan = {
    nama?: unknown; suhu?: unknown; kodeCuaca?: unknown; siang?: unknown; sumber?: unknown;
  };
  const terapkan = useCallback((j: Muatan): void => {
    if (typeof j.nama === "string" && j.nama.trim() !== "") setLokasi(j.nama.trim());
    if (typeof j.suhu === "number" && Number.isFinite(j.suhu)) setSuhu(Math.round(j.suhu));
    if (typeof j.kodeCuaca === "number" && Number.isFinite(j.kodeCuaca)) setKodeCuaca(j.kodeCuaca);
    if (typeof j.siang === "boolean") setSiang(j.siang);
    if (j.sumber === "bmkg" || j.sumber === "model") setSumber(j.sumber);
  }, []);

  const cari = useCallback(async (kueri: string): Promise<boolean> => {
    const q = kueri.trim();
    if (!q) return false;
    setMemuat(true);
    try {
      const r = await fetch(`/api/cuaca-lokal?bahasa=${bahasa}&q=${encodeURIComponent(q)}`, {
        signal: AbortSignal.timeout(12000),
        headers: { Accept: "application/json" },
      });
      if (!r.ok) return false;
      const j = (await r.json()) as Muatan;
      terapkan(j);
      setSumberLokasi("cari");
      try {
        window.localStorage.setItem(
          `lk-cuaca-${bahasa}`,
          JSON.stringify({ t: Date.now(), data: j, sumberLokasi: "cari" })
        );
      } catch {
        /* penyimpanan penuh/diblokir */
      }
      return true;
    } catch {
      return false;
    } finally {
      setMemuat(false);
    }
  }, [bahasa, terapkan]);

  const deteksiGps = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }
    setMemuat(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const r = await fetch(
            `/api/cuaca-lokal?bahasa=${bahasa}&lat=${latitude}&lng=${longitude}`,
            {
              signal: AbortSignal.timeout(12000),
              headers: { Accept: "application/json" },
            }
          );
          if (!r.ok) return;
          const j = (await r.json()) as Muatan;
          terapkan(j);
          setSumberLokasi("gps");
          try {
            window.localStorage.setItem(
              `lk-cuaca-${bahasa}`,
              JSON.stringify({ t: Date.now(), data: j, sumberLokasi: "gps" })
            );
          } catch {
            /* penyimpanan penuh/diblokir */
          }
        } catch {
          // gagal fetch cuaca dari gps
        } finally {
          setMemuat(false);
        }
      },
      () => {
        setMemuat(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }, [bahasa, terapkan]);

  useEffect(() => {
    let hidup = true;
    // Cache lokal 15 menit: refresh langsung menampilkan angka terakhir
    // tanpa menunggu rantai server — lalu tetap divalidasi ulang di bawah.
    try {
      const mentah = window.localStorage.getItem(`lk-cuaca-${bahasa}`);
      if (mentah) {
        const { t, data, sumberLokasi: sl } = JSON.parse(mentah) as {
          t: number;
          data: Muatan;
          sumberLokasi?: "otomatis" | "gps" | "cari";
        };
        if (data && typeof t === "number" && Date.now() - t < 15 * 60_000) {
          setTimeout(() => {
            if (!hidup) return;
            terapkan(data);
            if (sl) setSumberLokasi(sl);
          }, 0);
        }
      }
    } catch {
      /* cache rusak: abaikan, fetch segar di bawah */
    }
    // Rantai server (geo-IP + kota + adm4 + BMKG + cadangan) bisa >30 detik
    // saat dingin — sekali coba dengan batas 30 detik kerap gugur tepat di
    // garis finis dan panel macet di garis jeda. Batas 60 detik + sekali
    // ulangi bila gugur.
    const ambil = async (batas: number): Promise<boolean> => {
      try {
        const r = await fetch(`/api/cuaca-lokal?bahasa=${bahasa}`, {
          signal: AbortSignal.timeout(batas),
          headers: { Accept: "application/json" },
        });
        if (!r.ok) return false;
        const j = (await r.json()) as Muatan;
        if (!hidup) return true;
        terapkan(j);
        try {
          window.localStorage.setItem(
            `lk-cuaca-${bahasa}`,
            JSON.stringify({ t: Date.now(), data: j, sumberLokasi: "otomatis" })
          );
        } catch {
          /* penyimpanan penuh/diblokir: abaikan */
        }
        return true;
      } catch {
        return false;
      }
    };
    (async () => {
      if (await ambil(60_000)) return;
      if (hidup) await ambil(60_000);
    })();
    return () => {
      hidup = false;
    };
  }, [bahasa, terapkan]);

  const pilihSaran = useCallback(
    async (item: {
      nama: string;
      provinsi: string;
      lat: number;
      lng: number;
      adm4?: string;
    }): Promise<boolean> => {
      setMemuat(true);
      try {
        const param = new URLSearchParams({
          bahasa,
          lat: String(item.lat),
          lng: String(item.lng),
          nama: item.nama,
          provinsi: item.provinsi,
          ...(item.adm4 ? { adm4: item.adm4 } : {}),
        });
        const r = await fetch(`/api/cuaca-lokal?${param}`, {
          signal: AbortSignal.timeout(12000),
          headers: { Accept: "application/json" },
        });
        if (!r.ok) return false;
        const j = (await r.json()) as Muatan;
        terapkan(j);
        setSumberLokasi("cari");
        try {
          window.localStorage.setItem(
            `lk-cuaca-${bahasa}`,
            JSON.stringify({ t: Date.now(), data: j, sumberLokasi: "cari" })
          );
        } catch {
          /* penyimpanan penuh/diblokir */
        }
        return true;
      } catch {
        return false;
      } finally {
        setMemuat(false);
      }
    },
    [bahasa, terapkan]
  );

  return { lokasi, suhu, kodeCuaca, siang, sumber, memuat, sumberLokasi, cari, deteksiGps, pilihSaran };
}

/** Ikon cuaca garis putih meniru IkonMatahari: matahari/bulan, awan, hujan, petir, kabut. */
function IkonCuaca({ kode, siang, className = "size-14" }: { kode: number | null; siang: boolean; className?: string }) {
  const g = (isi: string) => (
    <svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <g dangerouslySetInnerHTML={{ __html: isi }} />
    </svg>
  );
  if (kode === null) return g('<circle cx="24" cy="24" r="9" /><path d="M24 4v5M24 39v5M4 24h5M39 24h5M10 10l3.5 3.5M34.5 34.5 38 38M38 10l-3.5 3.5M13.5 34.5 10 38" />');
  if (kode === 0) {
    return siang
      ? g('<circle cx="24" cy="24" r="9" /><path d="M24 4v5M24 39v5M4 24h5M39 24h5M10 10l3.5 3.5M34.5 34.5 38 38M38 10l-3.5 3.5M13.5 34.5 10 38" />')
      : g('<path d="M30 8a13 13 0 1 0 10 16A15 15 0 0 1 30 8Z" /><path d="M36 6v4M40 4v3" />');
  }
  if (kode <= 3) {
    return siang
      ? g('<circle cx="18" cy="18" r="6" /><path d="M18 6v3M6 18h3M9.5 9.5l2 2M26.5 9.5l-2 2" /><path d="M16 38h14a7 7 0 0 0 1.5-13.8A10 10 0 0 0 12 26a6.5 6.5 0 0 0 4 12Z" />')
      : g('<path d="M30 6a9 9 0 1 0 7 12A11 11 0 0 1 30 6Z" /><path d="M16 38h14a7 7 0 0 0 1.5-13.8A10 10 0 0 0 12 26a6.5 6.5 0 0 0 4 12Z" />');
  }
  if (kode === 45 || kode === 48) return g('<path d="M14 18h16a7 7 0 0 0 1.5-13.8A10 10 0 0 0 12 6a6.5 6.5 0 0 0 2 12Z" /><path d="M10 26h28M12 32h24M10 38h28" />');
  if ((kode >= 51 && kode <= 67) || (kode >= 80 && kode <= 82)) return g('<path d="M14 26h16a7 7 0 0 0 1.5-13.8A10 10 0 0 0 12 14a6.5 6.5 0 0 0 2 12Z" /><path d="M16 32l-2 5M24 32l-2 5M32 32l-2 5M40 32l-2 5" />');
  if (kode >= 71 && kode <= 77) return g('<path d="M14 24h16a7 7 0 0 0 1.5-13.8A10 10 0 0 0 12 12a6.5 6.5 0 0 0 2 12Z" /><path d="M17 30v.1M25 30v.1M33 30v.1M21 36v.1M29 36v.1M17 42v.1M25 42v.1M33 42v.1" />');
  return g('<path d="M14 24h16a7 7 0 0 0 1.5-13.8A10 10 0 0 0 12 12a6.5 6.5 0 0 0 2 12Z" /><path d="M24 28l-6 10h5l-2 6 8-12h-5l3-4h-3Z" />');
}


/* Ikon-ikon komposer ala X: garis tipis 1.8, ukuran seragam. */
function IkonFoto({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m5.5 18 5-5 3 3 2.5-2.5 2.5 2.5" />
    </svg>
  );
}

function IkonVideo({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="6" width="12" height="12" rx="2" />
      <path d="m15 10.5 6-3.5v10l-6-3.5" />
    </svg>
  );
}

function IkonPin({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"
         className={className}>
      <path d="M12 21s-6.5-5.4-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.6 12 21 12 21Z" />
      <circle cx="12" cy="10.5" r="2.3" />
    </svg>
  );
}

function IkonOrang({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" className={className}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

/* Seluler atau bukan — cerminan varian aliran/panggung di JS. Snapshot server
   sengaja panggung (kedua rel dirender) supaya markup SSR lengkap; klien
   seluler melepas rel kiri setelah hidrasi. Pola yang sama dengan
   gunakanKolomMasonry di index. */
function useAliran(): boolean {
  return useSyncExternalStore(
    (ubah) => {
      const mq = window.matchMedia("not all and (min-width: 1100px) and (min-height: 640px)");
      mq.addEventListener("change", ubah);
      return () => mq.removeEventListener("change", ubah);
    },
    () => window.matchMedia("not all and (min-width: 1100px) and (min-height: 640px)").matches,
    () => false,
  );
}

/* Ikon suara video ala IG: speaker + gelombang (bersuara) / speaker + silang
   (bisu), dan panah melingkar untuk putar ulang. Garis 1.9 ala ikon tab. */
function IkonSuara({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.2 6a9 9 0 0 1 0 12" />
    </svg>
  );
}

function IkonBisu({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" />
      <path d="m16 9.5 5 5M21 9.5l-5 5" />
    </svg>
  );
}

function IkonUlang({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4.5V10h5.5" />
    </svg>
  );
}

/* Segitiga yang MENITIK BERATKAN DIRI SENDIRI: titik berat (8+20+8)/3 dan
   (4+12+20)/3 jatuh tepat di 12,12 — pusat viewBox. Bentuk lama (6 3, 20 12,
   6 21) titik beratnya di x=10,67 sementara kotak batasnya berpusat di 13,
   dan pemanggilnya menambal itu dengan translate-x-0.5; dua koreksi yang
   bertumpuk membuat segitiga terukur 2,58px ke kanan dari pusat lingkaran
   28px. Dengan bentuk ini penambal itu tak diperlukan lagi. */
function IkonPutarBadge({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" className={className}>
      <polygon points="8 4 20 12 8 20" />
    </svg>
  );
}

/* Video kartu umpan — tidak autoplay otomatis; pratinjau putar bisu hanya saat kursor melayang (hover).
   Klik membuka modal rincian yang memuat pemutar video lengkap dengan kendali.
   preload="none" mencegah unduhan data video sebelum interaksi, demi performa PageSpeed Insights. */
function VideoOtomatis({ url, poster, label, onBuka, tanpaMt = false, kredit = null, bahasa: _bahasa }: {
  url: string; poster: string | null; label: string; onBuka: () => void;
  /** true di dalam carousel — margin atas milik wadah, bukan tombol. */
  tanpaMt?: boolean;
  /** Nama kredit untuk pil © — null = tanpa pil. */
  kredit?: string | null;
  bahasa: Bahasa;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [siap, setSiap] = useState(false);
  const [posterGagal, setPosterGagal] = useState(false);
  const [sedangHover, setSedangHover] = useState(false);

  const mulaiHover = useCallback(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;
    el.muted = true;
    setSedangHover(true);
    el.play().catch(() => {});
  }, []);

  const hentiHover = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setSedangHover(false);
    el.pause();
    if (el.readyState >= 1 && el.currentTime) el.currentTime = 0;
  }, []);

  // Pastikan video berhenti saat unmount
  useEffect(() => {
    return () => {
      const el = ref.current;
      if (el) el.pause();
    };
  }, []);

  return (
    <div
      className={`lk-foto block w-full${tanpaMt ? "" : " mt-3"}`}
      onMouseEnter={mulaiHover}
      onMouseLeave={hentiHover}
    >
      <span className="relative block">
        <button
          type="button"
          onClick={onBuka}
          aria-label={label}
          className="group block w-full cursor-pointer transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5a26] hover:brightness-95"
        >
          {poster && !posterGagal ? (
            <>
              {mediaLokal(poster) ? (
                /* Poster unggahan lokal lewat optimizer (AVIF/WebP, srcset
                   selebar kartu); rasio alaminya tetap dari CSS h-auto. */
                <Image
                  src={poster} alt="" aria-hidden="true" loading="lazy"
                  width={0} height={0} sizes={tanpaMt ? "100vw" : UKURAN_FOTO_UMPAN}
                  onError={() => setPosterGagal(true)}
                  className="lk-foto h-auto w-full"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- URL media remote warisan, host dinamis di luar remotePatterns
                <img
                  src={poster} alt="" aria-hidden="true" loading="lazy"
                  onError={() => setPosterGagal(true)}
                  className="lk-foto h-auto w-full"
                />
              )}
              <video
                ref={ref}
                src={url}
                muted
                playsInline
                loop
                preload="none"
                aria-hidden="true"
                tabIndex={-1}
                onCanPlay={() => setSiap(true)}
                onPlaying={() => setSiap(true)}
                className={`lk-video absolute inset-0 h-full w-full object-cover transition duration-300 ${sedangHover && siap ? "opacity-100" : "opacity-0"}`}
              />
            </>
          ) : (
            <video
              ref={ref}
              src={url}
              muted
              playsInline
              loop
              preload="none"
              aria-hidden="true"
              tabIndex={-1}
              onCanPlay={() => setSiap(true)}
              onPlaying={() => setSiap(true)}
              className="lk-foto h-auto w-full"
            />
          )}

          {/* Lencana indikator video: ikon putar putih di kanan bawah yang memudar saat sedang diputar */}
          <span
            aria-hidden="true"
            className={`absolute bottom-2.5 right-2.5 z-2 flex size-7 items-center justify-center rounded-full bg-black/65 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.7)] transition-all duration-200 pointer-events-none ${sedangHover && siap ? "opacity-0 scale-90" : "opacity-100 scale-100"}`}
          >
            <IkonPutarBadge className="size-4" />
          </span>
        </button>

        {kredit !== null && (
          <span aria-hidden="true" className="lk-kredit">
            ©&nbsp;{kredit || "anonim"}
          </span>
        )}
      </span>
    </div>
  );
}


/* Ikon menu lembar — garis 1.8 ala rujukan. */function IkonBagikan({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6" />
    </svg>
  );
}

/* Tampilan "Postingan" seluler ala IG — dibuka dari tap gambar di umpan
   (desktop langsung ke rincian). Bilah kembali + judul, baris penulis,
   media selebar layar (dots ketuk, tanpa geser), baris aksi (suka
   perangkat-lokal, komentar, bagikan), caption + selengkapnya + tanggal. */
export function TampilanPostingan({ laporan: l, bahasa, onTutup, onBuka, onKomentar, onPrev, onNext, statis = false }: {
  laporan: Laporan;
  bahasa: Bahasa;
  onTutup: () => void;
  onBuka: () => void;
  onKomentar: () => void;
  /** Navigasi antar postingan ala Instagram: panah pindah postingan
      sebelumnya/berikutnya. Tak diberikan → panah disembunyikan. */
  onPrev?: () => void;
  onNext?: () => void;
  /** true di halaman detail tersendiri: mengalir normal, bukan overlay fixed. */
  statis?: boolean;
}) {
  const t = TEKS[bahasa];
  const [idx, setIdx] = useState(0);
  const [tersalin, setTersalin] = useState(false);
  const [descPenuh, setDescPenuh] = useState(false);
  const sentuh = useRef<{ x: number; y: number } | null>(null);
  // Jumlah komentar untuk angka di samping ikon — diambil sekali saat buka.
  const [jumlahKomentar, setJumlahKomentar] = useState<number | null>(null);
  useEffect(() => {
    let hidup = true;
    fetch(`/api/laporan/${l.id}/komentar`, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        if (!hidup) return;
        const daftar = Array.isArray((j as { komentar?: unknown })?.komentar)
          ? ((j as { komentar: { balasan?: unknown[] }[] }).komentar)
          : [];
        setJumlahKomentar(
          daftar.reduce((n, k) => n + 1 + (Array.isArray(k.balasan) ? k.balasan.length : 0), 0),
        );
      })
      .catch(() => {
        /* gagal muat: angka disembunyikan, bukan dinolkan */
      });
    return () => {
      hidup = false;
    };
  }, [l.id]);
  // "Selengkapnya" hanya bila deskripsi benar-benar terpotong clamp —
  // diukur, bukan ditebak dari panjang teks (responsif di semua lebar).
  const descRef = useRef<HTMLSpanElement | null>(null);
  const [descTerpotong, setDescTerpotong] = useState(false);
  useEffect(() => {
    const ukur = () => {
      // Saat mengembang jangan ukur (tak terpotong) — tombolnya harus tetap
      // ada supaya bisa melipat lagi.
      if (descPenuh) return;
      const el = descRef.current;
      setDescTerpotong(!!el && el.scrollHeight > el.clientHeight + 1);
    };
    ukur();
    window.addEventListener("resize", ukur);
    return () => window.removeEventListener("resize", ukur);
  }, [l.deskripsi, descPenuh]);
  // Satu media utama bila galeri kosong (jaga-jaga): bangun dari gambar/video.
  const items = l.galeri.length > 0
    ? l.galeri
    : [{ url: "", jenis: "gambar" as const }];
  const n = items.length;
  const aktif = items[Math.min(idx, n - 1)];

  useEffect(() => {
    const saatTombol = (e: KeyboardEvent) => {
      if (e.key === "Escape") onTutup();
      if (e.key === "ArrowLeft") onPrev?.();
      if (e.key === "ArrowRight") onNext?.();
    };
    window.addEventListener("keydown", saatTombol);
    // Kunci badan hanya mode overlay — varian halaman (statis) harus bisa
    // menggulir normal.
    if (statis) {
      return () => window.removeEventListener("keydown", saatTombol);
    }
    const limpahan = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", saatTombol);
      document.body.style.overflow = limpahan;
    };
  }, [onTutup, statis, onPrev, onNext]);

  async function bagikan() {
    const tautan = `${window.location.origin}${l.href}`;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: l.judul, url: tautan });
        return;
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(tautan);
      setTersalin(true);
      window.setTimeout(() => setTersalin(false), 2000);
    } catch {
      /* izin clipboard diblokir */
    }
  }

  return (
    <div className={`lk-postingan${statis ? " lk-postingan--statis" : ""} bg-white text-tinta dark:bg-black dark:text-[#f5f5f5]`} role="dialog" aria-modal="true" aria-label={l.judul}>
      <div className="lk-postingan-penulis bg-white/95 text-tinta border-b border-black/[0.06] dark:bg-black/90 dark:text-[#f5f5f5] dark:border-white/10">
        <button
          type="button"
          onClick={onTutup}
          aria-label={bahasa === "en" ? "Back" : "Kembali"}
          className="lk-postingan-kembali cursor-pointer -ml-1 mr-0.5 rounded-full p-1.5 text-tinta transition hover:bg-black/10 dark:text-[#f5f5f5] dark:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#ff5a26]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <Image src="/assets/img/logo-fire.png" alt="" aria-hidden="true" width={99} height={160} className="lk-postingan-avatar" />
        <div className="min-w-0 flex-1">
          <p className="lk-postingan-nama text-tinta dark:text-[#f5f5f5]">Lapor Karhutla</p>
          {l.lokasi && <p className="lk-postingan-lokasi text-black/55 dark:text-[#a0a0a0]">{l.lokasi}</p>}
        </div>
      </div>

      <div
        className="lk-postingan-media"
        onTouchStart={(e) => {
          const s = e.touches[0];
          sentuh.current = { x: s.clientX, y: s.clientY };
        }}
        onTouchEnd={(e) => {
          const awal = sentuh.current;
          sentuh.current = null;
          if (!awal || n < 2) return;
          const s = e.changedTouches[0];
          const dx = s.clientX - awal.x;
          const dy = s.clientY - awal.y;
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            setIdx((i) => (i + (dx < 0 ? 1 : -1) + n) % n);
          }
        }}
      >
        {aktif.jenis === "video" ? (
          <VideoOtomatis url={aktif.url} poster={aktif.poster ?? l.gambar} label={l.judul} onBuka={onBuka} tanpaMt kredit={aktif.keterangan ?? "anonim"} bahasa={bahasa} />
        ) : aktif.url ? (
          <span className="lk-media-statis">
            {mediaLokal(aktif.url) ? (
              <Image src={aktif.url} alt={l.alt} width={0} height={0} sizes="100vw" className="lk-postingan-foto" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- URL media remote warisan, host dinamis di luar remotePatterns
              <img src={aktif.url} alt={l.alt} className="lk-postingan-foto" />
            )}
            <span aria-hidden="true" className="lk-kredit">
              ©&nbsp;{aktif.keterangan ?? "anonim"}
            </span>
          </span>
        ) : null}
        {onPrev && (
          <button
            type="button"
            aria-label="Postingan sebelumnya"
            onClick={onPrev}
            className="rincian__slider-tombol rincian__slider-tombol--kiri cursor-pointer"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18 9 12l6-6" />
            </svg>
          </button>
        )}
        {onNext && (
          <button
            type="button"
            aria-label="Postingan berikutnya"
            onClick={onNext}
            className="rincian__slider-tombol rincian__slider-tombol--kanan cursor-pointer"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        )}
        {n > 1 && (
          <div className="lk-postingan-titik" role="group" aria-label={`${idx + 1} / ${n}`}>
            {items.map((m, i) => (
              <button
                key={`${m.url}-${i}`}
                type="button"
                onClick={() => setIdx(i)}
                aria-label={`${i + 1} / ${n}`}
                aria-current={i === idx}
                className="lk-postingan-titik-tombol cursor-pointer"
              >
                <span aria-hidden="true" data-aktif={i === idx} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="lk-postingan-aksi">
        <button type="button" onClick={onKomentar} aria-label={t.komentar} className="lk-postingan-ikon lk-postingan-komentar cursor-pointer text-tinta transition hover:bg-black/10 dark:text-[#f5f5f5] dark:hover:bg-white/10">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9"
               strokeLinecap="round" strokeLinejoin="round" className="size-7">
            <path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z" />
          </svg>
          {jumlahKomentar !== null && (
            <span aria-hidden="true">{jumlahKomentar.toLocaleString("id-ID")}</span>
          )}
        </button>
        <button type="button" onClick={bagikan} aria-label={tersalin ? t.lembarTersalin : t.lembarBagikan} className="lk-postingan-ikon cursor-pointer text-tinta transition hover:bg-black/10 dark:text-[#f5f5f5] dark:hover:bg-white/10">
          <IkonBagikan />
        </button>
      </div>

      <div className="lk-postingan-caption">
        <p className="lk-postingan-caption-judul text-tinta dark:text-[#f5f5f5]">{l.judul}</p>
        {l.deskripsi && (
          <p className="lk-postingan-caption-isi text-tinta dark:text-[#f5f5f5]">
            <span ref={descRef} className={descPenuh ? "" : "lk-postingan-caption-pendek"}>{l.deskripsi}</span>{" "}
            {descTerpotong && (
              <button type="button" onClick={() => setDescPenuh((v) => !v)} className="lk-postingan-selengkapnya cursor-pointer text-black/60 dark:text-[#a0a0a0]">
                {descPenuh ? t.lebihSedikit : t.selengkapnya}
              </button>
            )}
          </p>
        )}
        <p className="lk-postingan-tanggal text-black/50 dark:text-[#a0a0a0]">{l.tanggal}</p>
      </div>
    </div>
  );
}

/* Lembar komentar seluler ala IG: gagang + judul + daftar + formulir,
   memakai sistem komentar yang sama dengan rincian (bukan tiruan).
   Lembar tulis bawaan formulir dinaikkan di atas lembar ini via CSS. */
export function LembarKomentar({ id, bahasa, onTutup }: {
  id: number; bahasa: Bahasa; onTutup: () => void;
}) {
  const t = TEKS[bahasa];
  const k = gunakanKomentar(id);

  useEffect(() => {
    const saatTombol = (e: KeyboardEvent) => {
      if (e.key === "Escape") onTutup();
    };
    window.addEventListener("keydown", saatTombol);
    const limpahan = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", saatTombol);
      document.body.style.overflow = limpahan;
    };
  }, [onTutup]);

  return (
    <div className="lk-komentar-latar cursor-pointer" onClick={onTutup}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.komentar}
        onClick={(e) => e.stopPropagation()}
        className="lk-komentar bg-white text-tinta border-t border-black/[0.08] shadow-2xl dark:bg-[#1e1e1e] dark:text-[#f5f5f5] dark:border-white/10"
      >
        <span aria-hidden="true" className="lk-komentar-gagang bg-black/20 dark:bg-white/30" />
        <h2 className="text-tinta dark:text-[#f5f5f5]">{t.komentar}</h2>
        <div className="lk-komentar-daftar">
          <UlasanKomentar
            daftar={k.daftar}
            memuat={k.memuat}
            galat={k.galat}
            tampilkanBalasan={k.tampilkanBalasan}
            alihkanBalasan={k.alihkanBalasan}
            mulaiBalas={k.mulaiBalas}
            sebutanDari={k.sebutanDari}
            isiTanpaSebutan={k.isiTanpaSebutan}
          />
        </div>
        <div className="lk-komentar-form">
          <FormulirKomentar
            mengirim={k.mengirim}
            galat={k.galat}
            nama={k.nama}
            setNama={k.setNama}
            email={k.email}
            setEmail={k.setEmail}
            anonim={k.anonim}
            setAnonim={k.setAnonim}
            isi={k.isi}
            setIsi={k.setIsi}
            website={k.website}
            setWebsite={k.setWebsite}
            balasKe={k.balasKe}
            balasNama={k.balasNama}
            batalBalas={k.batalBalas}
            kirim={k.kirim}
            ketikRef={k.ketikRef}
            captchaRef={k.captchaRef}
            tanpaSheet
          />
        </div>
      </div>
    </div>
  );
}

/* Umpan masonry berkolom tetap — pola yang sama dengan MasonryKolom di index:
   kartu dibagi bergiliran (0,1,2,0,1,2…) ke sejumlah daftar terpisah, lalu
   daftar-daftar itu dijajar. Sengaja BUKAN CSS `columns`: di sana peramban
   yang memutuskan isi tiap kolom dan menghitung ulangnya setiap tinggi isi
   berubah — gambar yang baru termuat melempar kartu ke kolom lain. Di sini
   penempatan ditentukan indeks, jadi kekal: gambar yang telat hanya mendorong
   kartu di bawahnya dalam kolom yang sama. */
function UmpanMasonry({ daftar, kolom, kartu }: {
  daftar: Laporan[];
  kolom: number;
  kartu: (l: Laporan, i: number) => React.ReactNode;
}) {
  const keranjang = useMemo(() => {
    const isi: Laporan[][] = Array.from({ length: Math.max(1, kolom) }, () => []);
    daftar.forEach((l, i) => {
      isi[i % isi.length].push(l);
    });
    return isi;
  }, [daftar, kolom]);

  return (
    <div className="lk-masonry mt-5 flex items-start">
      {keranjang.map((isiKolom, i) => (
        <div key={i} className="lk-masonry-kolom flex min-w-0 flex-1 flex-col">
          {isiKolom.map((l, j) => kartu(l, i * 100 + j))}
        </div>
      ))}
    </div>
  );
}

/* Ikon bilah tab seluler — garis 2, gaya X. */
export function IkonBeranda({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m4 11 8-7 8 7" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

function IkonPlus({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9"
         strokeLinecap="round" className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IkonTulis({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

/* Ikon penyeberang section: panel (peta terlipat) dan umpan (tumpukan foto).
   Panel memakai peta, bukan kisi instrumen seperti dulu — isi halaman yang
   dituju memang peta sebaran, dan kisi abstrak tak memberi petunjuk apa pun
   soal itu. Bukan pin lokasi: berkas ini sudah punya IkonPin dan IkonLokasi,
   dan pin terbaca "tempat ini", bukan "peta". */
function IkonPanel({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 6.2 9 4 15 6.2 21 4 21 17.8 15 20 9 17.8 3 20 Z" />
      <path d="M9 4V17.8" />
      <path d="M15 6.2V20" />
    </svg>
  );
}

export function IkonUmpan({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9"
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="4" y="4" width="7" height="10" rx="1.5" />
      <rect x="13" y="4" width="7" height="6" rx="1.5" />
      <rect x="13" y="12" width="7" height="8" rx="1.5" />
      <rect x="4" y="16" width="7" height="4" rx="1.5" />
    </svg>
  );
}

/* Komposer laporan inline ala X: tampilan menciut (avatar + ajakan + ikon +
   pil Kirim), mengembang jadi mini-form saat disentuh, dan mengirim lewat
   server action YANG SAMA dengan form /lapor — tanpa pindah halaman.

   Syarat server yang wajib dipenuhi di sini juga: judul, deskripsi, minimal
   satu berkas, dan token Turnstile (bila site key dipasang). Lokasi opsional;
   tanpa lat/lng server mencoba EXIF foto. Nama opsional + centang anonim
   seperti form /lapor. */
function KomposerLapor({ bahasa }: { bahasa: Bahasa }) {
  const t = TEKS[bahasa];
  const router = useRouter();
  /* Isian teks lahir dari draf yang tersimpan, bukan dari string kosong.

     Sebabnya: tab peta seluler menunjuk ke /karhutla/panel dan tombol "+" di
     sana menunjuk balik ke /karhutla — dua rute, jadi App Router me-mount
     ulang komposer ini dan seluruh state di bawah lahir kosong lagi. Gejala
     yang terlihat: mengetik di beranda, mampir ke peta, tekan "+", isian
     sudah bersih. Komponennya memang satu dan sama; yang hilang state-nya.

     Aman dari ketidakcocokan hidrasi meski inisialisasi lazy ikut berjalan di
     klien: selama `buka` masih false — dan ia SELALU false pada render
     pertama, di server maupun klien — tak satu pun nilai di bawah ini sampai
     ke DOM. Barulah setelah komposer dibuka isinya dirender, dan saat itu
     hidrasi sudah lewat.

     `berkas` TIDAK ikut: objek File tak bisa ditaruh di localStorage, jadi
     lampiran tetap harus dipilih ulang setelah pindah halaman. */
  const [drafAwal] = useState(bacaDraf);
  const [buka, setBuka] = useState(false);
  const [judul, setJudul] = useState(drafAwal.judul);
  const [deskripsi, setDeskripsi] = useState(drafAwal.deskripsi);
  const [berkas, setBerkas] = useState<File[]>([]);
  const [pratinjau, setPratinjau] = useState<Record<string, string>>({});
  const [lat, setLat] = useState(drafAwal.lat);
  const [lng, setLng] = useState(drafAwal.lng);
  const [nama, setNama] = useState(drafAwal.nama);
  const [anonim, setAnonim] = useState(drafAwal.anonim);
  const [mencariLokasi, setMencariLokasi] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [galatKlien, setGalatKlien] = useState("");
  const [terkirim, setTerkirim] = useState(false);
  const [menungguToken, setMenungguToken] = useState(false);

  /* Draf disimpan tiap kali isinya berubah. Kiriman yang berhasil
     mengosongkan semua isian di atas, jadi pembersihan draf ikut lewat
     simpanDraf — tak perlu penghapusan terpisah. */
  useEffect(() => {
    simpanDraf({ judul, deskripsi, nama, lat, lng, anonim });
  }, [judul, deskripsi, nama, lat, lng, anonim]);

  const berkasRef = useRef<HTMLInputElement | null>(null);
  const captchaRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<number | null>(null);
  const sedangKirimRef = useRef(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const penungguToken = useRef<((tiba: boolean) => void)[]>([]);
  const urlRef = useRef<string[]>([]);
  const lokasiAktifRef = useRef(true);
  useEffect(() => {
    lokasiAktifRef.current = true;
    return () => {
      lokasiAktifRef.current = false;
      for (const url of urlRef.current) URL.revokeObjectURL(url);
      urlRef.current = [];
    };
  }, []);

  const ulangCaptcha = useCallback(() => {
    setCaptchaToken("");
    const ts = turnstile();
    if (ts && widgetRef.current !== null) {
      try {
        ts.reset(widgetRef.current);
      } catch {
        /* widget sudah lepas */
      }
    }
  }, []);

  const [keadaan, aksi, mengirim] = useActionState<KeadaanLapor, FormData>(
    async (sebelumnya: KeadaanLapor, data: FormData) => {
      try {
        const hasil = await kirimLaporan(sebelumnya, data);
        if (hasil?.ok) {
          for (const url of urlRef.current) URL.revokeObjectURL(url);
          urlRef.current = [];
          setPratinjau({});
          setBerkas([]);
          setJudul("");
          setDeskripsi("");
          setLat("");
          setLng("");
          setNama("");
          setAnonim(false);
          setTerkirim(true);
          router.refresh();
        } else {
          ulangCaptcha();
        }
        return hasil;
      } finally {
        sedangKirimRef.current = false;
      }
    },
    null,
  );

  const sinkronkanKeInput = useCallback((daftar: File[]) => {
    const input = berkasRef.current;
    if (!input) return;
    try {
      if (typeof DataTransfer !== "undefined") {
        const dt = new DataTransfer();
        for (const b of daftar) dt.items.add(b);
        input.files = dt.files;
      }
    } catch {
      /* peramban tanpa dukungan DataTransfer */
    }
  }, []);

  useEffect(() => {
    // `buka` ikut disinkronkan: input berkas di mode menciut dan di form adalah
    // dua elemen berbeda — berkas yang dipilih sebelum mengembang harus pindah
    // ke input form, kalau tidak kiriman berangkat tanpa lampiran.
    sinkronkanKeInput(berkas);
  }, [berkas, keadaan, buka, sinkronkanKeInput]);

  // Pesan sukses hanya mampir 5 detik: laporan masih antre kurasi sebelum
  // tampil di publik, lalu komposer kembali ke tampilan awal yang menciut.
  useEffect(() => {
    if (!terkirim) return;
    const jam = window.setTimeout(() => {
      setTerkirim(false);
      setBuka(false);
    }, 5000);
    return () => window.clearTimeout(jam);
  }, [terkirim]);

  // Widget Turnstile dipasang saat komposer mengembang — sama seperti form
  // /lapor: appearance interaction-only, tak terlihat kecuali ditantang.
  useEffect(() => {
    if (!buka || !SITE_KEY) return;
    let hidup = true;
    const pasang = () => {
      const wadah = captchaRef.current;
      const ts = turnstile();
      if (!wadah || !hidup) return;
      if (!ts) {
        window.setTimeout(pasang, 100);
        return;
      }
      if (widgetRef.current !== null) {
        try {
          ts.remove(widgetRef.current);
        } catch {
          /* belum ada widget */
        }
        widgetRef.current = null;
      }
      wadah.innerHTML = "";
      widgetRef.current = ts.render(wadah, {
        sitekey: SITE_KEY,
        appearance: "interaction-only",
        callback: (token: string) => {
          setCaptchaToken(token);
          penungguToken.current.splice(0).forEach((bangun) => bangun(true));
        },
        "expired-callback": () => {
          setCaptchaToken("");
          if (widgetRef.current !== null) {
            try {
              ts.reset(widgetRef.current);
            } catch {
              /* widget sudah lepas */
            }
          }
        },
        "error-callback": () => {
          setCaptchaToken("");
          if (widgetRef.current !== null) {
            try {
              ts.reset(widgetRef.current);
            } catch {
              /* widget sudah lepas */
            }
          }
        },
      });
    };
    pasang();
    return () => {
      hidup = false;
      const ts = turnstile();
      if (ts && widgetRef.current !== null) {
        try {
          ts.remove(widgetRef.current);
        } catch {
          /* sudah lepas */
        }
        widgetRef.current = null;
      }
    };
  }, [buka]);

  function tambahBerkas(dipilih: FileList | null) {
    if (!dipilih || dipilih.length === 0) return;
    setBuka(true);
    setGalatKlien("");
    const sudah = new Set(berkas.map(kunciBerkas));
    const gabungan = [...berkas];
    const kunciBaru: string[] = [];
    for (const b of dipilih) {
      const kunci = kunciBerkas(b);
      if (!sudah.has(kunci)) {
        sudah.add(kunci);
        gabungan.push(b);
        kunciBaru.push(kunci);
      }
    }
    if (gabungan.length > BATAS_BERKAS) {
      setGalatKlien(t.terlaluBanyak);
      return;
    }
    if (gabungan.reduce((n, b) => n + b.size, 0) > BATAS_TOTAL_BYTE) {
      setGalatKlien(t.terlaluBesar);
      return;
    }
    const tambahanUrl: Record<string, string> = {};
    for (const kunci of kunciBaru) {
      const b = gabungan.find((x) => kunciBerkas(x) === kunci);
      if (b) {
        const url = URL.createObjectURL(b);
        urlRef.current.push(url);
        tambahanUrl[kunci] = url;
      }
    }
    if (Object.keys(tambahanUrl).length > 0) {
      setPratinjau((lama) => ({ ...lama, ...tambahanUrl }));
    }
    setBerkas(gabungan);
    sinkronkanKeInput(gabungan);
    if (berkasRef.current) berkasRef.current.value = "";
  }

  function hapusBerkas(kunci: string, url: string | undefined) {
    if (url) {
      URL.revokeObjectURL(url);
      urlRef.current = urlRef.current.filter((u) => u !== url);
    }
    setPratinjau((lama) => {
      const sisa = { ...lama };
      delete sisa[kunci];
      return sisa;
    });
    const sisaBerkas = berkas.filter((x) => kunciBerkas(x) !== kunci);
    setBerkas(sisaBerkas);
    sinkronkanKeInput(sisaBerkas);
  }

  function lokasiSaya() {
    setBuka(true);
    if (!navigator.geolocation) {
      setGalatKlien(t.lokasiGagal);
      return;
    }
    setMencariLokasi(true);
    setGalatKlien("");
    navigator.geolocation.getCurrentPosition(
      (posisi) => {
        if (!lokasiAktifRef.current) return;
        setMencariLokasi(false);
        setLat(posisi.coords.latitude.toFixed(7));
        setLng(posisi.coords.longitude.toFixed(7));
      },
      () => {
        if (!lokasiAktifRef.current) return;
        setMencariLokasi(false);
        setGalatKlien(t.lokasiGagal);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function hapusLokasi() {
    setLat("");
    setLng("");
  }

  if (terkirim) {
    return (
      <div role="status" className="rounded-xl bg-white border border-black/[0.06] text-tinta shadow-sm dark:bg-black dark:border-white/5 dark:text-[#f5f5f5] p-5 text-center">
        <p className="text-[15px] font-bold text-tinta dark:text-[#f5f5f5]">{t.terkirim}</p>
        <p className="mx-auto mt-1 max-w-[46ch] text-[13px] leading-relaxed text-black/60 dark:text-[#a0a0a0]">
          {t.terkirimIsi}
        </p>
        <button
          type="button"
          onClick={() => setTerkirim(false)}
          className="mt-3 cursor-pointer rounded-full bg-black text-white dark:bg-[#e7e9ea] dark:text-black px-5 py-1.5 text-[14px] font-bold transition
                     hover:opacity-90 dark:hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5a26]"
        >
          {t.tulisLagi}
        </button>
    </div>
  );
}

  const galat = galatKlien || (keadaan && !keadaan.ok ? keadaan.galat : "");
  /* "Ada lokasi" DITURUNKAN dari isi koordinatnya, bukan bendera tersendiri:
     dengan kotak Lat/Lng yang kini sebaris dan terlihat, bendera yang bilang
     "belum ada titik" sementara dua kotak di sebelahnya jelas berisi angka
     adalah pil yang berbohong. */
  const adaLokasi = lat.trim() !== "" || lng.trim() !== "";
  const ikonAksi = "lk-ikon-aksi cursor-pointer rounded-full p-2 text-[#ff5a26] transition hover:bg-[#ff5a26]/10 focus-visible:outline-2 focus-visible:outline-[#ff5a26]";

  return (
    <div className="rounded-xl bg-white border border-black/[0.06] text-tinta shadow-sm dark:bg-black dark:border-white/5 dark:text-[#f5f5f5] p-4">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="lk-avatar flex size-11 shrink-0 items-center justify-center rounded-full bg-[#ff5a26] text-white">
          <IkonOrang className="size-6 text-white stroke-white" />
        </span>
        {!buka ? (
          <button
            type="button"
            id="lk-tulis"
            onClick={() => setBuka(true)}
            className="flex-1 cursor-pointer truncate rounded-lg bg-black/[0.03] px-4 py-2.5 text-left text-[15px] text-black/80 transition-all hover:bg-black/[0.06] hover:text-black dark:bg-white/[0.06] dark:text-[#f0f0f0] dark:hover:bg-white/[0.1] dark:hover:text-white
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5a26]"
          >
            {t.tulis}
          </button>
        ) : (
          <>
            <label htmlFor="lk-judul" className="sr-only">{t.judulPh}</label>
            {/* Di luar <form> tapi ikut terkirim lewat form="lk-form" — supaya
                ia bisa duduk sejajar avatar seperti komposer X. */}
            <input
              id="lk-judul"
              name="judul"
              form="lk-form"
              value={judul}
              onChange={(e) => setJudul(e.target.value)}
              placeholder={t.judulPh}
              maxLength={255}
              autoComplete="off"
              className="lk-tulis-isi min-w-0 flex-1 rounded-lg border border-black/[0.12] bg-white px-4 py-2.5 text-[15px] font-semibold text-tinta placeholder:font-normal placeholder:text-black/40 transition-all focus:border-[#ff5a26] focus:outline-none focus:ring-1 focus:ring-[#ff5a26] dark:border-white/15 dark:bg-white/[0.04] dark:text-[#f5f5f5] dark:placeholder:text-[#a0a0a0]/70 dark:focus:border-[#ff5a26]"
            />
          </>
        )}
      </div>

      {!buka ? (
        <div className="mt-2 flex items-center gap-1 panggung:pl-14">
          <button type="button" title={t.lampirFoto} aria-label={t.lampirFoto}
                  onClick={() => berkasRef.current?.click()} className={ikonAksi}>
            <IkonFoto />
          </button>
          <button type="button" title={t.lampirVideo} aria-label={t.lampirVideo}
                  onClick={() => berkasRef.current?.click()} className={ikonAksi}>
            <IkonVideo />
          </button>
          <button type="button" title={t.tandaiLokasi} aria-label={t.tandaiLokasi}
                  onClick={lokasiSaya} className={ikonAksi}>
            <IkonPin />
          </button>
          <button
            type="button"
            onClick={() => setBuka(true)}
            className="lk-kirim ml-auto cursor-pointer rounded-full bg-black text-white dark:bg-[#e7e9ea] dark:text-black px-5 py-1.5 text-[15px] font-bold transition
                       hover:opacity-90 dark:hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5a26]"
          >
            {t.kirim}
          </button>
        </div>
      ) : (
        <form
          ref={formRef}
          id="lk-form"
          action={aksi}
          onSubmit={(e) => {
            if (sedangKirimRef.current || mengirim || menungguToken) {
              e.preventDefault();
              return;
            }
            if (judul.trim() === "") {
              e.preventDefault();
              setGalatKlien(t.judulWajib);
              document.getElementById("lk-judul")?.focus();
              return;
            }
            if (deskripsi.trim() === "") {
              e.preventDefault();
              setGalatKlien(t.ceritaWajib);
              document.getElementById("lk-cerita")?.focus();
              return;
            }
            if (berkas.length === 0) {
              e.preventDefault();
              setGalatKlien(t.berkasWajib);
              return;
            }
            if (Boolean(SITE_KEY) && !captchaToken) {
              e.preventDefault();
              setGalatKlien("");
              setMenungguToken(true);
              new Promise<boolean>((selesai) => {
                const jam = setTimeout(() => {
                  penungguToken.current = penungguToken.current.filter((f) => f !== bangun);
                  selesai(false);
                }, 20000);
                const bangun = (tiba: boolean) => { clearTimeout(jam); selesai(tiba); };
                penungguToken.current.push(bangun);
              }).then((tiba) => {
                setMenungguToken(false);
                if (!tiba) {
                  setGalatKlien(t.keamananGagal);
                  return;
                }
                sedangKirimRef.current = true;
                formRef.current?.requestSubmit();
              });
              return;
            }
            sedangKirimRef.current = true;
          }}
          /* Indentasi sejajar-avatar ala X hanya di panggung. Di ponsel pl-14
             (56px) ditambah p-4 panel membuat kiri tersisip 72px sementara
             kanan cuma 16px — asimetris, dan sisa lebarnya tinggal ~286px
             sehingga baris Lat/Lng/Nama/Anonim mentok ke tepi. */
          className="mt-2.5 panggung:pl-14"
        >
          {/* Tumbuh mengikuti isi. Dengan rows tetap, kotak yang baru berisi
              placeholder menyisakan rongga menganga di atas baris berikutnya —
              dan rongga itulah yang pertama menarik mata, bukan isinya.
              Atapnya 200px supaya cerita panjang tak mendorong tombol kirim
              keluar layar. */}
          <textarea
            id="lk-cerita"
            name="deskripsi"
            value={deskripsi}
            onChange={(e) => {
              setDeskripsi(e.target.value);
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
            }}
            placeholder={t.ceritaPh}
            maxLength={5000}
            rows={2}
            className="lk-tulis-isi w-full resize-none rounded-lg border border-black/[0.12] bg-white p-3.5 text-[15px] leading-relaxed text-tinta placeholder:text-black/40 transition-all focus:border-[#ff5a26] focus:outline-none focus:ring-1 focus:ring-[#ff5a26] dark:border-white/15 dark:bg-white/[0.04] dark:text-[#f5f5f5] dark:placeholder:text-[#a0a0a0]/70 dark:focus:border-[#ff5a26]"
          />

          {galat && (
            <p role="alert" className="mt-2 text-[13px] leading-relaxed text-[#e60012] dark:text-[#ff7a59]">
              {galat}
            </p>
          )}

          <div ref={captchaRef} />
          <input ref={berkasRef} type="file" name="berkas" multiple accept={DITERIMA}
                 aria-label={t.lampirFoto}
                 onChange={(e) => tambahBerkas(e.target.files)} className="sr-only" tabIndex={-1} />
          <input type="hidden" name="captcha" value={captchaToken} />
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

          {/* Satu baris identitas: pil lokasi, nama, anonim — tiga benda, bukan
              lima. Titiknya ditandai lewat pil (sekali sentuh), bukan dengan
              mengetik dua bilangan desimal; keadaan "ditandai" dibaca dari pil
              itu sendiri, jadi tak perlu baris keterangan di bawahnya. Nama
              memanjang mengisi sisa baris supaya tak ada rongga. */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={adaLokasi ? hapusLokasi : lokasiSaya}
              disabled={mencariLokasi}
              title={adaLokasi ? t.lokasiHapus : t.tandaiLokasi}
              aria-label={adaLokasi ? t.lokasiHapus : t.tandaiLokasi}
              className={`lk-isian flex h-9 cursor-pointer items-center gap-1.5 rounded-full pr-3 pl-2.5 text-[13px]
                          whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-50
                          focus-visible:outline-2 focus-visible:outline-[#ff5a26] ${
                adaLokasi
                  ? "bg-[#ff5a26]/20 text-[#ff5a26] hover:bg-[#ff5a26]/25"
                  : "bg-[#ff5a26]/10 text-[#ff5a26] hover:bg-[#ff5a26]/15"
              }`}
            >
              <IkonPin className="size-[18px]" />
              <span>{mencariLokasi ? t.mencariLokasi : adaLokasi ? t.lokasiOk : t.tandaiLokasi}</span>
              {adaLokasi && (
                <svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor" className="size-3.5 opacity-70">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              )}
            </button>

            {/* Koordinatnya selalu terpampang, tepat di sebelah pil lokasi.
                Ia bukan kontrol yang perlu dibuka: begitu titiknya ditandai
                GPS, dua bilangan itulah buktinya — dan pelapor berhak melihat
                serta membetulkannya. Sekaligus jalan masuk lat/lng custom. */}
            <span className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
              <label className="sr-only" htmlFor="lk-lat">{t.latPh}</label>
              <input id="lk-lat" name="lat" inputMode="decimal" placeholder={t.latPh}
                     value={lat} onChange={(e) => setLat(e.target.value)}
                     className="lk-isian lk-koord h-9 w-0 min-w-0 flex-1 sm:w-[86px] sm:flex-none rounded-lg bg-white px-3 font-mono placeholder:font-sans text-[13px] text-tinta border border-black/[0.12] placeholder:text-black/40 transition-all focus:border-[#ff5a26] focus:outline-none focus:ring-1 focus:ring-[#ff5a26] dark:bg-white/[0.04] dark:text-[#f5f5f5] dark:border-white/15 dark:placeholder:text-[#a0a0a0]/60 dark:focus:border-[#ff5a26]" />
              <label className="sr-only" htmlFor="lk-lng">{t.lngPh}</label>
              <input id="lk-lng" name="lng" inputMode="decimal" placeholder={t.lngPh}
                     value={lng} onChange={(e) => setLng(e.target.value)}
                     className="lk-isian lk-koord h-9 w-0 min-w-0 flex-1 sm:w-[86px] sm:flex-none rounded-lg bg-white px-3 font-mono placeholder:font-sans text-[13px] text-tinta border border-black/[0.12] placeholder:text-black/40 transition-all focus:border-[#ff5a26] focus:outline-none focus:ring-1 focus:ring-[#ff5a26] dark:bg-white/[0.04] dark:text-[#f5f5f5] dark:border-white/15 dark:placeholder:text-[#a0a0a0]/60 dark:focus:border-[#ff5a26]" />
            </span>

            {/* Anonim menyembunyikan kolom nama, bukan meredupkannya: kolom mati
                yang tetap terpampang cuma mengundang orang mengetik ke dalamnya. */}
            {/* Nama + anonim satu kelompok: di ponsel mereka turun ke baris
                kedua bersama-sama, bukan nama terpotong di ujung baris lokasi
                dan saklarnya terdampar sendirian di baris ketiga. */}
            <span className="flex basis-full items-center gap-3 sm:basis-0 sm:flex-1">
            {!anonim && (
              <>
                <label className="sr-only" htmlFor="lk-nama">{t.namaPh}</label>
                <input id="lk-nama" name="nama" maxLength={100} autoComplete="name"
                       value={nama} onChange={(e) => setNama(e.target.value)} placeholder={t.namaPh}
                       className="lk-isian h-9 min-w-0 flex-1 rounded-lg bg-white px-3.5 text-[13px] text-tinta border border-black/[0.12] placeholder:text-black/40 transition-all focus:border-[#ff5a26] focus:outline-none focus:ring-1 focus:ring-[#ff5a26] dark:bg-white/[0.04] dark:text-[#f5f5f5] dark:border-white/15 dark:placeholder:text-[#a0a0a0]/60 dark:focus:border-[#ff5a26]" />
              </>
            )}

            <label className="lk-anonim ml-auto flex cursor-pointer items-center gap-2 text-[13px] whitespace-nowrap text-black/60 dark:text-[#a0a0a0]">
              <Switch
                name="anonim"
                value="1"
                checked={anonim}
                onCheckedChange={setAnonim}
                size="sm"
                aksen="bara"
              />
              <span>{t.anonim}</span>
            </label>
            </span>
          </div>


          {/* Pratinjau di bawah baris lokasi+nama: kotak mengikuti ukuran
              gambar (kecil, utuh) berderet rapat ala X (flex-wrap). */}
          {berkas.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-4">
              {berkas.map((b) => {
                const kunci = kunciBerkas(b);
                const url = pratinjau[kunci];
                return (
                  <li key={kunci} className="min-w-0">
                    <span className="relative inline-block min-w-0">
                      <button type="button"
                              onClick={() => hapusBerkas(kunci, url)}
                              aria-label={`${b.name}`}
                              className="absolute -top-2.5 -right-2.5 z-[3] grid size-7 cursor-pointer place-items-center rounded-full
                                         bg-neutral-800 text-white ring-1 ring-black/20 dark:bg-[#1e1e1e] dark:ring-white/20 transition-colors hover:bg-[#e60012]">
                        <svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor" className="size-3.5">
                          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                        </svg>
                      </button>
                      {url && b.type.startsWith("video/") ? (
                        <video src={`${url}#t=0.5`} preload="metadata" muted playsInline
                               className="h-14 w-auto min-w-14 max-w-full rounded-xl bg-black/5 object-contain ring-1 ring-black/10 dark:bg-black dark:ring-white/15" />
                      ) : url ? (
                        /* eslint-disable-next-line @next/next/no-img-element -- pratinjau blob lokal */
                        <img src={url} alt="" className="h-14 w-auto max-w-full rounded-xl bg-black/5 object-contain ring-1 ring-black/10 dark:bg-black dark:ring-white/15" />
                      ) : (
                        <span className="flex h-14 items-center justify-center rounded-xl bg-black/[0.04] px-3 text-[11px] text-black/60 ring-1 ring-black/10 dark:bg-white/5 dark:text-[#a0a0a0] dark:ring-white/15">
                          {b.type.startsWith("video/") ? "Video" : "Foto"}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-3 flex items-center gap-1 border-t border-black/[0.08] dark:border-white/10 pt-2">
            <button type="button" title={t.lampirFoto} aria-label={t.lampirFoto}
                    onClick={() => berkasRef.current?.click()} className={ikonAksi}>
              <IkonFoto />
            </button>
            <button type="button" title={t.lampirVideo} aria-label={t.lampirVideo}
                    onClick={() => berkasRef.current?.click()} className={ikonAksi}>
              <IkonVideo />
            </button>
            {/* Syarat wajibnya berdiri di sebelah tombolnya, bukan muncul
                sebagai galat setelah tombol Kirim ditekan. Di ponsel ia
                disembunyikan, bukan dipotong: baris ini sudah penuh oleh dua
                ikon + Batal + Kirim, dan "Foto/vid…" bukan keterangan. */}
            <span className="lk-isian hidden min-w-0 truncate pl-1 text-[12px] whitespace-nowrap text-black/60 dark:text-[#a0a0a0] sm:inline">
              {berkas.length > 0 ? `${berkas.length}/${BATAS_BERKAS}` : t.wajibMedia}
            </span>
            <button type="button" onClick={() => setBuka(false)}
                    className="lk-batal ml-auto h-9 cursor-pointer rounded-full px-3.5 text-[14px] text-black/60 transition hover:bg-black/[0.05] hover:text-black dark:text-[#a0a0a0] dark:hover:bg-white/10 dark:hover:text-white
                               focus-visible:outline-2 focus-visible:outline-[#ff5a26]">
              {t.batal}
            </button>
            <button
              type="submit"
              disabled={mengirim || menungguToken}
              aria-busy={mengirim || menungguToken}
              /* Redup selama syaratnya belum lengkap — isyarat, bukan kunci:
                 tombolnya tetap bisa ditekan supaya galat di atas bisa
                 menyebut apa yang kurang. */
              className={`lk-kirim h-9 cursor-pointer rounded-full bg-black text-white dark:bg-[#e7e9ea] dark:text-black px-5 text-[15px] font-semibold transition
                         hover:opacity-90 dark:hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5a26]
                         disabled:opacity-60 disabled:cursor-not-allowed ${
                           judul.trim() && deskripsi.trim() && berkas.length > 0 ? "" : "opacity-45"
                         }`}
            >
              {mengirim ? t.mengirim : menungguToken ? t.memverifikasi : t.kirim}
            </button>
          </div>
        </form>
      )}

      {/* Input berkas untuk mode menciut — tambahBerkas() membuka komposernya. */}
      {!buka && (
        <input ref={berkasRef} type="file" name="berkas" multiple accept={DITERIMA}
               aria-label={t.lampirFoto}
               onChange={(e) => tambahBerkas(e.target.files)} className="sr-only" tabIndex={-1} />
      )}
    </div>
  );
}

/** Tab gagang pelipat rel kiri — padanan TabRel di halaman index, ditulis
 *  lokal karena di sana ia fungsi internal yang tidak diekspor. Satu bedanya:
 *  index mewarnainya menurut lapisan peta aktif (ungu asap / hijau windy),
 *  halaman ini tak punya pengalih lapisan jadi ia memakai aksen halamannya
 *  sendiri. Keyframe apungnya dipakai bersama — sudah ada di app/globals.css.
 *
 *  Posisi `left` sengaja dua nilai panjang yang konkret, bukan calc berisi
    var: custom property tidak diinterpolasi, jadi tombolnya akan melompat
    sementara kolomnya beranimasi. */
function TabRelKiri({ terbuka, onUbah, label }: {
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

/** Satu saran lokasi dari pencarian wilayah BMKG/Kemendagri. */
export type SaranLokasi = {
  id: string;
  nama: string;
  provinsi: string;
  lat: number;
  lng: number;
  adm4?: string;
  tipe?: string;
};

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
    fetch("/api/umpan")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: unknown) => {
        if (dimuatUntuk.current === beritaAwal && Array.isArray(d)) setBerita(d as Berita[]);
      })
      .catch(() => {
        // Boleh dicoba lagi pada interaksi berikutnya.
        if (dimuatUntuk.current === beritaAwal) dimuatUntuk.current = null;
      });
  }, [beritaAwal, totalBerita]);
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
    ...PULAU_TAB.map((tab) => ({
      kunci: tab.kunci,
      label: tab.label,
      jumlah: sebelumWilayah.filter((l) => !!l.pulau && (tab.isi as readonly string[]).includes(l.pulau)).length,
    })),
  ], [sebelumWilayah, t.semuaWilayah]);
  const hasil = useMemo(() => {
    const tab = PULAU_TAB.find((x) => x.kunci === wilayahUmpan);
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
