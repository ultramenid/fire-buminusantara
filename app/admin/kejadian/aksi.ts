"use server";

import { updateTag } from "next/cache";
import { wajibSesi } from "@/lib/sesi";
import { prisma } from "@/lib/prisma";
import { simpanKejadian, hapusKejadian } from "@/lib/simpan-kejadian";
import { catatGalat } from "@/lib/catat-galat";
import type { HasilAksi } from "../use-aksi";

/** Alih keadaan tayang satu kejadian, langsung dari daftar (tanpa buka form).
 *  Dua arah, bisa bolak-balik: menurunkan yang tayang tidak menghapus apa pun. */
export async function aksiTayang(id: number, status: "draft" | "published") {
  await wajibSesi();
  if (!Number.isSafeInteger(id) || (status !== "draft" && status !== "published")) {
    return { ok: false as const, galat: "Permintaan tidak sah." };
  }

  try {
    await prisma.events.update({ where: { id }, data: { status, updated_at: new Date() } });
  } catch (e) {
    // P2025 = baris sudah dihapus peninjau lain; selebihnya galat DB.
    await catatGalat("aksiTayang", e, `id=${id}`);
    return { ok: false as const, galat: "Keadaan tayang gagal diubah. Muat ulang halaman lalu coba lagi." };
  }
  // Pratinjau bagikan + daftar publik di-cache: tanpa ini kejadian yang
  // diturunkan masih tampil sampai cache kedaluwarsa sendiri.
  try {
    updateTag("kejadian");
  } catch {}
  return { ok: true as const };
}

/** Simpan kejadian baru. Hasilnya dikembalikan ke form: sukses → form
 *  membuka kejadian barunya di panel rincian; gagal → galat di bilah simpan. */
export async function aksiTambahKejadian(data: FormData) {
  await wajibSesi();

  const hasil = await simpanKejadian(data);
  if (!hasil.ok) return { ok: false as const, galat: hasil.galat };
  // Metadata slug di halaman publik di-cache; tanpa ini pratinjau bagikan
  // kejadian baru bisa basi sampai cache-nya kedaluwarsa sendiri.
  try {
    updateTag("kejadian");
  } catch {}
  return { ok: true as const, id: hasil.id };
}

/** Simpan perubahan — editor tetap di form yang sama (toast, bukan pindah halaman). */
export async function aksiUbahKejadian(id: number, data: FormData) {
  await wajibSesi();

  const hasil = await simpanKejadian(data, id);
  if (!hasil.ok) return { ok: false as const, galat: hasil.galat };
  try {
    updateTag("kejadian");
  } catch {}
  return { ok: true as const, id };
}

/** Hapus permanen kejadian beserta relasinya (hanya untuk peran admin). */
export async function aksiHapusKejadian(id: number): Promise<HasilAksi> {
  const s = await wajibSesi();
  // Menghapus hanya untuk admin — editor boleh menulis, tidak membuang.
  if (s.peran !== "admin") return { ok: false, galat: "Hanya admin yang bisa menghapus kejadian." };
  if (!Number.isSafeInteger(id)) return { ok: false, galat: "Permintaan tidak sah." };
  try {
    await hapusKejadian(id);
  } catch (e) {
    // P2025 (tekan ganda / sudah dihapus rekan) berakhir sama: barisnya tiada.
    if ((e as { code?: unknown })?.code !== "P2025") {
      await catatGalat("aksiHapusKejadian", e, `id=${id}`);
      return { ok: false, galat: "Kejadian gagal dihapus. Coba lagi." };
    }
  }
  try {
    updateTag("kejadian");
  } catch {}
  return { ok: true };
}
