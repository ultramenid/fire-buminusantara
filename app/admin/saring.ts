import { cookies } from "next/headers.js";

/**
 * Saringan daftar per bagian, disimpan di cookie `cms-saring-<bagian>`.
 *
 * Daftar hidup di layout bagiannya (supaya tidak dirender ulang saat pindah
 * rincian), dan layout tidak bisa membaca searchParams — cookie bisa. Klien
 * menulisnya (ruang-klien.tsx → tulisSaring) lalu router.refresh().
 *
 * Isinya datang dari peramban: hanya string, dipangkas, kunci tak dikenal
 * diabaikan oleh pemanggil.
 */
export type Saring = Record<string, string>;

export async function bacaSaring(bagian: string): Promise<Saring> {
  const mentah = (await cookies()).get(`cms-saring-${bagian}`)?.value;
  if (!mentah) return {};
  for (const teks of [mentah, safeDecode(mentah)]) {
    try {
      const o: unknown = JSON.parse(teks);
      if (!o || typeof o !== "object") return {};
      return Object.fromEntries(
        Object.entries(o).filter(([, v]) => typeof v === "string").map(([k, v]) => [k, (v as string).slice(0, 120)]),
      );
    } catch {}
  }
  return {};
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Halaman 1-basis dari saringan, dijepit ke jangkauan yang ada. */
export function halamanDari(saring: Saring, total: number, per: number) {
  const terakhir = Math.max(1, Math.ceil(total / per));
  return Math.min(terakhir, Math.max(1, parseInt(saring.halaman ?? "1", 10) || 1));
}

/** Urutan tabel dari saringan ("kolom" / "-kolom"), hanya kolom yang diizinkan. */
export function urutDari<K extends string>(saring: Saring, izin: readonly K[], bawaan: NoInfer<`${"-" | ""}${K}`>) {
  const nilai = saring.urut && izin.includes(saring.urut.replace(/^-/, "") as K) ? saring.urut : bawaan;
  return { kolom: nilai.replace(/^-/, "") as K, arah: (nilai.startsWith("-") ? "desc" : "asc") as "asc" | "desc" };
}
