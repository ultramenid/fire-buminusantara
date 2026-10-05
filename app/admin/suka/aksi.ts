"use server";

import { updateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { wajibSesi } from "@/lib/sesi";
import { catatGalat } from "@/lib/catat-galat";
import type { HasilAksi } from "../use-aksi";

/** Hapus satu suka (spam/bot) atau satu reaksi komentar — admin saja.
 *  deleteMany: baris yang sudah hilang bukan galat, hasilnya sama. */
export async function aksiHapusTanggapan(jenis: "suka" | "reaksi", id: number): Promise<HasilAksi> {
  const sesi = await wajibSesi();
  if (sesi.peran !== "admin") return { ok: false, galat: "Hanya admin yang bisa menghapus." };
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, galat: "Baris tidak sah." };
  try {
    if (jenis === "suka") await prisma.event_likes.deleteMany({ where: { id } });
    else if (jenis === "reaksi") {
      await prisma.comment_reactions.deleteMany({ where: { id } });
      try { updateTag("reactions"); } catch {}
    } else return { ok: false, galat: "Jenis tidak sah." };
  } catch (e) {
    catatGalat("Hapus tanggapan GAGAL", e, `${jenis} id=${id}`);
    return { ok: false, galat: "Gagal menghapus. Coba lagi." };
  }
  return { ok: true };
}
