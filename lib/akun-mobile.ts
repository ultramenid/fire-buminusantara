import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";
import { BIAYA_BCRYPT, DUMMY_HASH, emailSah } from "./auth.ts";
import { catatGalat } from "./catat-galat.ts";
import { saring } from "./komentar.ts";
import { prisma } from "./prisma.ts";

/**
 * Akun warga untuk aplikasi mobile Lapor Karhutla (kontrak: docs/AKUN.md di
 * repo aplikasi).
 *
 * Akun menggantikan Turnstile & pemeriksaan same-origin yang membuat komentar
 * dan suka web tidak bisa dipanggil dari aplikasi. Warga masuk dengan Google,
 * lalu memakai token Bearer. Tokennya acak dan yang disimpan hanya sha256-nya
 * di `mobile_sessions` — bocornya basis data tidak membocorkan sesi, dan
 * keluar = baris dihapus, tidak menunggu kedaluwarsa.
 *
 * Akun warga duduk di tabel `users` yang sama dengan akun CMS, berperan
 * `commenter`. Peran itu tidak pernah lolos bolehKelola() di lib/sesi.ts, jadi
 * akun warga — Google murni tanpa kata sandi, maupun yang didaftarkan dengan
 * email & kata sandi (daftarEmail) — tidak bisa masuk CMS.
 */

export const BATAS_NAMA = 100;

export type PenggunaMobile = { id: string; nama: string; email: string | null; foto: string | null };

const PILIH = { id: true, name: true, email: true, image: true } as const;
export type BarisPengguna = { id: bigint; name: string; email: string; image: string | null };

export function publik(u: BarisPengguna): PenggunaMobile {
  return { id: String(u.id), nama: u.name, email: u.email, foto: u.image };
}

/**
 * Asal publik permintaan untuk membentuk URL mutlak (sampul Laporanku).
 * Bukan `req.url`: di belakang proxy / container yang bind 0.0.0.0, Next
 * mengisinya dengan alamat bind (http://0.0.0.0:3000), yang tak bisa dibuka HP.
 */
export function asalPublik(req: Request): string {
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() || req.headers.get("host");
  if (!host) return new URL(req.url).origin;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || new URL(req.url).protocol.replace(":", "");
  return `${proto}://${host}`;
}

export function galat(pesan: string, status: number): Response {
  return Response.json({ galat: pesan }, { status });
}

export function sidikToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Token dari `Authorization: Bearer …`. Panjang di luar kewajaran = bukan token kita. */
export function tokenDari(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  if (!h.startsWith("Bearer ")) return null;
  const token = h.slice(7).trim();
  return token.length >= 32 && token.length <= 128 ? token : null;
}

/**
 * Sesi yang tidak dipakai selama ini kedaluwarsa: HP yang hilang atau aplikasi
 * yang dihapus tanpa keluar tidak meninggalkan token hidup selamanya. Aplikasi
 * menjawab 401 dengan keluar di HP; warga cukup masuk ulang.
 */
export const UMUR_SESI_MS = 90 * 24 * 60 * 60_000;

/** Sudah UMUR_SESI_MS (tepat 90 hari termasuk) sejak terakhir dipakai — atau
 *  sejak dibuat, bila pemakaiannya belum pernah dicatat. */
export function sesiKedaluwarsa(sesi: { created_at: Date; last_used_at: Date | null }, kini: Date): boolean {
  return kini.getTime() - (sesi.last_used_at ?? sesi.created_at).getTime() >= UMUR_SESI_MS;
}

export async function buatSesiMobile(userId: bigint): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.mobile_sessions.create({ data: { token_hash: sidikToken(token), user_id: userId } });
  // Login jarang terjadi, jadi di sinilah sesi kedaluwarsa SEMUA pengguna
  // disapu — tanpa job terjadwal. Syaratnya sama dengan sesiKedaluwarsa().
  const batas = new Date(Date.now() - UMUR_SESI_MS);
  await prisma.mobile_sessions
    .deleteMany({
      where: { OR: [{ last_used_at: { lte: batas } }, { last_used_at: null, created_at: { lte: batas } }] },
    })
    .catch((e) => catatGalat("sapu-sesi-mobile", e));
  return token;
}

