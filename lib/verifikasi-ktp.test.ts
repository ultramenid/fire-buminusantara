import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import exifr from "exifr";
import { periksaEkyc, type PenyediaEkyc } from "./ekyc.ts";
import {
  BATAS_FOTO_BYTE, folderKtp, jawabanStatus, kedaluwarsa, kunciNik, putuskanVerifikasi, sapuKedaluwarsa,
  siapkanFoto, sidikNik, sisaHariPengajuan, UMUR_PENGAJUAN_MS,
} from "./verifikasi-ktp.ts";

/** NIK berbentuk sah (uji bentuknya di lib/nik.test.ts). */
const NIK_SAH = "3201011201900001";
const nikDengan = (i: number, dua: string) => NIK_SAH.slice(0, i) + dua + NIK_SAH.slice(i + 2);

// ── Sidik ────────────────────────────────────────────────────────────────────

const KUNCI = "kunci-uji-verifikasi-ktp-panjangnya-cukup";

test("sidikNik: HMAC-SHA256 hex — bukan sha256 polos yang bisa ditebak habis", () => {
  // Contoh HMAC-SHA256 yang dikenal luas: mengunci algoritmenya (bukan sha256 polos/HMAC lain).
  assert.equal(
    sidikNik("The quick brown fox jumps over the lazy dog", "key"),
    "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
  );
  const sidik = sidikNik(NIK_SAH, KUNCI);
  assert.match(sidik, /^[0-9a-f]{64}$/);
  assert.equal(sidikNik(NIK_SAH, KUNCI), sidik, "tetap untuk NIK & kunci yang sama");
  assert.notEqual(sidikNik(NIK_SAH, `${KUNCI}-lain`), sidik, "kunci lain = sidik lain");
  assert.notEqual(sidikNik(nikDengan(14, "02"), KUNCI), sidik, "NIK lain = sidik lain");
  assert.notEqual(sidik, createHash("sha256").update(NIK_SAH).digest("hex"));
});

test("kunciNik: produksi wajib KTP_NIK_SECRET ≥ 32 karakter (fail-closed); pengembangan punya cadangan", () => {
  const panjang = "r".repeat(32);
  assert.equal(kunciNik({ NODE_ENV: "production", KTP_NIK_SECRET: panjang }), panjang);
  assert.equal(kunciNik({ NODE_ENV: "production", KTP_NIK_SECRET: "r".repeat(31) }), null);
  assert.equal(kunciNik({ NODE_ENV: "production" }), null);
  assert.equal(kunciNik({ NODE_ENV: "development", KTP_NIK_SECRET: "pendek" }), "pendek");
  const cadangan = kunciNik({ NODE_ENV: "development" });
  assert.ok(cadangan && cadangan.length >= 32);
});

// ── Kedaluwarsa & status ─────────────────────────────────────────────────────

const KINI = new Date("2026-11-02T12:00:00Z");
const lalu = (ms: number) => new Date(KINI.getTime() - ms);
const HARI = 24 * 60 * 60_000;

test("kedaluwarsa: tepat 30 hari sudah kedaluwarsa, kurang 1 ms belum", () => {
  assert.equal(UMUR_PENGAJUAN_MS, 30 * HARI);
  assert.equal(kedaluwarsa(lalu(0), KINI), false);
  assert.equal(kedaluwarsa(lalu(30 * HARI - 1), KINI), false);
  assert.equal(kedaluwarsa(lalu(30 * HARI), KINI), true);
  assert.equal(kedaluwarsa(lalu(45 * HARI), KINI), true);
});

test("sisaHariPengajuan: dibulatkan ke atas, tidak pernah negatif", () => {
  assert.equal(sisaHariPengajuan(KINI, KINI), 30);
  assert.equal(sisaHariPengajuan(lalu(29 * HARI + 1), KINI), 1);
  assert.equal(sisaHariPengajuan(lalu(30 * HARI), KINI), 0);
  assert.equal(sisaHariPengajuan(lalu(40 * HARI), KINI), 0);
});

