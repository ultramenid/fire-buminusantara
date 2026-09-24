import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ambilUmpan, hitungLaporanProvinsi, UMPAN_AWAL } from "@/lib/events";
import { ambilSorotan } from "@/lib/statistik-sorotan";
import { ambilKolomUmpanAwal } from "@/lib/perangkat";
import { LandingKarhutla } from "@/components/landing-karhutla";
import { BAHASA, adaBahasa, type Bahasa } from "@/lib/bahasa";

type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return BAHASA.map((locale) => ({ locale }));
}

// Cangkang statis; komponennya interaktif di klien (pencarian umpan).
export const instant = false;

const TEKS_META: Record<Bahasa, { judul: string; deskripsi: string; ogLocale: string }> = {
  id: {
    judul: "Kebakaran Hutan dan Lahan — Lapor Karhutla",
    deskripsi:
      "Pantau situasi karhutla — hotspot, api aktif, lahan terbakar — dan laporkan apa yang kamu lihat.",
    ogLocale: "id_ID",
  },
  en: {
    judul: "Forest and Land Fires — Lapor Karhutla",
    deskripsi:
      "Track the wildfire situation — hotspots, active fires, burned land — and report what you see.",
    ogLocale: "en_US",
  },
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const bahasa: Bahasa = adaBahasa(locale) ? locale : "id";
  const teks = TEKS_META[bahasa];
  return {
    title: teks.judul,
    description: teks.deskripsi,
    alternates: {
      canonical: `/${bahasa}/karhutla`,
      languages: { id: "/id/karhutla", en: "/en/karhutla", "x-default": "/id/karhutla" },
    },
    other: {
      "content-language": bahasa,
    },
    openGraph: {
      title: teks.judul,
      description: teks.deskripsi,
      url: `/${bahasa}/karhutla`,
      siteName: "Fire",
      locale: teks.ogLocale,
      type: "website",
      images: [{ url: "/assets/img/og-fire.jpg", width: 1200, height: 630, alt: "Fire" }],
    },
    twitter: {
      card: "summary_large_image",
      title: teks.judul,
      description: teks.deskripsi,
      images: ["/assets/img/og-fire.jpg"],
    },
  };
}

export default async function HalamanKarhutla({ params }: Props) {
  const { locale } = await params;
  if (!adaBahasa(locale)) notFound();

  // Umpan kanan memakai SELURUH kejadian tayang (tanpa batas 10) — sama
  // seperti arsip di halaman index — supaya semua laporan tampil, bukan
  // hanya yang terbaru. Pembacaannya di-cache bertag (dibatalkan CMS);
  // connection() menjaga angkanya tidak terbekukan ke cangkang build. HTML
  // hanya membawa UMPAN_AWAL kartu — sisanya diambil klien dari /api/umpan.
  await connection();
  const [jumlahLaporan, berita, sorotan, kolomAwal] = await Promise.all([
    hitungLaporanProvinsi(),
    ambilUmpan(locale),
    ambilSorotan(),
    ambilKolomUmpanAwal(),
  ]);

  return (
    <div className="min-h-dvh bg-white text-tinta dark:bg-[#0a0a0a] dark:text-[#f5f5f5] transition-colors duration-200">
      <LandingKarhutla
        bahasa={locale}
        jumlahLaporan={jumlahLaporan}
        berita={berita.slice(0, UMPAN_AWAL)}
        totalBerita={berita.length}
        sorotan={sorotan}
        kolomAwal={kolomAwal}
      />
    </div>
  );
}
