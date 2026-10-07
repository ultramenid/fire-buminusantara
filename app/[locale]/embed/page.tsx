import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { hitungLaporanProvinsi } from "@/lib/events";
import { BAHASA, adaBahasa } from "@/lib/bahasa";
import { PetaSemat } from "./peta-semat";

/**
 * Peta sematan untuk situs lain:
 *   <iframe src="https://fire.nusantara.earth/id/embed" width="100%" height="720"
 *           style="border:0" loading="lazy" allowfullscreen></iframe>
 * Header frame-ancestors-nya dilonggarkan di next.config.ts.
 */
type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return BAHASA.map((locale) => ({ locale }));
}

// Angka provinsi dibaca per permintaan (pola /karhutla).
export const instant = false;

export const metadata: Metadata = { robots: { index: false } };

export default async function HalamanSemat({ params }: Props) {
  const { locale } = await params;
  if (!adaBahasa(locale)) notFound();
  await connection();
  const jumlahLaporan = await hitungLaporanProvinsi();
  return (
    <div className="fixed inset-0 bg-white dark:bg-[#0a0a0a]">
      <PetaSemat bahasa={locale} jumlahLaporan={jumlahLaporan} />
    </div>
  );
}
