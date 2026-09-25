// Backfill lokasi kejadian: mengoreksi `events.location` yang masih berupa
// koordinat mentah ("1.388094, 110.188716") atau label "sekitar …" warisan
// aturan lama (tebakan desa tetangga yang nama desanya beda) menjadi nama
// daerah menurut aturan baru: tepat (poligon desa) → provinsi geometri → angka.
//
// Aman dijalankan berulang: angka mentah hanya disentuh bila cocok dengan
// location_lat/lng-nya (bukti fallback, bukan ketikan admin); label "sekitar"
// dihitung ulang dan hanya ditulis bila hasilnya beda. Baris bernama dan
// ketikan manual selalu dilewati.
//
//   node prisma/backfill-lokasi.mjs           # DRY-RUN — hanya melihat
//   node prisma/backfill-lokasi.mjs --apply   # benar-benar menyimpan
//
// Butuh DATABASE_URL (MariaDB Pasopati) + GEO_* (PostGIS Simontini) yang
// menunjuk lingkungan yang benar. dotenv opsional seperti backfill-poster.
try {
  await import("dotenv/config");
} catch {
  /* env sudah ada di process.env */
}
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { Pool } from "pg";
import { titikDalamGeometri } from "../lib/geometri.ts";

const APPLY = process.argv.includes("--apply");

const url = new URL(process.env.DATABASE_URL);
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    connectionLimit: 5,
  }),
});

const kutip = (nama) => nama.split(".").map((b) => `"${b.replace(/"/g, '""')}"`).join(".");
const tabelGeo = process.env.GEO_LOCATION_TABLE;
const kolomNamaGeo = process.env.GEO_NAME_COLUMN;
const poolGeo =
  tabelGeo && kolomNamaGeo && process.env.GEO_DATABASE_URL
    ? new Pool({ connectionString: process.env.GEO_DATABASE_URL, max: 3 })
    : null;

/** Poligon 34 provinsi bawaan (public/data/peta-provinsi.json) + daftar nama
 *  kanoniknya — cermin lib/provinsi-titik.ts untuk lapis terakhir. */
let poligonProvinsi = null;
try {
  const geojson = JSON.parse(readFileSync(new URL("../public/data/peta-provinsi.json", import.meta.url), "utf8"));
  poligonProvinsi = Array.isArray(geojson?.features) ? geojson.features : [];
} catch {
  poligonProvinsi = [];
}
const PROVINSI_KANONIK = new Set([
  "Aceh", "Bali", "Banten", "Bengkulu", "DI Yogyakarta", "DKI Jakarta", "Gorontalo",
  "Jambi", "Jawa Barat", "Jawa Tengah", "Jawa Timur", "Kalimantan Barat",
  "Kalimantan Selatan", "Kalimantan Tengah", "Kalimantan Timur", "Kalimantan Utara",
  "Kepulauan Bangka Belitung", "Kepulauan Riau", "Lampung", "Maluku", "Maluku Utara",
  "Nusa Tenggara Barat", "Nusa Tenggara Timur", "Papua", "Papua Barat", "Riau",
  "Sulawesi Barat", "Sulawesi Selatan", "Sulawesi Tengah", "Sulawesi Tenggara",
  "Sulawesi Utara", "Sumatera Barat", "Sumatera Selatan", "Sumatera Utara",
]);

function provinsiDariTitik(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  for (const f of poligonProvinsi) {
    try {
      if (!f?.geometry || !titikDalamGeometri(lng, lat, f.geometry)) continue;
    } catch {
      continue;
    }
    if (typeof f.properties?.nama === "string" && PROVINSI_KANONIK.has(f.properties.nama)) {
      return f.properties.nama;
    }
  }
  return null;
}

/** Cermin logika berlapis lib/geo.ts (skrip .mjs tak bisa mengimpor TS):
 *  tepat → provinsi geometri → null. SENGAJA tanpa lapis "desa terdekat": nama
 *  desa tetangga yang beda wilayah menyesatkan — yang tak ter-cover data
 *  resmi cukup provinsi pasti, selebihnya angka + peringatan peninjau. */
async function namaDaerah(lat, lng) {
  if (poolGeo) {
    try {
      const T = kutip(tabelGeo);
      const tepat = await poolGeo.query(
        `SELECT ${kutip(kolomNamaGeo)} AS nama FROM ${T}
         WHERE ST_Contains(ST_Transform(geom, 4326),
                           ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326))
         LIMIT 1`,
        [lng, lat],
      );
      const nama = tepat.rows[0]?.nama;
      if (typeof nama === "string" && nama.trim() !== "") return nama.trim();
    } catch {
      /* DB geo gagal — jatuh ke lapis geometri di bawah */
    }
  }
  return provinsiDariTitik(lat, lng);
}

/** Fallback angka persis gaya promosiKeKejadian (6 desimal). */
function teksAngka(lat, lng) {
  return `${(Math.round(lat * 1e6) / 1e6).toFixed(6)}, ${(Math.round(lng * 1e6) / 1e6).toFixed(6)}`;
}

const POLA_ANGKA = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/;

const semua = await prisma.events.findMany({
  select: { id: true, location: true, location_lat: true, location_lng: true },
  orderBy: { id: "asc" },
});

let calon = 0, terkoreksi = 0, tetapAngka = 0;
for (const e of semua) {
  if (e.location_lat === null || e.location_lng === null) continue;
  const lat = Number(e.location_lat), lng = Number(e.location_lng);
  const teks = typeof e.location === "string" ? e.location.trim() : "";

  // Kandidat ada dua macam:
  // 1. Angka mentah yang cocok dengan koordinat tersimpan (bukti fallback).
  // 2. Label "sekitar …" warisan aturan lama — dihitung ulang dengan aturan
  //    baru (tanpa tebakan desa tetangga); yang hasilnya beda diperbarui.
  const cocok = teks.match(POLA_ANGKA);
  const warisan = teks.startsWith("sekitar ");
  if (!warisan) {
    if (!cocok) continue;
    // Angkanya harus cocok dengan koordinat tersimpan (toleransi pembulatan
    // 6 desimal ala promosiKeKejadian) — kalau tidak, itu ketikan orang.
    const [tLat, tLng] = [Number(cocok[1]), Number(cocok[2])];
    if (Math.abs(tLat - lat) > 2e-6) continue;
    if (Math.abs(tLng - lng) > 2e-6) continue;
  }

  calon++;
  const nama = (await namaDaerah(lat, lng).catch(() => null)) ?? teksAngka(lat, lng);
  if (nama === teks) {
    console.log(`#${e.id}: sudah benar ("${teks}")`);
    continue;
  }
  terkoreksi++;
  console.log(`#${e.id}: "${teks}" → "${nama}"`);
  if (APPLY) {
    await prisma.events.update({
      where: { id: e.id },
      data: { location: nama, updated_at: new Date() },
    });
  }
}

console.log(`\nRingkasan: ${calon} kandidat, ${terkoreksi} terkoreksi${APPLY ? " (tersimpan)" : " (dry-run)"}, ${tetapAngka} tetap angka.`);
await prisma.$disconnect();
await poolGeo?.end();