test("jawabanStatus: belum / menunggu / disetujui / ditolak, waktu ISO 8601", () => {
  const diajukan = lalu(2 * HARI);
  const diputuskan = lalu(HARI);
  assert.deepEqual(jawabanStatus(null, null, KINI), { status: "belum", alasan: null, diajukan: null, diputuskan: null });
  assert.deepEqual(
    jawabanStatus(null, { status: "menunggu", reason: null, created_at: diajukan, decided_at: null }, KINI),
    { status: "menunggu", alasan: null, diajukan: diajukan.toISOString(), diputuskan: null },
  );
  assert.deepEqual(
    jawabanStatus(null, { status: "ditolak", reason: "Foto buram.", created_at: diajukan, decided_at: diputuskan }, KINI),
    { status: "ditolak", alasan: "Foto buram.", diajukan: diajukan.toISOString(), diputuskan: diputuskan.toISOString() },
  );
  assert.deepEqual(
    jawabanStatus(diputuskan, { status: "disetujui", reason: null, created_at: diajukan, decided_at: diputuskan }, KINI),
    { status: "disetujui", alasan: null, diajukan: diajukan.toISOString(), diputuskan: diputuskan.toISOString() },
  );
});

test("jawabanStatus: menunggu yang kedaluwarsa = belum; tanda di akun menang atas baris", () => {
  const basi = { status: "menunggu" as const, reason: null, created_at: lalu(30 * HARI), decided_at: null };
  assert.equal(jawabanStatus(null, basi, KINI).status, "belum");
  // Baris disetujui tanpa tanda di akun (tak konsisten) tidak dianggap terverifikasi.
  assert.equal(jawabanStatus(null, { ...basi, status: "disetujui", created_at: lalu(HARI) }, KINI).status, "belum");
  assert.equal(jawabanStatus(lalu(HARI), null, KINI).status, "disetujui");
});

// ── Berkas & basis data tiruan ───────────────────────────────────────────────

type Baris = {
  id: bigint; user_id: bigint; status: string; nik: string | null; nik_hash: string;
  ktp_path: string | null; created_at: Date;
  method?: string | null; reason?: string | null; reviewer_id?: bigint | null; decided_at?: Date | null;
};
type Akun = { id: bigint; ktp_verified_at: Date | null; ktp_nik_hash: string | null };

/** Pencocok `where` Prisma secukupnya untuk kueri di lib/verifikasi-ktp.ts. */
function cocok(b: Record<string, unknown>, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === "OR") return (v as Record<string, unknown>[]).some((w) => cocok(b, w));
    if (k === "NOT") return !cocok(b, v as Record<string, unknown>);
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const o = v as { in?: unknown[]; lte?: Date };
      if (o.in) return o.in.includes(b[k]);
      if (o.lte) return (b[k] as Date).getTime() <= o.lte.getTime();
    }
    return b[k] === v;
  });
}

/** Prisma palsu lewat globalThis.prisma (dibaca lib/prisma.ts lebih dulu). */
function dbPalsu(t: { after: (f: () => void) => void }, baris: Baris[], akun: Akun[] = []) {
  const ruang = globalThis as { prisma?: unknown };
  const lama = ruang.prisma;
  t.after(() => void (ruang.prisma = lama));
  const pilih = <T extends object>(b: T) => ({ ...b });
  const db = {
    mobile_ktp_verifications: {
      findMany: async ({ where }: { where?: Record<string, unknown> }) => baris.filter((b) => cocok(b, where)).map(pilih),
      findUnique: async ({ where }: { where: { id: bigint } }) => {
        const b = baris.find((x) => x.id === where.id);
        return b ? pilih(b) : null;
      },
      deleteMany: async ({ where }: { where?: Record<string, unknown> }) => {
        const tetap = baris.filter((b) => !cocok(b, where));
        const n = baris.length - tetap.length;
        baris.splice(0, baris.length, ...tetap);
        return { count: n };
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Baris> }) => {
        const kena = baris.filter((b) => cocok(b, where));
        for (const b of kena) Object.assign(b, data);
        return { count: kena.length };
      },
    },
    users: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => akun.find((a) => cocok(a, where)) ?? null,
      update: async ({ where, data }: { where: { id: bigint }; data: Partial<Akun> }) => {
        const a = akun.find((x) => x.id === where.id);
        assert.ok(a, "akun ada");
        return Object.assign(a, data);
      },
    },
    $transaction: async (kerja: (tx: unknown) => Promise<unknown>) => kerja(db),
  };
  ruang.prisma = db;
}

/** KTP_DIR sementara berisi berkas bernama sah; dibersihkan setelah uji. */
async function folderUji(t: { after: (f: () => Promise<void>) => void }) {
  const folder = await mkdtemp(path.join(os.tmpdir(), "ktp-uji-"));
  const lama = process.env.KTP_DIR;
  process.env.KTP_DIR = folder;
  t.after(async () => {
    if (lama === undefined) delete process.env.KTP_DIR;
    else process.env.KTP_DIR = lama;
    await rm(folder, { recursive: true, force: true });
  });
  let n = 0;
  const berkas = async (umurMs = 0) => {
    const nama = `${(++n).toString(16).padStart(32, "0")}.jpg`;
    const jalur = path.join(folder, nama);
    await writeFile(jalur, "foto");
    if (umurMs) {
      const dulu = new Date(Date.now() - umurMs);
      await utimes(jalur, dulu, dulu);
    }
    return nama;
  };
  const isi = async () => (await readdir(folder)).sort();
  return { folder, berkas, isi };
}

