"use server";

import { catatGalat } from "@/lib/catat-galat";
import { wajibSesi } from "@/lib/sesi";
import { putuskanVerifikasi } from "@/lib/verifikasi-ktp";

import type { HasilAksi } from "../use-aksi";

/** Server action terbuka lewat POST langsung — sesi diperiksa di setiap aksi,
 *  dan argumennya datang mentah, bukan dari tipe TypeScript. */
const TIDAK_SAH = { ok: false as const, galat: "Permintaan tidak sah." };
const idDari = (id: unknown) => (typeof id === "string" && /^\d{1,18}$/.test(id) ? BigInt(id) : null);
const GAGAL = { ok: false as const, galat: "Gagal menyimpan. Coba lagi." };

/** Setujui pengajuan: akun boleh siaran langsung publik. Foto & NIK polos dihapus. */
export async function aksiSetujuiKtp(id: string): Promise<HasilAksi> {
  const sesi = await wajibSesi();
  const n = idDari(id);
  if (n === null) return TIDAK_SAH;
  try {
    return await putuskanVerifikasi(n, { setuju: true, metode: "petugas", peninjauId: BigInt(sesi.id) });
  } catch (e) {
    await catatGalat("Setujui verifikasi KTP GAGAL", e, `id=${id}`);
    return GAGAL;
  }
}

/** Tolak pengajuan dengan alasan (wajib, dibaca warga di aplikasi). Foto & NIK polos dihapus. */
export async function aksiTolakKtp(id: string, alasan: string): Promise<HasilAksi> {
  const sesi = await wajibSesi();
  const n = idDari(id);
  if (n === null || typeof alasan !== "string") return TIDAK_SAH;
  try {
    return await putuskanVerifikasi(n, { setuju: false, alasan, peninjauId: BigInt(sesi.id) });
  } catch (e) {
    await catatGalat("Tolak verifikasi KTP GAGAL", e, `id=${id}`);
    return GAGAL;
  }
}
