import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AMBANG_OTOMATIS, bandingkanNik, type BarisOcr, keputusanOcr, modeOcr, nikDariOcr, periksaPaddleOcr,
} from "./ocr-ktp.ts";

const NIK = "3201014101900001"; // Jawa Barat, perempuan, lahir 01-01-90

/** Susunan baris khas KTP-el dari atas ke bawah, skor 0.98 kecuali disebut. */
const ktp = (barisNik: string | string[], skorNik = 0.97): BarisOcr[] => [
  { teks: "PROVINSI JAWA BARAT", skor: 0.99 },
  { teks: "KABUPATEN BOGOR", skor: 0.99 },
  ...[barisNik].flat().map((teks) => ({ teks, skor: skorNik })),
  { teks: "Nama : SITI AMINAH", skor: 0.98 },
  { teks: "Tempat/Tgl Lahir : BOGOR, 01-01-1990", skor: 0.96 },
  { teks: "Jenis Kelamin : PEREMPUAN Gol. Darah : O", skor: 0.95 },
  { teks: "Alamat : JL. MAWAR NO. 12", skor: 0.94 },
  { teks: "RT/RW : 001/002", skor: 0.93 },
  { teks: "Kel/Desa : CIBINONG", skor: 0.97 },
  { teks: "Berlaku Hingga : SEUMUR HIDUP", skor: 0.96 },
  { teks: "BOGOR", skor: 0.9 },
  { teks: "12-01-2015", skor: 0.92 },
];

test("nikDariOcr: tata letak KTP biasa — NIK dari baris berlabel, skor baris itu", () => {
  assert.deepEqual(nikDariOcr(ktp("NIK : 3201014101900001")), { nik: NIK, skor: 0.97 });
});

test("nikDariOcr: salah baca huruf↔angka dinormalkan hanya di token berangka", () => {
  assert.deepEqual(nikDariOcr(ktp("NIK 32O1O14lO19OOOO1", 0.71)), { nik: NIK, skor: 0.71 });
  assert.equal(nikDariOcr(ktp("NIK : 32Ol0l4IOI9OOOO|"))?.nik, NIK, "I, l, | → 1");
  assert.equal(nikDariOcr(ktp("NIK : 3ZO1O14lO19OOOO1"))?.nik, NIK, "Z → 2");
  assert.equal(nikDariOcr(ktp("NIK : 32O1OS4lO19OOOO1"))?.nik, "3201054101900001", "S → 5 (angka beda, tetap terbaca)");
  // Kata tanpa angka tidak pernah berubah jadi angka: "BOGOR", "SD", "DI", "O" (golongan darah).
  assert.equal(nikDariOcr([{ teks: "BOGOR SD DI O", skor: 0.99 }]), null);
});

test("nikDariOcr: titik dua & angka lebar keluaran PaddleOCR asli (NFKC)", () => {
  // Persis keluaran latin_PP-OCRv5_mobile_rec pada foto KTP spesimen: titik dua lebar U+FF1A.
  assert.deepEqual(nikDariOcr(ktp("NIK\uFF1A3201014101900001", 0.988)), { nik: NIK, skor: 0.988 });
  assert.equal(nikDariOcr(ktp("NIK\uFF1A\uFF13\uFF12\uFF10\uFF11014101900001"))?.nik, NIK, "angka lebar");
});

test("nikDariOcr: label menempel, salah baca label, dan angka berspasi", () => {
  assert.equal(nikDariOcr(ktp("NIK:3201014101900001"))?.nik, NIK);
  assert.equal(nikDariOcr(ktp("NIK3201014101900001"))?.nik, NIK);
  assert.equal(nikDariOcr(ktp("NlK : 3201 0141 0190 0001"))?.nik, NIK);
  assert.equal(nikDariOcr(ktp("N1K = 3201-0141-0190-0001"))?.nik, NIK);
});

test("nikDariOcr: angka terpotong ke baris berikutnya disambung; skor terendah dipakai", () => {
  assert.deepEqual(nikDariOcr(ktp(["NIK : 32010141", "01900001"], 0.95)), { nik: NIK, skor: 0.95 });
  const terpotong: BarisOcr[] = [{ teks: "NIK : 32010141", skor: 0.99 }, { teks: "01900001", skor: 0.8 }];
  assert.deepEqual(nikDariOcr(terpotong), { nik: NIK, skor: 0.8 });
});

test("nikDariOcr: setelah label, salah baca yang tak lolos bentuk NIK tetap dilaporkan (jadi 'beda')", () => {
  // Nomor urut 0000 tidak ada — angka terakhir salah baca, tapi itu tetap NIK di foto.
  assert.equal(nikDariOcr(ktp("NIK : 3201014101900000"))?.nik, "3201014101900000");
});

test("nikDariOcr: tanpa label — hanya 16 angka yang lolos bentuk NIK; deret panjang dicari jendelanya", () => {
  const tanpaLabel = ktp("3201014101900001").filter((b) => !b.teks.startsWith("NIK"));
  assert.equal(nikDariOcr(tanpaLabel)?.nik, NIK);
  assert.equal(nikDariOcr([{ teks: "1234567890123456", skor: 0.99 }]), null, "bukan bentuk NIK, tanpa label");
  assert.equal(nikDariOcr(ktp("NIK 32010141019000012"))?.nik, NIK, "17 angka: jendela pertama yang sah");
  assert.equal(nikDariOcr([]), null);
  assert.equal(nikDariOcr(ktp("NIK :")), null, "label tanpa angka, tidak ada NIK lain");
});

