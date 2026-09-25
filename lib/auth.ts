import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { Sesi } from "./sesi";

/**
 * Hash acuan untuk mencegah timing attack (user enumeration).
 * Waktu komputasi compare tetap sama apakah user/password ada atau tidak.
 */
const DUMMY_HASH = "$2b$10$raZZcYBlcUZi6wIgvywJKuQdE/bK/7Lzs/Ue1exWpUrRUr/pqLfxi";

/**
 * Peran yang boleh mengelola CMS (admin atau editor).
 */
export function bolehKelola(peran: string): boolean {
  return peran === "admin" || peran === "editor";
}

/**
 * Masuk memakai akun Pasopati yang sudah ada.
 *
 * Kata sandinya bcrypt buatan Laravel, yang menulis awalan `$2y$`. Sebagian
 * pustaka bcrypt hanya mengenali `$2a$`/`$2b$` dan menolaknya, tetapi bcryptjs
 * membacanya apa adanya — sudah diuji terhadap hash gaya Laravel, jadi tidak
 * ada penukaran awalan di sini.
 */
export async function masuk(email: string, sandi: string): Promise<Sesi | null> {
  const user = await prisma.users.findUnique({
    where: { email },
    select: { id: true, name: true, role: true, password: true },
  });

  // Lindungi dari serangan pencacahan pengguna berbasis waktu (timing attack).
  // Akun Google murni juga tidak punya kata sandi.
  if (!user || !user.password) {
    await bcrypt.compare(sandi, DUMMY_HASH);
    return null;
  }

  if (!(await bcrypt.compare(sandi, user.password))) return null;

  // Peran diperiksa saat masuk, bukan cuma saat membuka halaman: tidak ada
  // gunanya memberi sesi kepada akun yang tidak boleh mengelola apa pun.
  if (!bolehKelola(user.role)) return null;

  return { id: Number(user.id), nama: user.name, peran: user.role };
}

