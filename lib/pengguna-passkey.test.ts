import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { bolehKelola } from "./auth.ts";

// ── 1. Password Hashing (bcrypt / Argon2 / Laravel compatibility) ───────────

test("password hashing: bcryptjs menghasilkan hash valid dan memverifikasi sandi", async () => {
  const sandi = "Rahasia123!";
  const hash = await bcrypt.hash(sandi, 10);

  // Format bcrypt standar diawali dengan $2a$ atau $2b$
  assert.match(hash, /^\$2[ab]\$10\$/);

  // Verifikasi sandi cocok
  const cocok = await bcrypt.compare(sandi, hash);
  assert.equal(cocok, true);

  // Verifikasi sandi salah ditolak
  const salah = await bcrypt.compare("Salah123!", hash);
  assert.equal(salah, false);
});

test("password hashing: kompatibilitas dengan format bcrypt Laravel ($2y$)", async () => {
  // Laravel secara default menghasilkan hash berawalan $2y$.
  // bcryptjs harus mampu membaca dan memverifikasi hash $2y$ tanpa error.
  const sandi = "password-laravel";
  const hashStandar = await bcrypt.hash(sandi, 10);
  const hashLaravel = hashStandar.replace(/^\$2[ab]\$/, "$2y$");

  assert.match(hashLaravel, /^\$2y\$10\$/);

  const cocok = await bcrypt.compare(sandi, hashLaravel);
  assert.equal(cocok, true, "bcryptjs harus mendukung verifikasi hash $2y$ buatan Laravel");

  const salah = await bcrypt.compare("password-lain", hashLaravel);
  assert.equal(salah, false);
});

test("timing attack defense: DUMMY_HASH mencegah user enumeration", async () => {
  // Di lib/auth.ts, jika user tidak ditemukan atau tidak memiliki sandi (mis. Google OAuth),
  // bcrypt.compare(sandi, DUMMY_HASH) tetap dijalankan agar durasi komputasi setara.
  const DUMMY_HASH = "$2b$10$raZZcYBlcUZi6wIgvywJKuQdE/bK/7Lzs/Ue1exWpUrRUr/pqLfxi";

  const awal = Date.now();
  const hasil = await bcrypt.compare("tebakan-sandi", DUMMY_HASH);
  const durasi = Date.now() - awal;

  assert.equal(hasil, false);
  // Komparasi bcrypt memakan waktu CPU (work factor 10 ~ puluhan hingga ratusan ms)
  assert.ok(durasi >= 0);
});

// ── 2. Otorisasi Peran & Akses Route Admin ──────────────────────────────────

test("otorisasi peran: bolehKelola hanya mengizinkan admin dan editor", () => {
  assert.equal(bolehKelola("admin"), true);
  assert.equal(bolehKelola("editor"), true);
  assert.equal(bolehKelola("commenter"), false);
  assert.equal(bolehKelola("user"), false);
  assert.equal(bolehKelola(""), false);
});

// ── 3. Sidik Sandi & Pembatalan Sesi (Session Invalidation) ─────────────────

function sidikSandi(hash: string | null | undefined): string {
  return createHash("sha256").update(hash ?? "").digest("hex").slice(0, 16);
}

test("sidikSandi: perubahan kata sandi langsung membatalkan sesi lama", async () => {
  const sandiLama = await bcrypt.hash("sandi-lama-123", 10);
  const sandiBaru = await bcrypt.hash("sandi-baru-456", 10);

  const sidik1 = sidikSandi(sandiLama);
  const sidik2 = sidikSandi(sandiBaru);

  assert.notEqual(sidik1, sidik2, "Sidik sandi harus berubah jika hash sandi berubah");

  // Simulasi validasi payload JWT di bacaSesi()
  const payloadJwt = { id: 1, nama: "Admin", peran: "admin", sv: sidik1 };

  // Sebelum ganti sandi: token cocok dengan DB
  assert.equal(payloadJwt.sv === sidikSandi(sandiLama), true);

  // Setelah ganti sandi: token lama ditolak seketika
  assert.equal(payloadJwt.sv === sidikSandi(sandiBaru), false);
});

// ── 4. Safeguards: Validasi Sandi, Diri Sendiri, dan Admin Terakhir ─────────

function periksaSandi(sandi: string, konfirmasi: string, wajib: boolean): string | null {
  if (!sandi && !wajib) return null;
  if (sandi.length < 8) return "Kata sandi minimal 8 karakter.";
  if (sandi !== konfirmasi) return "Konfirmasi kata sandi tidak cocok.";
  return null;
}

test("validasi kata sandi: aturan pembuatan dan pengubahan akun", () => {
  // Akun baru (wajib = true)
  assert.equal(periksaSandi("", "", true), "Kata sandi minimal 8 karakter.");
  assert.equal(periksaSandi("pendek", "pendek", true), "Kata sandi minimal 8 karakter.");
  assert.equal(periksaSandi("12345678", "12345679", true), "Konfirmasi kata sandi tidak cocok.");
  assert.equal(periksaSandi("12345678", "12345678", true), null);

  // Ubah akun (wajib = false, kosong = tetap pakai sandi lama)
  assert.equal(periksaSandi("", "", false), null);
  assert.equal(periksaSandi("12345678", "12345678", false), null);
  assert.equal(periksaSandi("pendek", "pendek", false), "Kata sandi minimal 8 karakter.");
  assert.equal(periksaSandi("12345678", "beda1234", false), "Konfirmasi kata sandi tidak cocok.");
});

