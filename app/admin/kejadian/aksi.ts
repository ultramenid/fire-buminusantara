"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { wajibSesi } from "@/lib/sesi";
import { prisma } from "@/lib/prisma";
import { simpanKejadian } from "@/lib/simpan-kejadian";

/** Alih keadaan tayang satu kejadian, langsung dari daftar (tanpa buka form).
 *  Dua arah, bisa bolak-balik: menurunkan yang tayang tidak menghapus apa pun. */
export async function aksiTayang(id: number, status: "draft" | "published") {
  await wajibSesi();

  await prisma.events.update({ where: { id }, data: { status, updated_at: new Date() } });
  // Pratinjau bagikan + daftar publik di-cache: tanpa ini kejadian yang
  // diturunkan masih tampil sampai cache kedaluwarsa sendiri.
  try {
    updateTag("kejadian");
  } catch {}
  return { ok: true as const };
}

/** Simpan kejadian baru dari form penambahan. */
export async function aksiTambahKejadian(data: FormData) {
  await wajibSesi();

  const hasil = await simpanKejadian(data);
  if (!hasil.ok) redirect(`/admin/kejadian/baru?galat=${encodeURIComponent(hasil.galat)}`);
  // Metadata slug di halaman publik di-cache; tanpa ini pratinjau bagikan
  // kejadian baru bisa basi sampai cache-nya kedaluwarsa sendiri.
  try {
    updateTag("kejadian");
  } catch {}
  redirect("/admin/kejadian");
}

/** Simpan perubahan kejadian dari form penyuntingan. */
export async function aksiUbahKejadian(id: number, data: FormData) {
  await wajibSesi();

  const hasil = await simpanKejadian(data, id);
  if (!hasil.ok) redirect(`/admin/kejadian/${id}?galat=${encodeURIComponent(hasil.galat)}`);
  try {
    updateTag("kejadian");
  } catch {}
  redirect("/admin/kejadian");
}

/** Hapus permanen kejadian beserta relasinya (hanya untuk peran admin). */
export async function aksiHapusKejadian(id: number) {
  const s = await wajibSesi();
  // Menghapus hanya untuk admin — editor boleh menulis, tidak membuang.
  if (s.peran !== "admin") redirect("/admin/kejadian");
  await prisma.events.delete({ where: { id } });
  try {
    updateTag("kejadian");
  } catch {}
  redirect("/admin/kejadian");
}
