import test from "node:test";
import assert from "node:assert/strict";
import {
  rapikanLokasi, inferProvinsi, inferPulau,
  ringkasNamaProvinsi, namaProvinsiLokal,
  tabDariPulau, PULAU_TAB,
} from "./wilayah.ts";

test("rapikanLokasi membuka kurung dan membuang kode pos", () => {
  assert.equal(
    rapikanLokasi("[Siding][Siding][Bengkayang][West Kalimantan][Kalimantan][Indonesia][38425]"),
    "Siding, Siding, Bengkayang, West Kalimantan, Kalimantan, Indonesia",
  );
});

test("rapikanLokasi melewatkan teks bebas dan null", () => {
  assert.equal(rapikanLokasi("sekitar Siding, Bengkayang"), "sekitar Siding, Bengkayang");
  assert.equal(rapikanLokasi(null), null);
  assert.equal(rapikanLokasi("   "), null);
});

test("inferProvinsi mengenali label EN hasil reverse-geocode", () => {
  assert.equal(
    inferProvinsi("[Lamon Satong][North Matan Hilir][Ketapang][West Kalimantan][Kalimantan][Indonesia][38928]"),
    "Kalimantan Barat",
  );
  assert.equal(inferProvinsi("sekitar Siding, Bengkayang, West Kalimantan"), "Kalimantan Barat");
  assert.equal(inferProvinsi("1.488590, 110.452240"), null);
  assert.equal(inferProvinsi(null), null);
});

test("inferPulau mengikuti provinsi", () => {
  assert.equal(inferPulau("sekitar Siding, Bengkayang, West Kalimantan"), "Kalimantan");
  assert.equal(inferPulau(null), null);
});

test("ringkasNamaProvinsi menyeragamkan ejaan luar", () => {
  assert.equal(ringkasNamaProvinsi("Sumatra Utara"), "sumaterautara");
  assert.equal(ringkasNamaProvinsi("KEP. RIAU"), "kepulauanriau");
});

test("namaProvinsiLokal meloloskan yang tak dikenal apa adanya", () => {
  // Hanya varian ejaan lokal yang dipetakan; nama Inggris bukan urusannya
  // (pencocokan EN ditangani PROVINSI_PETA di inferProvinsi).
  assert.equal(namaProvinsiLokal("Kalimantan Barat"), "Kalimantan Barat");
  assert.equal(namaProvinsiLokal("Atlantis"), "Atlantis");
});

test("tabDariPulau memetakan pulau ke tab yang sesuai", () => {
  assert.equal(tabDariPulau("Sumatra"), "Sumatra");
  assert.equal(tabDariPulau("Jawa"), "Jawa");
  assert.equal(tabDariPulau("Bali-Nusa"), "Jawa");
  assert.equal(tabDariPulau("Kalimantan"), "Kalimantan");
  assert.equal(tabDariPulau("Sulawesi"), "Sulawesi");
  assert.equal(tabDariPulau("Maluku"), "Maluku");
  assert.equal(tabDariPulau("Papua"), "Papua");
  assert.equal(tabDariPulau("Antartika"), null);
  assert.equal(tabDariPulau(null), null);
  assert.equal(PULAU_TAB.length, 6);
});