test("folderKtp: bawaan privat/ktp; KTP_DIR di folder publik ditolak", () => {
  assert.equal(folderKtp({}), path.join(process.cwd(), "privat", "ktp"));
  assert.equal(folderKtp({ KTP_DIR: "/var/lib/ktp" }), "/var/lib/ktp");
  assert.equal(folderKtp({ KTP_DIR: "public/ktp" }), null);
  assert.equal(folderKtp({ KTP_DIR: path.join(process.cwd(), "media") }), null);
  assert.equal(folderKtp({ KTP_DIR: "./.next/ktp" }), null);
});

test("sapuKedaluwarsa: pengajuan menunggu ≥ 30 hari dihapus beserta fotonya; yang lain utuh", async (t) => {
  const f = await folderUji(t);
  const kini = new Date();
  const basi = [await f.berkas()];
  const segar = [await f.berkas()];
  const baris: Baris[] = [
    { id: BigInt(1), user_id: BigInt(10), status: "menunggu", nik: NIK_SAH, nik_hash: "a", ktp_path: basi[0], created_at: new Date(kini.getTime() - 30 * HARI) },
    { id: BigInt(2), user_id: BigInt(11), status: "menunggu", nik: NIK_SAH, nik_hash: "b", ktp_path: segar[0], created_at: new Date(kini.getTime() - 29 * HARI) },
    { id: BigInt(3), user_id: BigInt(12), status: "ditolak", nik: null, nik_hash: "c", ktp_path: null, created_at: new Date(kini.getTime() - 90 * HARI) },
  ];
  dbPalsu(t, baris);

  assert.equal(await sapuKedaluwarsa(kini), 1);
  assert.deepEqual(baris.map((b) => b.id), [BigInt(2), BigInt(3)], "hanya menunggu yang basi dihapus; keputusan lama tetap");
  assert.deepEqual(await f.isi(), [...segar].sort());
  assert.equal(await sapuKedaluwarsa(kini), 0, "sapuan kedua tidak menemukan apa pun");
});

test("sapuKedaluwarsa per akun: hanya akun itu, foto yatim tidak disentuh", async (t) => {
  const f = await folderUji(t);
  const kini = new Date();
  const milikA = [await f.berkas()];
  const milikB = [await f.berkas()];
  const yatim = await f.berkas(2 * 60 * 60_000);
  const umur = new Date(kini.getTime() - 31 * HARI);
  const baris: Baris[] = [
    { id: BigInt(1), user_id: BigInt(10), status: "menunggu", nik: NIK_SAH, nik_hash: "a", ktp_path: milikA[0], created_at: umur },
    { id: BigInt(2), user_id: BigInt(11), status: "menunggu", nik: NIK_SAH, nik_hash: "b", ktp_path: milikB[0], created_at: umur },
  ];
  dbPalsu(t, baris);

  assert.equal(await sapuKedaluwarsa(kini, BigInt(10)), 1);
  assert.deepEqual(baris.map((b) => b.id), [BigInt(2)]);
  assert.deepEqual(await f.isi(), [...milikB, yatim].sort());
});

test("sapuKedaluwarsa (antrean): foto yatim > 1 jam dihapus, yang baru ditulis dibiarkan", async (t) => {
  const f = await folderUji(t);
  const dipakai = [await f.berkas(3 * 60 * 60_000)];
  const yatimLama = await f.berkas(2 * 60 * 60_000);
  const yatimBaru = await f.berkas();
  await writeFile(path.join(f.folder, "bukan-foto-kita.txt"), "x");
  dbPalsu(t, [
    { id: BigInt(1), user_id: BigInt(10), status: "menunggu", nik: NIK_SAH, nik_hash: "a", ktp_path: dipakai[0], created_at: new Date() },
  ]);

  await sapuKedaluwarsa(new Date());
  const sisa = await f.isi();
  assert.ok(!sisa.includes(yatimLama), "yatim lama dihapus");
  assert.ok(sisa.includes(yatimBaru), "mungkin transaksinya belum selesai");
  assert.ok(dipakai.every((n) => sisa.includes(n)));
  assert.ok(sisa.includes("bukan-foto-kita.txt"), "nama yang tidak kita buat tidak disentuh");
});

