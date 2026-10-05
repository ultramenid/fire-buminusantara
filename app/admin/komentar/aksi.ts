"use server";

import { updateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { wajibSesi } from "@/lib/sesi";
import { catatGalat } from "@/lib/catat-galat";
import { umumkanTunggakan } from "@/lib/loket-tunggakan";
import { aturPersetujuan, hapusKomentarModerasi } from "@/lib/moderasi-komentar";

import type { HasilAksi } from "../use-aksi";

/** Sama dengan batas form publik (api/laporan/[id]/komentar). */
const BATAS_ISI = 2000;

const idSah = (id: number) => Number.isSafeInteger(id) && id > 0;
// P2025: baris yang mau diubah sudah tidak ada (dihapus editor lain).
const sudahHilang = (e: unknown) => (e as { code?: unknown } | null)?.code === "P2025";

function segarkan() {
  // Tanpa ini angka tunggakan di menu hanya berubah setelah jendela cache
  // 15 detik; jumlah komentar tersetujui di umpan publik juga di-cache.
  try {
    updateTag("tunggakan");
    updateTag("komentar");
  } catch {}
  umumkanTunggakan();
}

async function jalankan(label: string, id: number, kerja: () => Promise<unknown>): Promise<HasilAksi> {
  if (!idSah(id)) return { ok: false, galat: "Komentar tidak sah." };
  try {
    await kerja();
  } catch (e) {
    if (sudahHilang(e)) return { ok: false, galat: "Komentar ini sudah dihapus. Muat ulang daftarnya." };
    catatGalat(label, e, `id=${id}`);
    return { ok: false, galat: "Gagal menyimpan. Coba lagi." };
  }
  segarkan();
  return { ok: true };
}

/** Setujui / sembunyikan. */
export async function aksiSetujui(id: number, disetujui: boolean): Promise<HasilAksi> {
  await wajibSesi();
  return jalankan("Moderasi komentar GAGAL", id, () => aturPersetujuan(id, disetujui === true));
}

/** Hapus komentar beserta balasan dan reaksinya — admin saja. */
export async function aksiHapus(id: number): Promise<HasilAksi> {
  const sesi = await wajibSesi();
  if (sesi.peran !== "admin") return { ok: false, galat: "Hanya admin yang bisa menghapus komentar." };
  return jalankan("Hapus komentar GAGAL", id, async () => {
    try {
      await hapusKomentarModerasi(id);
    } catch (e) {
      if (!sudahHilang(e)) throw e; // sudah terhapus = hasil yang diminta
    }
  });
}

/** Sunting isi — untuk menyamarkan data pribadi atau kata kasar, bukan
 *  menulis ulang pendapat orang. */
export async function aksiUbahIsi(id: number, isi: string): Promise<HasilAksi> {
  await wajibSesi();
  const bersih = String(isi ?? "").trim();
  if (!bersih) return { ok: false, galat: "Isi komentar tidak boleh kosong." };
  if (bersih.length > BATAS_ISI) return { ok: false, galat: `Maksimal ${BATAS_ISI} karakter.` };
  return jalankan("Sunting komentar GAGAL", id, () =>
    prisma.comments.update({ where: { id }, data: { body: bersih, updated_at: new Date() }, select: { id: true } }),
  );
}