/** Pemakaian dicatat paling sering sejam sekali — cukup untuk menyapu sesi mati,
 *  tanpa satu UPDATE di setiap permintaan. */
const JEDA_CATAT_MS = 60 * 60_000;

/** Pengguna pemilik token Bearer, atau null bila tanpa token / token dicabut / kedaluwarsa. */
export async function penggunaDari(req: Request): Promise<BarisPengguna | null> {
  const token = tokenDari(req);
  if (!token) return null;
  const sesi = await prisma.mobile_sessions.findUnique({
    where: { token_hash: sidikToken(token) },
    select: { id: true, created_at: true, last_used_at: true, users: { select: PILIH } },
  });
  if (!sesi) return null;
  const kini = new Date();
  if (sesiKedaluwarsa(sesi, kini)) {
    // deleteMany, bukan delete: permintaan paralel bertoken sama boleh sudah menghapusnya.
    await prisma.mobile_sessions.deleteMany({ where: { id: sesi.id } }).catch(() => {});
    return null;
  }
  if (!sesi.last_used_at || kini.getTime() - sesi.last_used_at.getTime() > JEDA_CATAT_MS) {
    await prisma.mobile_sessions
      .update({ where: { id: sesi.id }, data: { last_used_at: kini } })
      .catch(() => {});
  }
  return sesi.users;
}

export async function cabutSesi(req: Request): Promise<void> {
  const token = tokenDari(req);
  if (token) await prisma.mobile_sessions.deleteMany({ where: { token_hash: sidikToken(token) } });
}

// Kunci publik Google di-cache jose sesuai Cache-Control; tidak diambil tiap login.
const KUNCI_GOOGLE = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export type KlaimGoogle = { sub: string; email: string; nama: string | null; foto: string | null };

/**
 * Verifikasi idToken dari Google Sign-In di HP: tanda tangan Google, penerbit,
 * `aud` = OAuth client "Web application" yang juga dipakai aplikasi, dan email
 * terverifikasi.
 */
export async function verifikasiGoogle(idToken: string): Promise<KlaimGoogle | { galat: string; status: number }> {
  const aud = process.env.GOOGLE_WEB_CLIENT_ID;
  if (!aud) return { galat: "Masuk dengan Google belum disiapkan di server.", status: 503 };
  if (!idToken || idToken.length > 4096) return { galat: "Token Google kosong atau rusak.", status: 400 };
  try {
    const { payload } = await jwtVerify(idToken, KUNCI_GOOGLE, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: aud,
    });
    if (payload.email_verified !== true || typeof payload.email !== "string" || typeof payload.sub !== "string") {
      return { galat: "Email Google belum terverifikasi.", status: 401 };
    }
    return {
      sub: payload.sub,
      email: payload.email.toLowerCase(),
      nama: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : null,
      foto: typeof payload.picture === "string" ? payload.picture : null,
    };
  } catch {
    return { galat: "Token Google tidak sah atau kedaluwarsa.", status: 401 };
  }
}

/**
 * Email milik akun staf CMS (admin/editor) tidak ditautkan otomatis: tautan
 * Google/Apple lewat email saja membuka pintu masuk baru ke akun berhak CMS.
 * Tautan yang sudah ada (google_id/apple_id terisi) tetap berlaku.
 */
const GALAT_STAF = {
  galat: "Email ini milik akun staf dan tidak bisa ditautkan otomatis. Masuk dengan email lain, atau minta admin.",
  status: 409,
};

/**
 * Menautkan Google/Apple ke akun yang ditemukan lewat email. Penyedia itu membuktikan pemilik
 * emailnya, sedangkan daftar dengan email (daftarEmail) tidak: siapa pun bisa mendaftarkan email
 * orang lain beserta kata sandinya lebih dulu. Karena itu akun yang emailnya belum terverifikasi
 * kehilangan kata sandi & sesinya saat ditautkan, lalu emailnya dianggap terverifikasi. Akun
 * yang sudah terverifikasi (Google, Laravel) tetap seperti semula.
 */
