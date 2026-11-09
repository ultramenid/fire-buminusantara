import { test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { decodeProtectedHeader, exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import {
  anonimkanMedia,
  asalPublik,
  bukaTokenApple,
  bundleApple,
  daftarEmail,
  galatSandi,
  masukUjiBoleh,
  penggunaApple,
  penggunaEmail,
  penggunaGoogle,
  rahasiaKlienApple,
  rapikanEmail,
  segelTokenApple,
  sesiKedaluwarsa,
  sidikToken,
  tokenDari,
} from "./akun-mobile.ts";
import { penandaAkun, penandaPengunjung } from "./suka.ts";

const minta = (headers: Record<string, string>, url = "http://0.0.0.0:3000/api/mobile/saya/laporan") =>
  new Request(url, { headers });

test("tokenDari: hanya Bearer dengan panjang wajar", () => {
  const token = "a".repeat(43);
  assert.equal(tokenDari(minta({ authorization: `Bearer ${token}` })), token);
  assert.equal(tokenDari(minta({ authorization: `Basic ${token}` })), null);
  assert.equal(tokenDari(minta({ authorization: "Bearer pendek" })), null);
  assert.equal(tokenDari(minta({})), null);
});

test("sidikToken: sha256 hex, token mentah tidak disimpan", () => {
  const sidik = sidikToken("rahasia");
  assert.match(sidik, /^[0-9a-f]{64}$/);
  assert.notEqual(sidik, "rahasia");
});

test("sesiKedaluwarsa: 90 hari sejak terakhir dipakai, tepat 90 hari sudah kedaluwarsa", () => {
  const kini = new Date("2026-10-23T12:00:00Z");
  const lalu = (hari: number, ms = 0) => new Date(kini.getTime() - hari * 86_400_000 - ms);
  const dibuat = lalu(400);
  assert.equal(sesiKedaluwarsa({ created_at: dibuat, last_used_at: lalu(1) }, kini), false, "dipakai kemarin");
  assert.equal(sesiKedaluwarsa({ created_at: dibuat, last_used_at: lalu(90, -1) }, kini), false, "kurang 1 ms dari 90 hari");
  assert.equal(sesiKedaluwarsa({ created_at: dibuat, last_used_at: lalu(90) }, kini), true, "tepat 90 hari");
  assert.equal(sesiKedaluwarsa({ created_at: dibuat, last_used_at: lalu(91) }, kini), true);
});

test("sesiKedaluwarsa: tanpa last_used_at dihitung dari created_at", () => {
  const kini = new Date("2026-10-23T12:00:00Z");
  const lalu = (hari: number, ms = 0) => new Date(kini.getTime() - hari * 86_400_000 - ms);
  assert.equal(sesiKedaluwarsa({ created_at: lalu(0), last_used_at: null }, kini), false, "baru dibuat");
  assert.equal(sesiKedaluwarsa({ created_at: lalu(90, -1), last_used_at: null }, kini), false);
  assert.equal(sesiKedaluwarsa({ created_at: lalu(90), last_used_at: null }, kini), true, "tepat 90 hari sejak dibuat");
});

test("asalPublik: dari Host/X-Forwarded-*, bukan alamat bind 0.0.0.0", () => {
  assert.equal(asalPublik(minta({ host: "192.168.1.10:3000" })), "http://192.168.1.10:3000");
  assert.equal(
    asalPublik(minta({ host: "web:3000", "x-forwarded-host": "fire.nusantara.earth", "x-forwarded-proto": "https" })),
    "https://fire.nusantara.earth",
  );
});

test("penandaAkun tidak bertabrakan dengan penanda pengunjung web", () => {
  assert.notEqual(penandaAkun(1), penandaPengunjung("akun:1", null));
  assert.notEqual(penandaAkun(1), penandaAkun(2));
});

test("masuk uji: produksi butuh kode yang cocok, selalu butuh MOBILE_MASUK_UJI", () => {
  const lama = { ...process.env };
  const kode = "kode-uji-yang-panjang-sekali";
  process.env.MOBILE_MASUK_UJI = "1";
  delete process.env.MOBILE_MASUK_UJI_KODE;
  (process.env as Record<string, string>).NODE_ENV = "production";
  assert.equal(masukUjiBoleh(), false);
  assert.equal(masukUjiBoleh(kode), false);
  process.env.MOBILE_MASUK_UJI_KODE = "pendek";
  assert.equal(masukUjiBoleh("pendek"), false);
  process.env.MOBILE_MASUK_UJI_KODE = kode;
  assert.equal(masukUjiBoleh(), false);
  assert.equal(masukUjiBoleh(`${kode}x`), false);
  assert.equal(masukUjiBoleh(123), false);
  assert.equal(masukUjiBoleh(kode), true);
  (process.env as Record<string, string>).NODE_ENV = "development";
  assert.equal(masukUjiBoleh(), true);
  delete process.env.MOBILE_MASUK_UJI;
  assert.equal(masukUjiBoleh(kode), false);
  (process.env as Record<string, string>).NODE_ENV = "production";
  assert.equal(masukUjiBoleh(kode), false);
  Object.assign(process.env, lama);
});

test("bundleApple: APPLE_BUNDLE_ID boleh beberapa, dipisah koma", () => {
  const lama = process.env.APPLE_BUNDLE_ID;
  process.env.APPLE_BUNDLE_ID = " earth.nusantara.fire.lapor , earth.nusantara.fire.lapor.preview,";
  assert.deepEqual(bundleApple(), ["earth.nusantara.fire.lapor", "earth.nusantara.fire.lapor.preview"]);
  process.env.APPLE_BUNDLE_ID = "";
  assert.deepEqual(bundleApple(), []);
  if (lama === undefined) delete process.env.APPLE_BUNDLE_ID;
  else process.env.APPLE_BUNDLE_ID = lama;
});

test("rahasiaKlienApple: JWT ES256 untuk REST API Apple, null tanpa kunci .p8", async () => {
  const lama = { ...process.env };
  delete process.env.APPLE_TEAM_ID;
  assert.equal(await rahasiaKlienApple("earth.nusantara.fire.lapor"), null);

  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  process.env.APPLE_TEAM_ID = "TIM1234567";
  process.env.APPLE_KEY_ID = "KUNCI12345";
  // Seperti di .env satu baris: baris baru PEM ditulis \n.
  process.env.APPLE_PRIVATE_KEY = (await exportPKCS8(privateKey)).replace(/\n/g, "\\n");
  const jwt = await rahasiaKlienApple("earth.nusantara.fire.lapor.preview");
  assert.ok(jwt);
  assert.deepEqual(decodeProtectedHeader(jwt), { alg: "ES256", kid: "KUNCI12345" });
  const { payload } = await jwtVerify(jwt, publicKey, { issuer: "TIM1234567", audience: "https://appleid.apple.com" });
  assert.equal(payload.sub, "earth.nusantara.fire.lapor.preview");
  assert.ok(payload.exp! - payload.iat! <= 15_777_000, "Apple menolak client_secret > 6 bulan");
  for (const k of ["APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"]) delete process.env[k];
  Object.assign(process.env, lama);
});

test("segelTokenApple: AES-256-GCM terikat ke pengguna, kunci salah atau nilai diubah ditolak", (t) => {
  const lama = process.env.APPLE_TOKEN_SECRET;
  t.after(() => {
    if (lama === undefined) delete process.env.APPLE_TOKEN_SECRET;
    else process.env.APPLE_TOKEN_SECRET = lama;
  });
  const token = "r1a2b3.0.rsxw.contoh-refresh-token-apple";
  const PENGGUNA = BigInt(7);

  delete process.env.APPLE_TOKEN_SECRET;
  assert.throws(() => segelTokenApple(token, PENGGUNA), /APPLE_TOKEN_SECRET kosong/, "tanpa kunci tidak disimpan polos");

  process.env.APPLE_TOKEN_SECRET = "kunci-uji-pertama";
  const segel = segelTokenApple(token, PENGGUNA);
  assert.match(segel, /^v1:[\w-]+:[\w-]+$/);
  assert.ok(!segel.includes(token));
  assert.notEqual(segelTokenApple(token, PENGGUNA), segel, "IV acak: segel berbeda tiap kali");
  assert.equal(bukaTokenApple(segel, PENGGUNA), token);

  assert.throws(() => bukaTokenApple(segel, BigInt(8)), "AAD: segel baris lain tidak bisa dipakai");
  const [awalan, iv, isi] = segel.split(":");
  const diubah = Buffer.from(isi, "base64url");
  diubah[0] ^= 1;
  assert.throws(() => bukaTokenApple(`${awalan}:${iv}:${diubah.toString("base64url")}`, PENGGUNA), "nilai diubah");
  assert.throws(() => bukaTokenApple("v1:rusak", PENGGUNA), /rusak/);

  process.env.APPLE_TOKEN_SECRET = "kunci-uji-kedua";
  assert.throws(() => bukaTokenApple(segel, PENGGUNA), "kunci diganti = token lama tak terbaca");
  delete process.env.APPLE_TOKEN_SECRET;
  assert.throws(() => bukaTokenApple(segel, PENGGUNA), /APPLE_TOKEN_SECRET kosong/);
});

test("bukaTokenApple: token polos dari sebelum ada segel dikembalikan apa adanya", () => {
  assert.equal(bukaTokenApple("r1a2b3.0.polos", BigInt(7)), "r1a2b3.0.polos");
});

test("anonimkanMedia: hanya keterangan bernama pelapor yang diganti, entri lain utuh", () => {
  const media = [
    { path: "fire/a.jpg", type: "image", keterangan: "Siti Rahasia", exif: { lat: -2 } },
    { path: "fire/b.jpg", type: "image", keterangan: "Asap tebal di tepi kanal" },
    { path: "fire/c.mp4", type: "video", poster: "fire/c.jpg" },
  ];
  const hasil = anonimkanMedia(media, new Set(["Siti Rahasia"]));
  assert.equal(hasil.berubah, true);
  assert.deepEqual(hasil.media, [
    { path: "fire/a.jpg", type: "image", keterangan: "anonim", exif: { lat: -2 } },
    media[1],
    media[2],
  ]);
  assert.equal(anonimkanMedia(media, new Set(["Orang Lain"])).berubah, false);
  assert.deepEqual(anonimkanMedia(null, new Set(["Siti Rahasia"])), { media: null, berubah: false });
});

/** Prisma palsu lewat globalThis.prisma (dibaca lib/prisma.ts lebih dulu): tabel users sekecil ini. */
function usersPalsu(
  t: { after: (f: () => void) => void },
  baris: Record<string, unknown>[],
  catat: { dibuat?: Record<string, unknown>[]; sesiDihapus?: unknown[] } = {},
) {
  const ruang = globalThis as { prisma?: unknown };
  const lama = ruang.prisma;
  t.after(() => void (ruang.prisma = lama));
  const ubah: unknown[] = [];
  const cari = ({ where }: { where: Record<string, unknown> }) =>
    baris.find((b) => Object.entries(where).every(([k, v]) => b[k] === v)) ?? null;
  ruang.prisma = {
    users: {
      findUnique: async (a: { where: Record<string, unknown> }) => cari(a),
      update: async (a: unknown) => void ubah.push(a),
      create: async (a: { data: Record<string, unknown> }) => {
        if (!catat.dibuat) assert.fail("tidak boleh membuat akun baru");
        catat.dibuat.push(a.data);
        return { id: BigInt(99), name: a.data.name, email: a.data.email, image: null };
      },
    },
    mobile_sessions: { deleteMany: async (a: unknown) => void catat.sesiDihapus?.push(a) },
  };
  return ubah;
}

const STAF = { id: BigInt(1), name: "Editor", email: "staf@pasopati.id", image: null, role: "editor", google_id: null, apple_id: null };
const WARGA = { id: BigInt(2), name: "Warga", email: "warga@pasopati.id", image: null, role: "commenter", google_id: null, apple_id: null };

test("penggunaGoogle: email akun staf tidak ditautkan otomatis (409), email warga ditautkan", async (t) => {
  const ubah = usersPalsu(t, [STAF, WARGA]);
  const ditolak = await penggunaGoogle({ sub: "g-asing", email: STAF.email, nama: null, foto: null });
  assert.equal("galat" in ditolak && ditolak.status, 409);
  assert.equal(ubah.length, 0, "google_id staf tidak disentuh");

  const warga = await penggunaGoogle({ sub: "g-warga", email: WARGA.email, nama: null, foto: null });
  assert.equal("id" in warga && warga.id, WARGA.id);
  assert.equal((ubah[0] as { data: { google_id: string } }).data.google_id, "g-warga");
});

test("penggunaGoogle/Apple: tautan staf yang sudah ada tetap berlaku", async (t) => {
  usersPalsu(t, [{ ...STAF, google_id: "g-staf", apple_id: "a-staf" }]);
  const g = await penggunaGoogle({ sub: "g-staf", email: STAF.email, nama: null, foto: null });
  assert.equal("id" in g && g.id, STAF.id);
  const a = await penggunaApple({ sub: "a-staf", email: STAF.email, klien: "x" }, "");
  assert.equal("id" in a && a.id, STAF.id);
});

test("penggunaApple: email akun staf tidak ditautkan otomatis (409)", async (t) => {
  const ubah = usersPalsu(t, [STAF]);
  const ditolak = await penggunaApple({ sub: "a-asing", email: STAF.email, klien: "x" }, "");
  assert.equal("galat" in ditolak && ditolak.status, 409);
  assert.equal(ubah.length, 0);
});

test("galatSandi: minimal 8 karakter, maksimal 72 byte UTF-8", () => {
  assert.match(galatSandi("1234567") ?? "", /minimal 8/);
  assert.equal(galatSandi("12345678"), null);
  assert.equal(galatSandi("a".repeat(72)), null);
  assert.match(galatSandi("a".repeat(73)) ?? "", /terlalu panjang/);
  // 25 × 3 byte = 75 byte walau hanya 25 karakter.
  assert.match(galatSandi("€".repeat(25)) ?? "", /terlalu panjang/);
});

test("rapikanEmail: tanpa spasi tepi & huruf besar", () => {
  assert.equal(rapikanEmail("  Warga@Contoh.ID "), "warga@contoh.id");
  assert.equal(rapikanEmail(undefined), "");
});

test("penggunaGoogle/Apple: akun email belum terverifikasi kehilangan sandi & sesinya saat ditautkan", async (t) => {
  for (const [jenis, masuk] of [
    ["google", () => penggunaGoogle({ sub: "g-pemilik", email: WARGA.email, nama: null, foto: null })],
    ["apple", () => penggunaApple({ sub: "a-pemilik", email: WARGA.email, klien: "x" }, "")],
  ] as const) {
    const sesiDihapus: unknown[] = [];
    const ubah = usersPalsu(t, [{ ...WARGA, password: "$2b$04$didaftarkanorang", email_verified_at: null }], { sesiDihapus });
    const hasil = await masuk();
    assert.equal("id" in hasil && hasil.id, WARGA.id, jenis);
    const data = (ubah[0] as { data: Record<string, unknown> }).data;
    assert.equal(data.password, null, `${jenis}: kata sandi pendaftar lain dicabut`);
    assert.ok(data.email_verified_at instanceof Date, `${jenis}: email kini terbukti`);
    assert.deepEqual(sesiDihapus, [{ where: { user_id: WARGA.id } }], `${jenis}: sesi lama dicabut`);
  }
});

test("penggunaGoogle: akun terverifikasi (mis. Laravel) tetap memegang kata sandi & sesinya", async (t) => {
  const sesiDihapus: unknown[] = [];
  const ubah = usersPalsu(t, [{ ...WARGA, password: "$2y$10$laravel", email_verified_at: new Date("2024-01-01") }], { sesiDihapus });
  await penggunaGoogle({ sub: "g-warga", email: WARGA.email, nama: null, foto: null });
  const data = (ubah[0] as { data: Record<string, unknown> }).data;
  assert.equal("password" in data, false);
  assert.equal("email_verified_at" in data, false);
  assert.equal(sesiDihapus.length, 0);
});

test("penggunaEmail: sandi benar = akun warga, salah/tanpa sandi = 401, staf = 403", async (t) => {
  const hash = await bcrypt.hash("rahasia-warga", 4);
  usersPalsu(t, [
    { ...WARGA, password: hash },
    { ...STAF, password: hash },
    { ...WARGA, id: BigInt(3), email: "google@contoh.id", password: null },
  ]);
  const ok = await penggunaEmail(WARGA.email, "rahasia-warga");
  assert.deepEqual(ok, { id: WARGA.id, name: WARGA.name, email: WARGA.email, image: null });
  for (const [email, sandi] of [
    [WARGA.email, "salah-sandi"],
    ["google@contoh.id", "rahasia-warga"],
    ["tidak-ada@contoh.id", "rahasia-warga"],
    ["bukan email", "rahasia-warga"],
  ]) {
    const r = await penggunaEmail(email, sandi);
    assert.equal("galat" in r && r.status, 401, email);
  }
  const staf = await penggunaEmail(STAF.email, "rahasia-warga");
  assert.equal("galat" in staf && staf.status, 403);
  const stafSalah = await penggunaEmail(STAF.email, "salah-sandi");
  assert.equal("galat" in stafSalah && stafSalah.status, 401, "peran tidak bocor tanpa sandi yang benar");
});

test("daftarEmail: email terdaftar 409 tanpa menyentuh akunnya; isian tidak sah 422", async (t) => {
  const dibuat: Record<string, unknown>[] = [];
  const ubah = usersPalsu(t, [WARGA], { dibuat });
  const sudah = await daftarEmail("Penyerobot", WARGA.email, "sandi-baru-123");
  assert.equal("galat" in sudah && sudah.status, 409);
  for (const [nama, email, sandi] of [
    ["  ", "baru@contoh.id", "sandi-baru-123"],
    ["Baru", "bukan-email", "sandi-baru-123"],
    ["Baru", "baru@contoh.id", "pendek"],
  ]) {
    const r = await daftarEmail(nama, email, sandi);
    assert.equal("galat" in r && r.status, 422, `${nama}/${email}/${sandi}`);
  }
  assert.equal(dibuat.length, 0);
  assert.equal(ubah.length, 0);
});

test("daftarEmail: akun warga baru, sandi di-hash bcrypt, email belum terverifikasi", async (t) => {
  const dibuat: Record<string, unknown>[] = [];
  usersPalsu(t, [], { dibuat });
  const r = await daftarEmail("  Siti Rahma  ", "siti@contoh.id", "sandi-siti-123");
  assert.equal("id" in r && r.email, "siti@contoh.id");
  const d = dibuat[0];
  assert.equal(d.name, "Siti Rahma");
  assert.equal(d.role, "commenter");
  assert.equal(d.email_verified_at, null);
  assert.notEqual(d.password, "sandi-siti-123");
  assert.ok(await bcrypt.compare("sandi-siti-123", String(d.password)));
});
