"use server";

import { updateTag } from "next/cache";
import { wajibSesi } from "@/lib/sesi";
import { simpanSorotan } from "@/lib/statistik-sorotan";

/** Server action terbuka lewat POST langsung — sesinya diperiksa di dalam. */
export async function aksiSimpanSorotan(data: FormData) {
  await wajibSesi();
  const hasil = await simpanSorotan(data);
  if (hasil.ok) {
    // ambilSorotan di-cache dengan tag ini (otomatis menginvalidasi halaman terkait).
    updateTag("sorotan");
  }
  return hasil;
}
