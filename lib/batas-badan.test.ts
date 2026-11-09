import { test } from "node:test";
import assert from "node:assert/strict";
import { BATAS_BADAN, bacaFormData, bacaJson } from "./batas-badan.ts";

const minta = (badan: BodyInit | null, kepala: Record<string, string> = {}) =>
  new Request("http://situs.uji/api", { method: "POST", body: badan, headers: kepala, duplex: "half" } as RequestInit);

/** Badan stream (chunked): Content-Length tidak dihitung otomatis dari isinya. */
const aliran = (bagian: string[]) =>
  new ReadableStream<Uint8Array>({
    start(k) {
      for (const b of bagian) k.enqueue(new TextEncoder().encode(b));
      k.close();
    },
  });

test("bacaJson: objek JSON kecil terbaca", async () => {
  const teks = JSON.stringify({ isi: "halo", n: 1 });
  assert.deepEqual(await bacaJson(minta(teks, { "content-length": String(teks.length) })), { isi: "halo", n: 1 });
});

test("bacaJson: JSON rusak, kosong, atau bukan objek → null", async () => {
  assert.equal(await bacaJson(minta("{rusak", { "content-length": "6" })), null);
  assert.equal(await bacaJson(minta("", { "content-length": "0" })), null);
  assert.equal(await bacaJson(minta("5", { "content-length": "1" })), null);
});

test("bacaJson: Content-Length hilang, bukan angka, atau di atas batas → 413", async () => {
  for (const kepala of [{}, { "content-length": "abc" }, { "content-length": String(BATAS_BADAN + 1) }] as Record<string, string>[]) {
    const r = await bacaJson(minta(aliran(["{}"]), kepala));
    assert.ok(r instanceof Response);
    assert.equal(r.status, 413);
    assert.equal((await r.json()).galat, "Kiriman terlalu besar.");
  }
});

test("bacaJson: header berbohong (chunked lebih besar dari klaimnya) → 413 begitu atap terlewati", async () => {
  const besar = `{"isi":"${"a".repeat(BATAS_BADAN)}"}`;
  const r = await bacaJson(minta(aliran([besar.slice(0, 100), besar.slice(100)]), { "content-length": "10" }));
  assert.ok(r instanceof Response);
  assert.equal(r.status, 413);
});

test("bacaJson: tepat di batas masih diterima", async () => {
  const teks = `{"isi":"${"a".repeat(BATAS_BADAN - 10)}"}`;
  assert.equal(teks.length, BATAS_BADAN);
  const r = await bacaJson(minta(teks, { "content-length": String(teks.length) }));
  assert.equal((r as Record<string, unknown>).isi, "a".repeat(BATAS_BADAN - 10));
});

/** Badan multipart sungguhan (boundary dari Request) beserta Content-Type-nya. */
async function multipart(isi: FormData) {
  const r = new Request("http://situs.uji/api", { method: "POST", body: isi });
  return { badan: new Uint8Array(await r.arrayBuffer()), jenis: r.headers.get("content-type")! };
}

test("bacaFormData: multipart di bawah batas terbaca, tanpa Content-Length pun (chunked)", async () => {
  const isi = new FormData();
  isi.set("nik", "3201011201900001");
  isi.set("ktp", new File([new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])], "ktp.jpg", { type: "image/jpeg" }));
  const { badan, jenis } = await multipart(isi);

  const dengan = await bacaFormData(minta(badan, { "content-type": jenis, "content-length": String(badan.length) }), 4096);
  assert.ok(dengan instanceof FormData);
  assert.equal(dengan.get("nik"), "3201011201900001");
  assert.equal((dengan.get("ktp") as File).size, 6);

  const tanpa = await bacaFormData(minta(new Blob([badan]).stream(), { "content-type": jenis }), 4096);
  assert.ok(tanpa instanceof FormData);
});

test("bacaFormData: Content-Length di atas batas → 413 sebelum dibaca; header berbohong → 413 saat atap terlewati", async () => {
  const isi = new FormData();
  isi.set("ktp", new File([new Uint8Array(5000)], "ktp.jpg"));
  const { badan, jenis } = await multipart(isi);

  const klaim = await bacaFormData(minta(badan, { "content-type": jenis, "content-length": String(badan.length) }), 4096);
  assert.ok(klaim instanceof Response);
  assert.equal(klaim.status, 413);

  const bohong = await bacaFormData(minta(new Blob([badan]).stream(), { "content-type": jenis, "content-length": "100" }), 4096);
  assert.ok(bohong instanceof Response);
  assert.equal(bohong.status, 413);
});

test("bacaFormData: bukan multipart atau rusak → null", async () => {
  assert.equal(await bacaFormData(minta("{}", { "content-type": "application/json", "content-length": "2" }), 4096), null);
  assert.equal(await bacaFormData(minta("--x\r\nrusak", { "content-type": "multipart/form-data; boundary=x" }), 4096), null);
});
