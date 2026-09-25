import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const NAMA_COOKIE = "fire_sesi";
const UMUR = 60 * 60 * 8; // 8 jam

function kunci() {
  const rahasia = process.env.SESSION_SECRET;
  if (!rahasia) throw new Error("SESSION_SECRET belum disetel di .env");
  return new TextEncoder().encode(rahasia);
}

export type Sesi = { id: number; nama: string; peran: string };

/**
 * Sesi CMS, disimpan sebagai JWT bertanda tangan di cookie httpOnly.
 *
 * Tidak memakai tabel sessions milik Laravel: formatnya khas Laravel
 * (terenkripsi dengan APP_KEY, diserialisasi PHP), dan ikut membacanya berarti
 * mengikat /fire pada rincian internal framework lain. Yang dipakai bersama
 * cukup tabel users — jadi akun dan kata sandinya tetap satu.
 */
export async function buatSesi(sesi: Sesi) {
  const token = await new SignJWT({ ...sesi })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${UMUR}s`)
    .sign(kunci());

  (await cookies()).set(NAMA_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: UMUR,
  });
}

export async function bacaSesi(): Promise<Sesi | null> {
  const token = (await cookies()).get(NAMA_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, kunci());
    return { id: Number(payload.id), nama: String(payload.nama), peran: String(payload.peran) };
  } catch {
    return null; // kedaluwarsa atau tanda tangannya tidak cocok
  }
}

export async function hapusSesi() {
  (await cookies()).delete({ name: NAMA_COOKIE, path: "/" });
}

/** Peran yang boleh mengelola kejadian — sama dengan role:admin,editor di
 *  routes/web.php Laravel. */
export function bolehKelola(peran: string): boolean {
  return peran === "admin" || peran === "editor";
}

/**
 * Memastikan pengguna memiliki sesi yang sah dan peran yang berwenang (admin/editor).
 * Mengembalikan objek Sesi jika sah, atau null jika tidak berwenang.
 */
export async function pastikanBolehKelola(): Promise<Sesi | null> {
  const sesi = await bacaSesi();
  if (!sesi || !bolehKelola(sesi.peran)) return null;
  return sesi;
}

/**
 * Memastikan pengguna memiliki sesi yang sah dan peran yang berwenang (admin/editor).
 * Mengalihkan ke /admin/login jika belum masuk, atau ke /admin/kejadian jika peran tidak mencukupi peranKhusus.
 */
export async function wajibSesi(peranKhusus?: "admin"): Promise<Sesi> {
  const sesi = await bacaSesi();
  if (!sesi || !bolehKelola(sesi.peran)) redirect("/admin/login");
  if (peranKhusus && sesi.peran !== peranKhusus) redirect("/admin/kejadian");
  return sesi;
}

