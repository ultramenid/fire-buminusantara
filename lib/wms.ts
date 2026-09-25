/**
 * Layanan peta Simontini.
 *
 * Choropleth per PROVINSI. Layer kabupaten (KABUPATEN_STADI_2025) masih ada di
 * GeoServer yang sama; kalau suatu saat dikembalikan ke sana, yang berubah
 * bukan cuma nama layer — atributnya berbeda: kabupaten memakai level_4 (nama)
 * + luas, provinsi memakai level_3 (nama) + deforestas.
 */
import { cacheLife } from "next/cache";

export const WMS_URL = "https://aws.simontini.id/geoserver/wms";
export const WFS_URL = "https://aws.simontini.id/geoserver/wfs";
export const WMS_LAYER = "proteus:PROVINSI_STADI_2025";

export const BIDANG_NAMA = "level_3";
export const BIDANG_PULAU = "level_2";
export const BIDANG_LUAS = "deforestas";

/** Satu baris pada daftar "3 provinsi dengan kebakaran terluas". */
export type ProvinsiTeratas = {
  peringkat: number;
  nama: string;
  pulau: string;
  /** Sudah diformat id-ID; satuannya hektare, ditulis di komponennya. */
  luas: string;
};

/** Tiga provinsi dengan luas kebakaran terbesar. Urut menurun dengan null
 *  dikecualikan — tanpa filter itu server menaruh nilai kosong lebih dulu. */
/**
 * Pengambilan yang di-cache. SENGAJA tanpa try/catch: kalau GeoServer gagal,
 * galatnya harus lolos ke pemanggil supaya TIDAK ADA yang tersimpan. Menaruh
 * `catch { return [] }` di dalam sini berarti satu gangguan sesaat membekukan
 * daftar kosong selama sejam penuh.
 */
async function tigaTeratasTercache(): Promise<ProvinsiTeratas[]> {
  "use cache";
  // Dulu `next: { revalidate: 3600 }` pada fetch-nya. Di bawah Cache Components
  // opsi cache pada fetch pindah ke sini sebagai cacheLife; profil "hours"
  // adalah padanan terdekat satu jam. Angka luas kebakaran per provinsi
  // berubah paling cepat harian, jadi itu lebih dari cukup — dan tanpa cache
  // setiap kunjungan menunggu GeoServer.
  cacheLife("hours");

  const params = new URLSearchParams({
    service: "WFS", version: "1.1.0", request: "GetFeature",
    typeName: WMS_LAYER,
    propertyName: `${BIDANG_PULAU},${BIDANG_NAMA},${BIDANG_LUAS}`,
    sortBy: `${BIDANG_LUAS} D`,
    maxFeatures: "3",
    outputFormat: "application/json",
    CQL_FILTER: `${BIDANG_LUAS} IS NOT NULL`,
  });

  // Batas waktunya ada supaya layanan yang menggantung tidak ikut
  // menggantungkan render halaman — daftar kosong lebih baik.
  const r = await fetch(`${WFS_URL}?${params}`, {
    signal: AbortSignal.timeout(6000),
  });
  const data = await r.json();
  return (data?.features ?? []).map(
    (f: { properties: Record<string, string | number> }, i: number) => ({
      peringkat: i + 1,
      nama: String(f.properties[BIDANG_NAMA]),
      pulau: String(f.properties[BIDANG_PULAU]),
      luas: Math.round(Number(f.properties[BIDANG_LUAS])).toLocaleString("id-ID"),
    }),
  );
}

/** Satu baris daftar kabupaten rel kiri /peta. */
export type KabupatenTerluas = {
  nama: string;
  /** Nama provinsi seperti tertulis di layer (level_3) — dinormalkan ke nama
   *  peta oleh komponennya lewat namaProvinsiLokal. */
  provinsi: string;
  /** Sudah diformat id-ID; satuannya hektare. */
  luas: string;
};

export async function ambilTigaTeratas(): Promise<ProvinsiTeratas[]> {
  // Mode contoh (PETA_DUMMY=1): jangan panggil GeoServer, langsung statis.
  if (process.env.PETA_DUMMY === "1") {
    const { TERATAS_CONTOH } = await import("./contoh-peta");
    return TERATAS_CONTOH;
  }
  try {
    return await tigaTeratasTercache();
  } catch {
    return [];
  }
}
