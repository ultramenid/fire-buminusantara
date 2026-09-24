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
      canonical: `/${bahasa}`,
      languages: { id: "/id", en: "/en", "x-default": "/id" },
    },
    other: {
      "content-language": bahasa,
    },
    openGraph: {
      title: teks.judul,
      description: teks.deskripsi,
      url: `/${bahasa}`,
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

export default async function Halaman({ params }: Props) {
  const { locale } = await params;
  if (!adaBahasa(locale)) notFound();

  await connection();
  const [jumlahLaporan, berita, sorotan, kolomAwal] = await Promise.all([
    hitungLaporanProvinsi(),
    ambilUmpan(locale),
    ambilSorotan(),
    ambilKolomUmpanAwal(),
  ]);

  return (
    <LandingKarhutla
      bahasa={locale}
      jumlahLaporan={jumlahLaporan}
      berita={berita.slice(0, UMPAN_AWAL)}
      totalBerita={berita.length}
      sorotan={sorotan}
      kolomAwal={kolomAwal}
    />
  );
}
