"use server";

import { headers, cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { bolehKelola, buatSesi, pastikanBolehKelola } from "@/lib/sesi";
import { ipDari } from "@/lib/turnstile";
import { lewatBatas } from "@/lib/batas-laju";
import { catatGalat } from "@/lib/catat-galat";

/**
 * Masuk dengan sidik jari / wajah (WebAuthn passkey).
 *
 * Biometriknya diperiksa perangkat, bukan server: perangkat menandatangani
 * tantangan acak dengan kunci privat yang tak pernah keluar darinya, server
 * memeriksa tanda tangan itu dengan kunci publik di tabel passkeys. Setelah
 * lolos, sesinya sama persis dengan masuk pakai sandi (buatSesi).
 */

type Gagal = { ok: false; galat: string };
type Hasil = { ok: true } | Gagal;

/** Passkey terikat pada domain: passkey buatan staging tidak berlaku di
 *  produksi. WEBAUTHN_ORIGIN untuk pengembangan (http://localhost:3000). */
function pihak() {
  const asal = new URL(process.env.WEBAUTHN_ORIGIN || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").origin;
  return { asal, rpID: new URL(asal).hostname };
}

// Tantangan disimpan di cookie httpOnly bertanda tangan, berumur 5 menit dan
// sekali pakai — tidak perlu tabel atau Redis untuk nilai sependek ini.
const COOKIE_TANTANGAN = "fire_tantangan";
type Tantangan = { c: string; untuk: "daftar" | "masuk"; uid?: number };

function kunci() {
  const rahasia = process.env.SESSION_SECRET;
  if (!rahasia) throw new Error("SESSION_SECRET belum disetel di .env");
  return new TextEncoder().encode(rahasia);
}

async function simpanTantangan(t: Tantangan) {
  const token = await new SignJWT(t).setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m").sign(kunci());
  (await cookies()).set(COOKIE_TANTANGAN, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: 300,
  });
}

async function ambilTantangan(untuk: Tantangan["untuk"]): Promise<Tantangan | null> {
  const toko = await cookies();
  const token = toko.get(COOKIE_TANTANGAN)?.value;
  toko.delete({ name: COOKIE_TANTANGAN, path: "/admin" });
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<Tantangan>(token, kunci());
    return payload.untuk === untuk ? payload : null;
  } catch {
    return null;
  }
}

// ── Masuk ───────────────────────────────────────────────────────────────────

export async function opsiMasukPasskey(): Promise<{ ok: true; opsi: PublicKeyCredentialRequestOptionsJSON } | Gagal> {
  // Tanpa allowCredentials: perangkat sendiri yang menawarkan passkey mana yang
  // ada, jadi pengguna tidak perlu mengetik email lebih dulu.
  const opsi = await generateAuthenticationOptions({ rpID: pihak().rpID, userVerification: "required" });
  await simpanTantangan({ c: opsi.challenge, untuk: "masuk" });
  return { ok: true, opsi };
}

const GAGAL_MASUK: Gagal = { ok: false, galat: "Passkey tidak dikenali atau akun tidak berhak masuk." };

export async function masukPasskey(respons: AuthenticationResponseJSON): Promise<Hasil> {
  const ip = ipDari(new Request("http://lokal", { headers: await headers() }));
  if (ip && (await lewatBatas(`masuk:ip:${ip}`, 10, 900))) {
    return { ok: false, galat: "Terlalu banyak percobaan masuk. Tunggu 15 menit lalu coba lagi." };
  }

  const tantangan = await ambilTantangan("masuk");
  if (!tantangan) return { ok: false, galat: "Waktu verifikasi habis. Coba lagi." };

  const pk = await prisma.passkeys.findUnique({
    where: { id: String(respons?.id ?? "") },
    include: { users: { select: { id: true, name: true, role: true } } },
  });
  if (!pk) return GAGAL_MASUK;

  const { asal, rpID } = pihak();
  let hasil;
  try {
    hasil = await verifyAuthenticationResponse({
      response: respons,
      expectedChallenge: tantangan.c,
      expectedOrigin: asal,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: pk.id,
        publicKey: new Uint8Array(pk.public_key),
        counter: Number(pk.counter),
        transports: pk.transports?.split(",") as AuthenticatorTransportFuture[] | undefined,
      },
    });
  } catch {
    return GAGAL_MASUK;
  }
  // Peran diperiksa saat masuk, sama seperti masuk pakai sandi.
  if (!hasil.verified || !bolehKelola(pk.users.role)) return GAGAL_MASUK;

  await prisma.passkeys.update({
    where: { id: pk.id },
    data: { counter: hasil.authenticationInfo.newCounter, last_used_at: new Date() },
  });
  await buatSesi({ id: Number(pk.users.id), nama: pk.users.name, peran: pk.users.role });
  return { ok: true };
}