// ── Keputusan ────────────────────────────────────────────────────────────────

test("putuskanVerifikasi: tolak tanpa alasan ditolak sebelum menyentuh basis data", async () => {
  const hasil = await putuskanVerifikasi(BigInt(1), { setuju: false, alasan: "   ", peninjauId: BigInt(1) });
  assert.equal(hasil.ok, false);
});

test("putuskanVerifikasi: setuju → tanda di akun, NIK & path dikosongkan, foto dihapus", async (t) => {
  const f = await folderUji(t);
  const foto = [await f.berkas()];
  const kini = new Date();
  const baris: Baris[] = [
    { id: BigInt(5), user_id: BigInt(20), status: "menunggu", nik: NIK_SAH, nik_hash: "sidik-a", ktp_path: foto[0], created_at: kini },
  ];
  const akun: Akun[] = [{ id: BigInt(20), ktp_verified_at: null, ktp_nik_hash: null }];
  dbPalsu(t, baris, akun);

  assert.deepEqual(await putuskanVerifikasi(BigInt(5), { setuju: true, metode: "petugas", peninjauId: BigInt(1) }, kini), { ok: true });
  assert.deepEqual(akun[0], { id: BigInt(20), ktp_verified_at: kini, ktp_nik_hash: "sidik-a" });
  assert.equal(baris[0].status, "disetujui");
  assert.equal(baris[0].method, "petugas");
  assert.equal(baris[0].reviewer_id, BigInt(1));
  assert.deepEqual([baris[0].nik, baris[0].ktp_path], [null, null]);
  assert.deepEqual(await f.isi(), []);

  const lagi = await putuskanVerifikasi(BigInt(5), { setuju: false, alasan: "x", peninjauId: BigInt(1) }, kini);
  assert.equal(lagi.ok, false, "yang sudah diputuskan tidak bisa diputuskan lagi");
});

test("putuskanVerifikasi: NIK sudah dipegang akun lain → gagal dengan pesan jelas, foto utuh", async (t) => {
  const f = await folderUji(t);
  const foto = [await f.berkas()];
  dbPalsu(
    t,
    [{ id: BigInt(6), user_id: BigInt(21), status: "menunggu", nik: NIK_SAH, nik_hash: "sidik-b", ktp_path: foto[0], created_at: new Date() }],
    [{ id: BigInt(21), ktp_verified_at: null, ktp_nik_hash: null }, { id: BigInt(99), ktp_verified_at: new Date(), ktp_nik_hash: "sidik-b" }],
  );
  const hasil = await putuskanVerifikasi(BigInt(6), { setuju: true, metode: "petugas", peninjauId: BigInt(1) });
  assert.equal(hasil.ok, false);
  assert.match(!hasil.ok ? hasil.galat : "", /NIK ini sudah dipakai akun lain/);
  // (Di DB sungguhan transaksinya digulung balik; di sini cukup: foto tidak dihapus.)
  assert.deepEqual(await f.isi(), [...foto].sort());
});

test("putuskanVerifikasi: tolak → alasan disimpan, foto & NIK hilang; pengajuan kedaluwarsa tak bisa diputuskan", async (t) => {
  const f = await folderUji(t);
  const foto = [await f.berkas()];
  const kini = new Date();
  const baris: Baris[] = [
    { id: BigInt(7), user_id: BigInt(22), status: "menunggu", nik: NIK_SAH, nik_hash: "c", ktp_path: foto[0], created_at: kini },
    { id: BigInt(8), user_id: BigInt(23), status: "menunggu", nik: NIK_SAH, nik_hash: "d", ktp_path: null, created_at: new Date(kini.getTime() - 30 * HARI) },
  ];
  dbPalsu(t, baris);

  assert.deepEqual(await putuskanVerifikasi(BigInt(7), { setuju: false, alasan: "  Foto buram.  ", peninjauId: BigInt(2) }, kini), { ok: true });
  assert.equal(baris[0].status, "ditolak");
  assert.equal(baris[0].reason, "Foto buram.");
  assert.equal(baris[0].method, "petugas");
  assert.deepEqual([baris[0].nik, baris[0].ktp_path], [null, null]);
  assert.deepEqual(await f.isi(), []);

  assert.equal((await putuskanVerifikasi(BigInt(8), { setuju: true, metode: "petugas", peninjauId: BigInt(2) }, kini)).ok, false);
});

// ── Foto kiriman ─────────────────────────────────────────────────────────────

const gambar = () => sharp({ create: { width: 16, height: 10, channels: 3, background: { r: 200, g: 40, b: 40 } } });