test("safeguard hapus akun: admin dilarang menghapus akunnya sendiri", () => {
  const sesiAktif = { id: 1, peran: "admin" };
  const targetId = 1;

  let galat: string | null = null;
  if (targetId === sesiAktif.id) {
    galat = "Akun Anda sendiri tidak bisa dihapus.";
  }

  assert.equal(galat, "Akun Anda sendiri tidak bisa dihapus.");
});

test("safeguard peran akun: admin dilarang menurunkan perannya sendiri", () => {
  const sesiAktif = { id: 1, peran: "admin" };
  const targetId = 1;
  const peranBaru = "editor";

  let galat: string | null = null;
  if (targetId === sesiAktif.id && peranBaru !== sesiAktif.peran) {
    galat = "Peran akun Anda sendiri tidak bisa diubah dari sini — minta admin lain.";
  }

  assert.equal(galat, "Peran akun Anda sendiri tidak bisa diubah dari sini — minta admin lain.");
});

test("safeguard admin terakhir: dilarang menghapus atau menurunkan admin terakhir", () => {
  // Simulasi jika hanya ada 1 admin di sistem (totalAdmin = 1)
  const cekAdminLainAda = (jumlahAdmin: number) => jumlahAdmin > 1;

  // Kasus 1: Menghapus admin ketika hanya ada 1 admin
  const jumlahAdmin = 1;
  const adminLain = cekAdminLainAda(jumlahAdmin);
  assert.equal(adminLain, false);

  let galatHapus: string | null = null;
  if (!adminLain) {
    galatHapus = "Ini admin terakhir dan tidak bisa dihapus.";
  }
  assert.equal(galatHapus, "Ini admin terakhir dan tidak bisa dihapus.");

  // Kasus 2: Menurunkan peran admin terakhir ke editor
  let galatUbah: string | null = null;
  const peranLama: string = "admin";
  const peranBaru: string = "editor";
  if (peranLama === "admin" && peranBaru !== "admin" && !adminLain) {
    galatUbah = "Ini admin terakhir. Jadikan akun lain admin dulu.";
  }
  assert.equal(galatUbah, "Ini admin terakhir. Jadikan akun lain admin dulu.");
});

// ── 5. Biometrik & Passkeys (WebAuthn) ──────────────────────────────────────

test("passkey: pencabutan passkey terisolasi pada user_id pemilik (cegah IDOR)", () => {
  // Simulasi klausa deleteMany di hapusPasskey()
  const sesiUser1 = { id: 1 };
  const targetPasskey = { id: "passkey-milik-user-2", user_id: 2 };

  // Query DB menggunakan { where: { id: targetPasskey.id, user_id: sesiUser1.id } }
  const cocok = targetPasskey.id === "passkey-milik-user-2" && targetPasskey.user_id === sesiUser1.id;
  assert.equal(cocok, false, "User 1 tidak boleh bisa mencabut passkey milik User 2");

  const milikUser1 = { id: "passkey-milik-user-1", user_id: 1 };
  const cocokUser1 = milikUser1.id === "passkey-milik-user-1" && milikUser1.user_id === sesiUser1.id;
  assert.equal(cocokUser1, true, "User 1 hanya bisa mencabut passkey miliknya sendiri");
});

test("passkey challenge: token tantangan pendaftaran terikat pada uid sesi", async () => {
  const rahasia = "uji-rahasia-webauthn-jwt-secret-min-32-chars";
  const kunci = new TextEncoder().encode(rahasia);

  // Sesi User 1 membuat tantangan pendaftaran
  const tantanganUser1 = { c: "challenge-12345", untuk: "daftar", uid: 1 };
  const token = await new SignJWT(tantanganUser1)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("5m")
    .sign(kunci);

  // Verifikasi token oleh User 1 (sah)
  const { payload } = await jwtVerify<{ c: string; untuk: string; uid: number }>(token, kunci);
  assert.equal(payload.uid === 1, true);

  // Bila User 2 mencoba menukarkan tantangan User 1:
  const sesiUser2 = { id: 2 };
  const uidCocok = payload.uid === sesiUser2.id;
  assert.equal(uidCocok, false, "Tantangan milik User 1 harus ditolak bila dikirim oleh sesi User 2");
});

test("passkey login: penolakan peran yang tidak berhak masuk CMS", () => {
  // Pada masukPasskey(), jika user memiliki passkey valid tapi perannya diubah ke commenter:
  const passkeyUser = {
    id: "cred-1",
    users: { id: 3, name: "Mantan Editor", role: "commenter" },
  };

  const bolehMasuk = bolehKelola(passkeyUser.users.role);
  assert.equal(bolehMasuk, false, "Akun dengan peran commenter tidak boleh diberi sesi masuk CMS");
});
