import { test } from "node:test";
import assert from "node:assert/strict";
import { orientasiKartu, bacaBerkasMedia } from "./media.ts";

/** Pemetaan pilihan orientasi peninjau → kolom events.orientation. */

test("potret dipetakan ke horizontal (foto memenuhi kartu)", () => {
  const media = [{ path: "fire/gambar/a.jpg", type: "image", orientasi: "potret" }];
  assert.equal(orientasiKartu(media), "horizontal");
});

test("lanskap dipetakan ke landscape (foto di bawah teks)", () => {
  const media = [{ path: "fire/gambar/a.jpg", type: "image", orientasi: "lanskap" }];
  assert.equal(orientasiKartu(media), "landscape");
});

test("pilihan pertama peninjau yang menang", () => {
  const media = [
    { path: "fire/gambar/a.jpg", type: "image", orientasi: "potret" },
    { path: "fire/gambar/b.jpg", type: "image", orientasi: "lanskap" },
  ];
  assert.equal(orientasiKartu(media), "horizontal");
});

test("lampiran tanpa pilihan orientasi jatuh ke landscape", () => {
  const media = [{ path: "fire/gambar/a.jpg", type: "image" }];
  assert.equal(orientasiKartu(media), "landscape");
});

test("media kosong, bukan larik, atau entri rusak tetap landscape", () => {
  assert.equal(orientasiKartu([]), "landscape");
  assert.equal(orientasiKartu(null), "landscape");
  assert.equal(orientasiKartu("bukan-larik"), "landscape");
  assert.equal(orientasiKartu([{ path: "" }]), "landscape");
});

test("bacaBerkasMedia mempertahankan data EXIF yang tersimpan di JSON DB", () => {
  const media = [
    {
      path: "fire/gambar/a.jpg",
      type: "image",
      exif: {
        lat: -3.584444,
        lng: 98.675833,
        waktu: "15 Agustus 2026 09.14",
      },
    },
  ];
  const terbaca = bacaBerkasMedia(media);
  assert.equal(terbaca.length, 1);
  assert.ok(terbaca[0].exif);
  assert.equal(terbaca[0].exif?.lat, -3.584444);
  assert.equal(terbaca[0].exif?.lng, 98.675833);
  assert.equal(terbaca[0].exif?.waktu, "15 Agustus 2026 09.14");
});