test("bandingkanNik: cocok / beda / tak_terbaca", () => {
  assert.deepEqual(bandingkanNik({ nik: NIK, skor: 0.97 }, NIK), { hasil: "cocok", nik: NIK, skor: 0.97 });
  assert.deepEqual(bandingkanNik({ nik: "3201014101900002", skor: 0.9 }, NIK), { hasil: "beda", nik: "3201014101900002", skor: 0.9 });
  assert.deepEqual(bandingkanNik(null, NIK), { hasil: "tak_terbaca", nik: null, skor: null });
});

test("modeOcr: bawaan 'bantu'; hanya 'otomatis' yang mengubahnya", () => {
  assert.equal(modeOcr({}), "bantu");
  assert.equal(modeOcr({ KTP_OCR_MODE: " Otomatis " }), "otomatis");
  assert.equal(modeOcr({ KTP_OCR_MODE: "auto" }), "bantu");
});

test("keputusanOcr: mode bantu tak pernah memutuskan; otomatis hanya cocok ≥ ambang; tak pernah menolak", () => {
  const cocok = (skor: number) => ({ hasil: "cocok" as const, nik: NIK, skor });
  assert.equal(AMBANG_OTOMATIS, 0.9);
  assert.equal(keputusanOcr(cocok(0.99), "bantu").hasil, "ragu");
  assert.equal(keputusanOcr(cocok(0.9), "otomatis").hasil, "lolos");
  assert.equal(keputusanOcr(cocok(0.89), "otomatis").hasil, "ragu");
  for (const mode of ["bantu", "otomatis"] as const) {
    assert.equal(keputusanOcr({ hasil: "beda", nik: "3201014101900002", skor: 0.99 }, mode).hasil, "gagal", "beda → petugas, bukan tolak");
    assert.equal(keputusanOcr({ hasil: "tak_terbaca", nik: null, skor: null }, mode).hasil, "ragu");
    assert.equal(keputusanOcr({ hasil: "gagal", nik: null, skor: null }, mode).hasil, "tidak-tersedia");
  }
  assert.deepEqual(keputusanOcr(cocok(0.95), "otomatis").ocr, cocok(0.95), "catatan OCR ikut untuk lencana");
});

// ── Adaptor HTTP ─────────────────────────────────────────────────────────────

const masukan = {
  nik: NIK,
  nama: "Siti",
  ktp: { isi: Buffer.from([0xff, 0xd8, 0xff, 1, 2]), mime: "image/jpeg" },
  sinyal: new AbortController().signal,
};
const ENV = { OCR_URL: "http://ocr-ktp:8866/", OCR_KUNCI: "kunci-ocr-uji" };

test("periksaPaddleOcr: kirim foto KTP ke /ocr dengan kunci, baca NIK, bandingkan", async () => {
  let diminta: { url: string; kunci: string | null; gambar: Blob | null } | null = null;
  const ambil = (async (url: string, init: RequestInit) => {
    const isi = init.body as FormData;
    diminta = { url, kunci: new Headers(init.headers).get("x-kunci-ocr"), gambar: isi.get("gambar") as Blob | null };
    return Response.json({ baris: ktp("NIK : 3201014101900001", 0.96).map(({ teks, skor }) => ({ teks, skor })) });
  }) as unknown as typeof fetch;

  const bantu = await periksaPaddleOcr(masukan, ENV, ambil);
  assert.deepEqual(bantu, { hasil: "ragu", ocr: { hasil: "cocok", nik: NIK, skor: 0.96 } });
  assert.ok(diminta);
  const d = diminta as { url: string; kunci: string | null; gambar: Blob | null };
  assert.equal(d.url, "http://ocr-ktp:8866/ocr");
  assert.equal(d.kunci, "kunci-ocr-uji");
  assert.equal(d.gambar?.size, 5);
  assert.equal(d.gambar?.type, "image/jpeg");

  const otomatis = await periksaPaddleOcr(masukan, { ...ENV, KTP_OCR_MODE: "otomatis" }, ambil);
  assert.equal(otomatis.hasil, "lolos");
});

test("periksaPaddleOcr: layanan mati, galat HTTP, jawaban rusak, atau belum disetel → 'gagal' (antrean petugas)", async () => {
  const GAGAL = { hasil: "tidak-tersedia", ocr: { hasil: "gagal", nik: null, skor: null } };
  const putus = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
  const http = (async () => new Response("x", { status: 401 })) as unknown as typeof fetch;
  const rusak = (async () => Response.json({ teks: "bukan bentuknya" })) as unknown as typeof fetch;
  assert.deepEqual(await periksaPaddleOcr(masukan, ENV, putus), GAGAL);
  assert.deepEqual(await periksaPaddleOcr(masukan, ENV, http), GAGAL);
  assert.deepEqual(await periksaPaddleOcr(masukan, ENV, rusak), GAGAL);
  const takDipanggil = (async () => assert.fail("tidak boleh memanggil layanan")) as unknown as typeof fetch;
  assert.deepEqual(await periksaPaddleOcr(masukan, { OCR_URL: ENV.OCR_URL }, takDipanggil), GAGAL);
  assert.deepEqual(await periksaPaddleOcr(masukan, { OCR_KUNCI: ENV.OCR_KUNCI }, takDipanggil), GAGAL);
});

test("periksaPaddleOcr: baris berbentuk salah dilewati, sisanya tetap dibaca", async () => {
  const ambil = (async () => Response.json({ baris: [{ teks: 5 }, null, { teks: "NIK : 3201014101900001", skor: 0.93 }] })) as unknown as typeof fetch;
  assert.deepEqual((await periksaPaddleOcr({ ...masukan, nik: "3201014101900002" }, ENV, ambil)).ocr, {
    hasil: "beda", nik: NIK, skor: 0.93,
  });
});
