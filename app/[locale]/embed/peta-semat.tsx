"use client";

import { Peta } from "@/components/peta";
import type { Bahasa } from "@/lib/bahasa";

/** Peta di dalam iframe situs lain: tombol bentang dan klik provinsi
 *  membuka situs Fire di tab baru, bukan overlay di dalam bingkai sempit. */
export function PetaSemat({ bahasa, jumlahLaporan }: { bahasa: Bahasa; jumlahLaporan: Record<string, number> }) {
  const buka = () => window.open(`/${bahasa}`, "_blank", "noopener");
  return (
    <Peta
      jumlahLaporan={jumlahLaporan}
      onPilihWilayah={buka}
      legendaRingkas
      tombolRapat
      muatNusantara
      onExpand={buka}
      expandLabel={bahasa === "en" ? "Open on Fire" : "Buka di Fire"}
    />
  );
}