async function tautkanTerbukti(
  akun: { id: bigint; email_verified_at?: Date | null },
  tautan: { google_id: string } | { apple_id: string },
  sekarang: Date,
): Promise<void> {
  const belumTerbukti = !akun.email_verified_at;
  if (belumTerbukti) await prisma.mobile_sessions.deleteMany({ where: { user_id: akun.id } });
  await prisma.users.update({
    where: { id: akun.id },
    data: { ...tautan, updated_at: sekarang, ...(belumTerbukti && { password: null, email_verified_at: sekarang }) },
  });
}

/** Kata sandi akun email: minimal 8 karakter, maksimal 72 byte (bcrypt memotong sisanya diam-diam). */
export const SANDI_MIN = 8;
export const SANDI_MAKS_BYTE = 72;

/** Galat isian kata sandi baru, atau null bila sah. */
export function galatSandi(sandi: string): string | null {
  if (sandi.length < SANDI_MIN) return `Kata sandi minimal ${SANDI_MIN} karakter.`;
  if (Buffer.byteLength(sandi, "utf8") > SANDI_MAKS_BYTE) return "Kata sandi terlalu panjang (maksimal 72 karakter).";
  return null;
}

/** Email dibandingkan tanpa huruf besar & spasi (kolasi kolom email juga tidak peka huruf besar). */
export function rapikanEmail(email: unknown): string {
  return String(email ?? "").trim().toLowerCase();
}

const GALAT_SANDI_SALAH = { galat: "Email atau kata sandi salah.", status: 401 };

/**
 * Masuk dengan email & kata sandi: akun yang didaftarkan dari aplikasi (daftarEmail) dan akun
 * situs lama (bcrypt Laravel `$2y$`, dibaca bcryptjs apa adanya — lib/auth.ts). Waktu jawab sama
 * apakah akunnya ada atau tidak (DUMMY_HASH). Akun staf ditolak SETELAH kata sandinya benar,
 * supaya kata sandi CMS tidak menjadi pintu masuk baru dan peran tidak bisa ditebak tanpa sandi.
 */
export async function penggunaEmail(email: string, sandi: string): Promise<BarisPengguna | { galat: string; status: number }> {
  const akun = emailSah(email)
    ? await prisma.users.findUnique({ where: { email }, select: { ...PILIH, password: true, role: true } })
    : null;
  if (!akun?.password) {
    await bcrypt.compare(sandi, DUMMY_HASH);
    return GALAT_SANDI_SALAH;
  }
  if (!(await bcrypt.compare(sandi, akun.password))) return GALAT_SANDI_SALAH;
  if (akun.role !== "commenter") {
    return { galat: "Akun staf tidak bisa masuk ke aplikasi dengan kata sandi. Gunakan akun warga.", status: 403 };
  }
  return { id: akun.id, name: akun.name, email: akun.email, image: akun.image };
}

/**
 * Daftar akun warga dengan email & kata sandi, tanpa verifikasi email (belum ada pengirim email):
 * email_verified_at null. Email yang sudah terdaftar ditolak — kata sandi tidak pernah ditempelkan
 * ke akun yang sudah ada (Google, Apple, Laravel, staf). Pemilik asli email tetap aman lewat
 * tautkanTerbukti saat ia masuk dengan Google/Apple.
 */
