import { titikDalamGeometri } from "./geometri.ts";
import { PUSAT_WILAYAH } from "./pusat-wilayah.ts";
// Relatif (bukan "@/...") + atribut JSON supaya modul ini tetap bisa diuji
// lewat node:test mentah — lihat lib/provinsi-titik.test.ts.
import petaProvinsi from "../public/data/peta-provinsi.json" with { type: "json" };
import { PROVINSI_PETA_NAMA, inferProvinsi } from "./wilayah.ts";

/**
 * Provinsi yang poligonnya menaungi titik — analisis titik dalam poligon atas poligon bawaan
 * (public/data/peta-provinsi.json, 34 provinsi yang sama dengan peta).
 *
 * SENGAJA tidak memakai database: ini lapis terakhir reverse-geocode yang
 * tetap bekerja saat PostGIS Simontini tak terjangkau, dan tanpa satu pun
 * round-trip jaringan. Kasar (level provinsi) tapi PASTI — bukan perkiraan
 * seperti "desa terdekat". Modul ini khusus server: poligon bawaan jangan
 * masuk bundle klien (lib/wilayah.ts yang dipakai komponen tidak boleh
 * mengimpornya).
 */
type FiturProvinsi = {
  properties: { nama?: unknown };
  geometry: Parameters<typeof titikDalamGeometri>[2];
};

export function provinsiDariTitik(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const fitur = (petaProvinsi as { features: FiturProvinsi[] }).features;
  if (!Array.isArray(fitur)) return null;

  for (const f of fitur) {
    const nama = f.properties?.nama;
    // Nama poligon harus salah satu dari 34 kanonik — jangan kembalikan
    // ejaan tak dikenal yang memecah hitungan peta.
    if (typeof nama !== "string" || !(PROVINSI_PETA_NAMA as string[]).includes(nama)) {
      continue;
    }

    // Bounding-box early-exit pre-filter: lewati provinsi yang titiknya jelas
    // berada di luar kotak pembatasnya untuk menghemat 90%+ kalkulasi titik sudut.
    const kotak = PUSAT_WILAYAH[nama]?.kotak;
    if (kotak && (lng < kotak[0] || lng > kotak[2] || lat < kotak[1] || lat > kotak[3])) {
      continue;
    }

    try {
      if (!f?.geometry || !titikDalamGeometri(lng, lat, f.geometry)) continue;
    } catch {
      continue; // Geometri rusak: lanjut ke provinsi berikut.
    }

    return nama;
  }
  return null;
}

/**
 * Peringatan kewajaran lokasi untuk peninjau laporan (kasus nyata: "S"
 * tertinggal ketik membuat 1.388°S tersimpan sebagai +1.388 — mental 300+ km
 * ke perbatasan Malaysia, dan promosi melabelinya desa terdekat yang salah
 * wilayah).
 *
 * Murni komputasi lokal (Turf + pencocokan teks), tanpa database — tidak
 * boleh memperlambat apalagi menggagalkan halaman verifikasi. `null` =
 * tidak ada yang mencurigakan. Dipakai di halaman rincian laporan CMS.
 */
export function peringatanLokasi(
  lat: number | null,
  lng: number | null,
  teks: string,
): string | null {
  if (lat === null || lng === null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const dariTitik = provinsiDariTitik(lat, lng);
  const dariTeks = inferProvinsi(teks);
  // Tanda lintang terbalik adalah pola galat yang paling sering sekaligus
  // paling jauh melesetnya — dicek eksplisit, bukan sekadar "beda".
  const dariBalik = provinsiDariTitik(-lat, lng);

  if (!dariTitik) {
    if (dariBalik && (!dariTeks || dariBalik === dariTeks)) {
      return `Titik di luar semua poligon provinsi — dan membalik tanda lintang jatuh tepat di ${dariBalik}` +
        (dariTeks ? " (cocok dengan teks laporan)" : "") +
        ". Kemungkinan huruf S/U tertinggal ketik; periksa pin sebelum menyetujui.";
    }
    if (dariTeks) {
      return `Titik di luar semua poligon provinsi, padahal teks laporan menyebut ${dariTeks} — periksa pin dan tanda koordinat (S/U) sebelum menyetujui.`;
    }
    return "Titik di luar semua poligon provinsi — periksa pin dan tanda koordinat (S/U) sebelum menyetujui.";
  }

  if (dariTeks && dariTeks !== dariTitik) {
    if (dariBalik === dariTeks) {
      return `Koordinat menunjuk ${dariTitik}, tapi teks laporan menyebut ${dariTeks} — dan membalik tanda lintang jatuh tepat di ${dariTeks}. Kemungkinan huruf S/U tertinggal ketik; periksa pin sebelum menyetujui.`;
    }
    return `Koordinat menunjuk ${dariTitik}, tapi teks laporan menyebut ${dariTeks} — salah satunya keliru; periksa pin sebelum menyetujui.`;
  }

  return null;
}