test("siapkanFoto: jenis dari magic byte (bukan nama/MIME), EXIF GPS dibuang", async () => {
  const berGps = await gambar()
    .withMetadata({ exif: { IFD3: { GPSLatitudeRef: "S", GPSLatitude: "3/1 35/1 4/1", GPSLongitudeRef: "E", GPSLongitude: "98/1 40/1 33/1" } } })
    .jpeg()
    .toBuffer();
  assert.ok(await exifr.gps(berGps), "prasyarat: berkas uji memang ber-GPS");
  const hasil = await siapkanFoto(new File([new Uint8Array(berGps)], "ktp.png", { type: "image/png" }), "Foto KTP");
  assert.ok(!("galat" in hasil));
  assert.equal(hasil.mime, "image/jpeg");
  assert.equal(await exifr.gps(hasil.isi).catch(() => undefined), undefined);

  for (const [buat, mime] of [[() => gambar().png(), "image/png"], [() => gambar().webp(), "image/webp"]] as const) {
    const r = await siapkanFoto(new File([new Uint8Array(await buat().toBuffer())], "x"), "Foto KTP");
    assert.equal("galat" in r ? r.galat : r.mime, mime);
  }
});

test("siapkanFoto: kosong, bukan gambar, HEIC, rusak, atau > 8 MB ditolak dengan pesan", async () => {
  const kosong = await siapkanFoto(null, "Foto KTP");
  assert.deepEqual(kosong, { galat: "Foto KTP wajib dilampirkan.", status: 400 });
  assert.deepEqual(await siapkanFoto("teks", "Foto KTP"), kosong);

  const palsu = await siapkanFoto(new File(["<svg/>"], "ktp.jpg", { type: "image/jpeg" }), "Foto KTP");
  assert.deepEqual(palsu, { galat: "Foto KTP harus berupa foto JPEG, PNG, atau WebP.", status: 400 });

  const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), Buffer.alloc(32)]);
  assert.equal((await siapkanFoto(new File([new Uint8Array(heic)], "a.heic"), "Foto KTP") as { status: number }).status, 400);

  const rusak = await siapkanFoto(new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x40, 0, 0])], "r.jpg"), "Foto KTP");
  assert.deepEqual(rusak, { galat: "Foto KTP rusak atau tidak terbaca.", status: 400 });

  const besar = new Uint8Array(BATAS_FOTO_BYTE + 1);
  besar.set([0xff, 0xd8, 0xff]);
  assert.deepEqual(await siapkanFoto(new File([besar], "b.jpg"), "Foto KTP"), { galat: "Foto KTP melebihi 8 MB.", status: 413 });
});

// ── eKYC ─────────────────────────────────────────────────────────────────────

test("periksaEkyc: tanpa EKYC_PROVIDER atau penyedia tak dikenal = tidak-tersedia (antrean petugas)", async (t) => {
  const lama = process.env.EKYC_PROVIDER;
  t.after(() => (lama === undefined ? delete process.env.EKYC_PROVIDER : (process.env.EKYC_PROVIDER = lama)));
  const masukan = { nik: NIK_SAH, nama: "Warga", ktp: { isi: Buffer.alloc(0), mime: "image/jpeg" } };
  const lolos: PenyediaEkyc = async () => ({ hasil: "lolos" });
  const hasil = async (daftar?: Record<string, PenyediaEkyc>) => (await periksaEkyc(masukan, daftar)).hasil;

  delete process.env.EKYC_PROVIDER;
  assert.equal(await hasil({ uji: lolos }), "tidak-tersedia");
  process.env.EKYC_PROVIDER = "belum-ditulis";
  assert.equal(await hasil({ uji: lolos }), "tidak-tersedia");
  assert.equal(await hasil(), "tidak-tersedia", "nama di luar daftar bawaan");

  process.env.EKYC_PROVIDER = "Uji";
  assert.equal(await hasil({ uji: lolos }), "lolos");
  assert.equal(await hasil({ uji: async () => ({ hasil: "ragu" }) }), "ragu");
  assert.equal(await hasil({ uji: async () => { throw new Error("jaringan"); } }), "tidak-tersedia");
  assert.equal(await hasil({ uji: async () => ({ hasil: "ya" as never }) }), "tidak-tersedia", "jawaban asing bukan lolos");
  const ocr = { hasil: "beda" as const, nik: NIK_SAH, skor: 0.8 };
  assert.deepEqual(await periksaEkyc(masukan, { uji: async () => ({ hasil: "gagal", ocr }) }), { hasil: "gagal", ocr });
});