export async function daftarEmail(
  namaMentah: string,
  email: string,
  sandi: string,
): Promise<BarisPengguna | { galat: string; status: number }> {
  const nama = namaMentah.trim().slice(0, BATAS_NAMA);
  if (!nama) return { galat: "Nama wajib diisi.", status: 422 };
  if (!emailSah(email)) return { galat: "Alamat email tidak valid.", status: 422 };
  const salahSandi = galatSandi(sandi);
  if (salahSandi) return { galat: salahSandi, status: 422 };

  const GALAT_TERDAFTAR = {
    galat: "Email ini sudah terdaftar. Masuk dengan kata sandinya, atau dengan Google/Apple bila akunnya dibuat dengan cara itu.",
    status: 409,
  };
  if (await prisma.users.findUnique({ where: { email }, select: { id: true } })) return GALAT_TERDAFTAR;
  const sekarang = new Date();
  try {
    return await prisma.users.create({
      data: {
        // Nama tampil publik di komentar & siaran, jadi disensor seperti isinya.
        name: saring(nama) || "Warga",
        email,
        // Hash bcryptjs juga terbaca pengecek bcrypt Laravel (sama dengan CMS).
        password: await bcrypt.hash(sandi, BIAYA_BCRYPT),
        role: "commenter",
        email_verified_at: null,
        created_at: sekarang,
        updated_at: sekarang,
      },
      select: PILIH,
    });
  } catch (e) {
    // Dua pendaftaran serentak dengan email yang sama: indeks unik menolak yang kedua.
    if ((e as { code?: string })?.code === "P2002") return GALAT_TERDAFTAR;
    throw e;
  }
}

/**
 * Akun untuk klaim Google: dicari lewat google_id, lalu email. Email warga
 * yang sudah terdaftar ditautkan karena Google menjamin pemiliknya — kecuali
 * akun staf (GALAT_STAF). Nama yang sudah diubah warga tidak ditimpa nama Google.
 */
export async function penggunaGoogle(g: KlaimGoogle): Promise<BarisPengguna | { galat: string; status: number }> {
  const lewatGoogle = await prisma.users.findUnique({ where: { google_id: g.sub }, select: PILIH });
  if (lewatGoogle) return lewatGoogle;

  const sekarang = new Date();
  const lewatEmail = await prisma.users.findUnique({
    where: { email: g.email },
    select: { ...PILIH, google_id: true, role: true, email_verified_at: true },
  });
  if (lewatEmail) {
    if (lewatEmail.google_id && lewatEmail.google_id !== g.sub) {
      return { galat: "Email ini sudah tertaut ke akun Google lain.", status: 409 };
    }
    if (!lewatEmail.google_id) {
      if (lewatEmail.role !== "commenter") return GALAT_STAF;
      await tautkanTerbukti(lewatEmail, { google_id: g.sub }, sekarang);
    }
    return { id: lewatEmail.id, name: lewatEmail.name, email: lewatEmail.email, image: lewatEmail.image };
  }

  return prisma.users.create({
    data: {
      // Nama tampil publik di komentar & siaran, jadi disensor seperti isinya.
      name: saring((g.nama ?? g.email.split("@")[0]).slice(0, BATAS_NAMA)),
      email: g.email,
      google_id: g.sub,
      role: "commenter",
      image: g.foto,
      email_verified_at: sekarang,
      created_at: sekarang,
      updated_at: sekarang,
    },
    select: PILIH,
  });
}

const APPLE = "https://appleid.apple.com";

// Kunci publik Apple, di-cache jose seperti kunci Google.
const KUNCI_APPLE = createRemoteJWKSet(new URL(`${APPLE}/auth/keys`));

/** Bundle ID iOS yang diterima sebagai `aud` token Apple: APPLE_BUNDLE_ID,
 *  boleh beberapa dipisah koma — build produksi dan varian `.preview`. */
