"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { buatSesi, wajibSesi } from "@/lib/sesi";
import { catatGalat } from "@/lib/catat-galat";

export type IsianPengguna = { nama: string; email: string; peran: string };
export type KeadaanPengguna = { ok?: undefined; galat: string; isian: IsianPengguna } | { ok: true; id: number } | null;

const PERAN = ["admin", "editor", "commenter"] as const;
type Peran = (typeof PERAN)[number];

const bentrokUnik = (e: unknown) => (e as { code?: unknown } | null)?.code === "P2002";
// P2003: baris lain (mis. tabel Laravel yang tak dikenal skema ini) masih
// menunjuk akun ini lewat foreign key RESTRICT.
const masihDirujuk = (e: unknown) => (e as { code?: unknown } | null)?.code === "P2003";

/** Admin terakhir tidak boleh hilang — tanpa dia tak ada yang bisa mengelola akun. */
async function adminLainAda(kecuali: number) {
  return (await prisma.users.count({ where: { role: "admin", id: { not: kecuali } } })) > 0;
}

function baca(data: FormData) {
  return {
    nama: String(data.get("nama") ?? "").trim(),
    email: String(data.get("email") ?? "").trim().toLowerCase(),
    peran: String(data.get("peran") ?? ""),
    sandi: String(data.get("sandi") ?? ""),
    konfirmasi: String(data.get("konfirmasi") ?? ""),
  };
}

function periksaSandi(sandi: string, konfirmasi: string, wajib: boolean): string | null {
  if (!sandi && !wajib) return null;
  if (sandi.length < 8) return "Kata sandi minimal 8 karakter.";
  if (sandi !== konfirmasi) return "Konfirmasi kata sandi tidak cocok.";
  return null;
}

/** Tambah (id kosong) atau ubah akun. Sandi kosong saat mengubah = tetap. */
export async function aksiSimpanPengguna(
  id: number | null,
  _sebelum: KeadaanPengguna,
  data: FormData,
): Promise<KeadaanPengguna> {
  const sesi = await wajibSesi("admin");
  const v = baca(data);
  const isian = { nama: v.nama, email: v.email, peran: v.peran };
  const gagal = (galat: string) => ({ galat, isian });

  if (!v.nama || !v.email) return gagal("Nama dan email wajib diisi.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return gagal("Format email tidak sah.");
  if (!PERAN.includes(v.peran as Peran)) return gagal("Pilih peran.");
  const galatSandi = periksaSandi(v.sandi, v.konfirmasi, id === null);
  if (galatSandi) return gagal(galatSandi);

  if (id !== null) {
    if (id === sesi.id && v.peran !== sesi.peran) {
      return gagal("Peran akun Anda sendiri tidak bisa diubah dari sini — minta admin lain.");
    }
    const lama = await prisma.users.findUnique({ where: { id }, select: { role: true } });
    if (!lama) return gagal("Akun ini sudah tidak ada.");
    if (lama.role === "admin" && v.peran !== "admin" && !(await adminLainAda(id))) {
      return gagal("Ini admin terakhir. Jadikan akun lain admin dulu.");
    }
  }

  const kini = new Date();
  // Hash bcryptjs langsung terbaca pengecek bcrypt Laravel — akun yang sama
  // tetap bisa masuk ke situs utama.
  const password = v.sandi ? await bcrypt.hash(v.sandi, 10) : undefined;

  try {
    if (id === null) {
      const dibuat = await prisma.users.create({
        data: {
          name: v.nama, email: v.email, role: v.peran as Peran, password,
          // Dibuat admin, bukan mendaftar sendiri — langsung terverifikasi.
          email_verified_at: kini, created_at: kini, updated_at: kini,
        },
        select: { id: true },
      });
      id = Number(dibuat.id);
      return { ok: true, id };
    } else {
      await prisma.users.update({
        where: { id },
        data: { name: v.nama, email: v.email, role: v.peran as Peran, updated_at: kini, ...(password && { password }) },
        select: { id: true },
      });
    }
  } catch (e) {
    if (bentrokUnik(e)) return gagal("Email itu sudah dipakai akun lain.");
    catatGalat("Simpan pengguna GAGAL", e, `id=${id ?? "baru"}`);
    return gagal("Gagal menyimpan. Coba lagi.");
  }

  // Sandi sendiri diganti: sidik sandi di token lama tidak cocok lagi, jadi
  // terbitkan token baru — kalau tidak, admin langsung terlempar ke login.
  if (id === sesi.id && password) await buatSesi({ id, nama: v.nama, peran: v.peran });

  return { ok: true, id };
}

export type HasilAksi = { ok: true } | { ok: false; galat: string };

/** Hapus akun dari tabel users bersama — akun Pasopati-nya ikut hilang. */
export async function aksiHapusPengguna(id: number): Promise<HasilAksi> {
  const sesi = await wajibSesi("admin");
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, galat: "Akun tidak sah." };
  if (id === sesi.id) return { ok: false, galat: "Akun Anda sendiri tidak bisa dihapus." };

  const akun = await prisma.users.findUnique({ where: { id }, select: { role: true } });
  if (!akun) return { ok: true }; // sudah tidak ada — hasil yang diminta tercapai
  if (akun.role === "admin" && !(await adminLainAda(id))) {
    return { ok: false, galat: "Ini admin terakhir dan tidak bisa dihapus." };
  }

  try {
    // Komentar, reaksi, dan tinjauan laporannya tetap ada (FK SET NULL).
    await prisma.users.delete({ where: { id }, select: { id: true } });
  } catch (e) {
    if (masihDirujuk(e)) {
      return { ok: false, galat: "Akun ini masih dipakai data lain. Cabut aksesnya dengan peran Commenter." };
    }
    catatGalat("Hapus pengguna GAGAL", e, `id=${id}`);
    return { ok: false, galat: "Gagal menghapus. Coba lagi." };
  }
  return { ok: true };
}