// ── Daftar & hapus (sudah masuk) ────────────────────────────────────────────

export async function opsiDaftarPasskey(): Promise<{ ok: true; opsi: PublicKeyCredentialCreationOptionsJSON } | Gagal> {
  const sesi = await pastikanBolehKelola();
  if (!sesi) return { ok: false, galat: "Sesi berakhir. Masuk lagi." };

  const user = await prisma.users.findUnique({
    where: { id: sesi.id },
    select: { email: true, name: true, passkeys: { select: { id: true, transports: true } } },
  });
  if (!user) return { ok: false, galat: "Akun tidak ditemukan." };

  const opsi = await generateRegistrationOptions({
    rpName: "Pasopati Fire",
    rpID: pihak().rpID,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(String(sesi.id)),
    // Perangkat yang sudah terdaftar tidak didaftarkan dua kali.
    excludeCredentials: user.passkeys.map((p) => ({
      id: p.id,
      transports: p.transports?.split(",") as AuthenticatorTransportFuture[] | undefined,
    })),
    // residentKey wajib: itulah yang memungkinkan masuk tanpa mengetik email.
    // userVerification wajib: sidik jari / wajah / PIN perangkat, bukan sekadar sentuh.
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  await simpanTantangan({ c: opsi.challenge, untuk: "daftar", uid: sesi.id });
  return { ok: true, opsi };
}

export async function simpanPasskey(respons: RegistrationResponseJSON): Promise<Hasil> {
  const sesi = await pastikanBolehKelola();
  if (!sesi) return { ok: false, galat: "Sesi berakhir. Masuk lagi." };

  const tantangan = await ambilTantangan("daftar");
  if (!tantangan || tantangan.uid !== sesi.id) return { ok: false, galat: "Waktu verifikasi habis. Coba lagi." };

  const { asal, rpID } = pihak();
  let hasil;
  try {
    hasil = await verifyRegistrationResponse({
      response: respons,
      expectedChallenge: tantangan.c,
      expectedOrigin: asal,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch {
    return { ok: false, galat: "Verifikasi perangkat gagal." };
  }
  if (!hasil.verified) return { ok: false, galat: "Verifikasi perangkat gagal." };

  const { credential } = hasil.registrationInfo;
  try {
    await prisma.passkeys.create({
      data: {
        id: credential.id,
        user_id: sesi.id,
        public_key: credential.publicKey,
        counter: credential.counter,
        transports: credential.transports?.join(",") || null,
      },
    });
  } catch (e) {
    if ((e as { code?: unknown } | null)?.code === "P2002") return { ok: false, galat: "Perangkat ini sudah terdaftar." };
    await catatGalat("simpan passkey", e);
    return { ok: false, galat: "Gagal menyimpan passkey." };
  }
  return { ok: true };
}

export async function hapusPasskey(id: string): Promise<Hasil> {
  const sesi = await pastikanBolehKelola();
  if (!sesi) return { ok: false, galat: "Sesi berakhir. Masuk lagi." };
  // user_id ikut di where: hanya passkey milik sendiri yang bisa dicabut.
  await prisma.passkeys.deleteMany({ where: { id: String(id), user_id: sesi.id } });
  return { ok: true };
}