export function bundleApple(): string[] {
  return (process.env.APPLE_BUNDLE_ID ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export type KlaimApple = {
  sub: string;
  email: string | null;
  /** Bundle ID yang meminta token (`aud`) — client_id untuk REST API Apple. */
  klien: string;
};

/**
 * Verifikasi identityToken Sign in with Apple dari aplikasi iOS: tanda tangan
 * Apple, penerbit, dan `aud` = salah satu bundle ID aplikasi (APPLE_BUNDLE_ID).
 */
export async function verifikasiApple(identityToken: string): Promise<KlaimApple | { galat: string; status: number }> {
  const aud = bundleApple();
  if (!aud.length) return { galat: "Masuk dengan Apple belum disiapkan di server.", status: 503 };
  if (!identityToken || identityToken.length > 4096) return { galat: "Token Apple kosong atau rusak.", status: 400 };
  try {
    const { payload } = await jwtVerify(identityToken, KUNCI_APPLE, { issuer: APPLE, audience: aud });
    if (typeof payload.sub !== "string") return { galat: "Token Apple tidak sah.", status: 401 };
    // email_verified dari Apple bisa boolean atau string "true".
    const terverifikasi = payload.email_verified === true || payload.email_verified === "true";
    const email = typeof payload.email === "string" && terverifikasi ? payload.email.toLowerCase() : null;
    const klien = [payload.aud].flat().find((a): a is string => typeof a === "string" && aud.includes(a)) ?? aud[0];
    return { sub: payload.sub, email, klien };
  } catch {
    return { galat: "Token Apple tidak sah atau kedaluwarsa.", status: 401 };
  }
}

/**
 * Akun untuk klaim Apple: lewat apple_id, lalu email terverifikasi (ditautkan,
 * kecuali akun staf — GALAT_STAF), atau akun warga baru. Nama hanya diberikan Apple saat
 * izin PERTAMA, jadi aplikasi mengirimkannya terpisah (`nama`).
 */
export async function penggunaApple(a: KlaimApple, nama: string): Promise<BarisPengguna | { galat: string; status: number }> {
  const lewatApple = await prisma.users.findUnique({ where: { apple_id: a.sub }, select: PILIH });
  if (lewatApple) return lewatApple;

  const sekarang = new Date();
  if (a.email) {
    const lewatEmail = await prisma.users.findUnique({
      where: { email: a.email },
      select: { ...PILIH, apple_id: true, role: true, email_verified_at: true },
    });
    if (lewatEmail) {
      if (lewatEmail.apple_id && lewatEmail.apple_id !== a.sub) {
        return { galat: "Email ini sudah tertaut ke akun Apple lain.", status: 409 };
      }
      if (!lewatEmail.apple_id && lewatEmail.role !== "commenter") return GALAT_STAF;
      await tautkanTerbukti(lewatEmail, { apple_id: a.sub }, sekarang);
      return { id: lewatEmail.id, name: lewatEmail.name, email: lewatEmail.email, image: lewatEmail.image };
    }
  }

  // Kolom email wajib & unik; tanpa email dari Apple dipakai alamat .invalid yang tak bisa menerima surat.
  const email = a.email ?? `apple-${sidikToken(a.sub).slice(0, 24)}@apple.invalid`;
  return prisma.users.create({
    data: {
      name: saring(nama.trim().slice(0, BATAS_NAMA)) || "Warga",
      email,
      apple_id: a.sub,
      role: "commenter",
      email_verified_at: a.email ? sekarang : null,
      created_at: sekarang,
      updated_at: sekarang,
    },
    select: PILIH,
  });
}

/**
 * client_secret REST API Apple (auth/token, auth/revoke): JWT ES256 bertanda
 * tangan kunci .p8 tim, `sub` = bundle ID. Null bila APPLE_TEAM_ID,
 * APPLE_KEY_ID, atau APPLE_PRIVATE_KEY belum diset — token Apple lalu tidak
 * disimpan dan tidak dicabut.
 */
export async function rahasiaKlienApple(klien: string): Promise<string | null> {
  const tim = process.env.APPLE_TEAM_ID;
  const idKunci = process.env.APPLE_KEY_ID;
  const pem = process.env.APPLE_PRIVATE_KEY;
  if (!tim || !idKunci || !pem) return null;
  // Di .env satu baris, baris baru PEM boleh ditulis sebagai \n.
  const kunci = await importPKCS8(pem.replace(/\\n/g, "\n"), "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: idKunci })
    .setIssuer(tim)
    .setSubject(klien)
    .setAudience(APPLE)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(kunci);
}

/**
 * refresh_token Apple disegel AES-256-GCM sebelum masuk `users`: tabel itu
 * dipakai bersama aplikasi Laravel, dan bocornya tidak boleh ikut membocorkan
 * token yang berlaku atas nama aplikasi. Kunci diturunkan dari
 * APPLE_TOKEN_SECRET; id pengguna menjadi AAD, jadi nilai satu baris tidak
 * bisa dipindah ke baris lain. Bentuknya `v1:<iv>:<sandi+tag>` (base64url).
 *
 * Kunci hilang atau diganti = token lama tak terbaca lagi: pencabutannya saat
 * akun dihapus gagal (hanya dicatat), masuk tetap jalan.
 */
const AWALAN_SEGEL = "v1:";
const PANJANG_TAG = 16;

function kunciTokenApple(): Buffer | null {
  const rahasia = process.env.APPLE_TOKEN_SECRET;
  return rahasia ? Buffer.from(hkdfSync("sha256", rahasia, "", "apple_refresh_token", 32)) : null;
}

export function segelTokenApple(token: string, userId: bigint): string {
  const kunci = kunciTokenApple();
  if (!kunci) throw new Error("APPLE_TOKEN_SECRET kosong — refresh_token Apple tidak bisa disegel");
  const iv = randomBytes(12);
  const sandi = createCipheriv("aes-256-gcm", kunci, iv, { authTagLength: PANJANG_TAG });
  sandi.setAAD(Buffer.from(`users:${userId}`));
  const isi = Buffer.concat([sandi.update(token, "utf8"), sandi.final(), sandi.getAuthTag()]);
  return `${AWALAN_SEGEL}${iv.toString("base64url")}:${isi.toString("base64url")}`;
}

/** Kebalikan segelTokenApple. Melempar bila kunci kosong/salah atau nilainya
 *  diubah. Nilai tanpa awalan `v1:` = token polos dari sebelum ada segel. */
export function bukaTokenApple(nilai: string, userId: bigint): string {
  if (!nilai.startsWith(AWALAN_SEGEL)) return nilai;
  const kunci = kunciTokenApple();
  if (!kunci) throw new Error("APPLE_TOKEN_SECRET kosong — refresh_token Apple tersegel tidak bisa dibuka");
  const [iv, isi] = nilai.slice(AWALAN_SEGEL.length).split(":").map((s) => Buffer.from(s, "base64url"));
  if (!iv?.length || !isi || isi.length <= PANJANG_TAG) throw new Error("refresh_token Apple tersegel rusak");
  const buka = createDecipheriv("aes-256-gcm", kunci, iv, { authTagLength: PANJANG_TAG });
  buka.setAAD(Buffer.from(`users:${userId}`));
  buka.setAuthTag(isi.subarray(isi.length - PANJANG_TAG));
  return Buffer.concat([buka.update(isi.subarray(0, isi.length - PANJANG_TAG)), buka.final()]).toString("utf8");
}

function kirimKeApple(jalur: string, isi: Record<string, string>): Promise<Response> {
  return fetch(`${APPLE}${jalur}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(isi),
    signal: AbortSignal.timeout(8000),
  });
}

/**
 * Tukar authorizationCode (sekali pakai, berlaku 5 menit) menjadi
 * refresh_token dan simpan tersegel (segelTokenApple), supaya bisa dicabut saat
 * akun dihapus. Gagal tidak menggagalkan masuk — hanya dicatat.
 */
export async function simpanTokenApple(userId: bigint, kode: string, klien: string): Promise<void> {
  if (!kode || kode.length > 2048) return;
  try {
    const rahasia = await rahasiaKlienApple(klien);
    if (!rahasia) return;
    // Diperiksa SEBELUM menukar kode: token yang tak bisa disegel tidak disimpan polos.
    if (!kunciTokenApple()) throw new Error("APPLE_TOKEN_SECRET kosong — refresh_token Apple tidak disimpan");
    const r = await kirimKeApple("/auth/token", {
      client_id: klien, client_secret: rahasia, code: kode, grant_type: "authorization_code",
    });
    const isi = (await r.json().catch(() => null)) as { refresh_token?: unknown; error?: unknown } | null;
    if (!r.ok || typeof isi?.refresh_token !== "string") {
      throw new Error(`auth/token HTTP ${r.status} ${String(isi?.error ?? "")}`.trim());
    }
    await prisma.users.update({
      where: { id: userId },
      data: { apple_refresh_token: segelTokenApple(isi.refresh_token, userId), apple_client_id: klien },
    });
  } catch (e) {
    await catatGalat("apple-token", e);
  }
}

/**
 * Cabut token Sign in with Apple akun ini saat dihapus (App Store 5.1.1(v)):
 * aplikasi hilang dari "Apps Using Apple ID" pengguna. Tanpa token tersimpan
 * atau tanpa kunci .p8 tidak ada yang bisa dicabut. Gagal hanya dicatat —
 * penghapusan data di sisi kita tetap jalan.
 */
export async function cabutTokenApple(userId: bigint): Promise<void> {
  try {
    const akun = await prisma.users.findUnique({
      where: { id: userId },
      select: { apple_refresh_token: true, apple_client_id: true },
    });
    if (!akun?.apple_refresh_token) return;
    const klien = akun.apple_client_id ?? bundleApple()[0];
    const rahasia = klien ? await rahasiaKlienApple(klien) : null;
    if (!klien || !rahasia) return;
    const r = await kirimKeApple("/auth/revoke", {
      client_id: klien,
      client_secret: rahasia,
      token: bukaTokenApple(akun.apple_refresh_token, userId),
      token_type_hint: "refresh_token",
    });
    if (!r.ok) throw new Error(`auth/revoke HTTP ${r.status}`);
  } catch (e) {
    await catatGalat("apple-revoke", e);
  }
}

/**
 * Hapus nama pelapor dari keterangan lampiran (laporan & kejadian hasil
 * promosinya) saat akunnya dihapus. Keterangan laporan diisi nama pelapor
 * (simpanLaporanPublik), jadi hanya keterangan yang sama persis dengan salah
 * satu `nama` yang diganti "anonim" — keterangan buatan kurator tidak
 * disentuh, dan entri dibiarkan utuh selain itu.
 */
export function anonimkanMedia(media: unknown, nama: Set<string>): { media: unknown; berubah: boolean } {
  if (!Array.isArray(media)) return { media, berubah: false };
  let berubah = false;
  const baru = media.map((m) => {
    if (!m || typeof m !== "object") return m;
    const ket = (m as Record<string, unknown>).keterangan;
    if (typeof ket !== "string" || !nama.has(ket.trim())) return m;
    berubah = true;
    return { ...m, keterangan: "anonim" };
  });
  return { media: berubah ? baru : media, berubah };
}

/** Kode masuk uji di produksi minimal sepanjang ini: tidak bisa ditebak lewat percobaan. */
const KODE_UJI_MIN = 16;

/**
 * Masuk uji tanpa Google (nama saja). Hanya bila MOBILE_MASUK_UJI=1.
 * - Pengembangan (`next dev`): cukup itu.
 * - Produksi: juga wajib MOBILE_MASUK_UJI_KODE (≥ 16 karakter) dan `kode` yang sama dari aplikasi.
 *   Kode itu hanya tertanam di build preview internal aplikasi (EXPO_PUBLIC_MASUK_UJI_KODE), jadi
 *   orang luar yang menemukan rute ini tetap tidak bisa masuk sebagai nama apa pun.
 */
export function masukUjiBoleh(kode?: unknown): boolean {
  if (process.env.MOBILE_MASUK_UJI !== "1") return false;
  if (process.env.NODE_ENV !== "production") return true;
  const rahasia = process.env.MOBILE_MASUK_UJI_KODE ?? "";
  if (rahasia.length < KODE_UJI_MIN || typeof kode !== "string") return false;
  // Dibandingkan sebagai sidik sha256: panjang sama, waktu tetap.
  const sidik = (t: string) => createHash("sha256").update(t).digest();
  return timingSafeEqual(sidik(kode), sidik(rahasia));
}

export async function penggunaUji(nama: string): Promise<BarisPengguna> {
  const bersih = nama.trim().slice(0, BATAS_NAMA) || "Penguji";
  const email = `uji-${bersih.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "warga"}@uji.invalid`;
  const sekarang = new Date();
  return prisma.users.upsert({
    where: { email },
    create: { name: saring(bersih), email, role: "commenter", created_at: sekarang, updated_at: sekarang },
    update: {},
    select: PILIH,
  });
}
