import data from "./wilayah-data.json" with { type: "json" };

/**
 * Pembacaan wilayah dari kolom `location` sebuah kejadian.
 *
 * Tiga tabelnya di-port apa adanya dari FireController Laravel (diekstrak dari
 * sumbernya, bukan diketik ulang) supaya /fire di sini menghasilkan pulau,
 * provinsi, dan hitungan yang sama persis dengan versi lama.
 *
 * Perlu versi Inggris karena pencarian lokasi GeoServer di CMS menyimpan nama
 * berbahasa Inggris:
 *   "[Abadi Jaya][Sukmajaya][Depok City][West Java][Java][Indonesia][18900]"
 */
export const PROVINSI_KE_PULAU: Record<string, string> = data.PROVINSI_KE_PULAU;
const PULAU_ALIAS: Record<string, string> = data.PULAU_ALIAS;
const PROVINSI_PETA: Record<string, string> = data.PROVINSI_PETA;

/** Nama kanonik 34 provinsi yang digambar peta — nilai unik dari PROVINSI_PETA. */
export const PROVINSI_PETA_NAMA: string[] = [...new Set(Object.values(PROVINSI_PETA))];

/** Cocokkan dari nama terpanjang dulu: "North Sumatra" harus menang atas
 *  "Sumatra", dan "West Papua" atas "Papua". */
function cocokTerpanjang(lokasi: string, tabel: Record<string, string>): string | null {
  const kunci = Object.keys(tabel).sort((a, b) => b.length - a.length);
  const l = lokasi.toLowerCase();
  for (const k of kunci) {
    if (l.includes(k.toLowerCase())) return tabel[k];
  }
  return null;
}

export function inferPulau(lokasi: string | null): string | null {
  if (!lokasi?.trim()) return null;
  // Provinsi dicek lebih dulu; nama pulau baru jadi cadangan, sama urutannya
  // dengan versi PHP.
  return cocokTerpanjang(lokasi, PROVINSI_KE_PULAU) ?? cocokTerpanjang(lokasi, PULAU_ALIAS);
}

export function inferProvinsi(lokasi: string | null): string | null {
  if (!lokasi?.trim()) return null;
  return cocokTerpanjang(lokasi, PROVINSI_PETA);
}

/**
 * Lokasi untuk dibaca manusia.
 *
 * CMS menyimpan rangkaian berkurung; kurungnya dilepas, dirangkai koma, dan
 * segmen yang hanya angka (kode pos) dibuang. Lokasi yang diketik bebas
 * dilewatkan apa adanya.
 */
export function rapikanLokasi(lokasi: string | null): string | null {
  if (!lokasi?.trim()) return null;

  const cocok = [...lokasi.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1].trim());
  if (cocok.length === 0) return lokasi.trim();

  const bagian = cocok.filter((b) => b !== "" && !/^\d+$/.test(b));
  return bagian.length === 0 ? lokasi.trim() : bagian.join(", ");
}

/**
 * Bentuk banding nama provinsi.
 *
 * Layanan luar mengeja lain dari 34 nama kanonik peta ("Sumatra Utara",
 * "Daerah Istimewa Yogyakarta", "KEP. RIAU"), dan pengguna mengetik separuh
 * kata. Spasi ikut dibuang supaya "kal teng" tetap cocok dengan "Kalimantan
 * Tengah"; "kepulauan" TIDAK dibuang karena tanpa itu Kepulauan Riau jatuh ke
 * Riau.
 */
export function ringkasNamaProvinsi(nama: string): string {
  return nama
    .toLowerCase()
    .replace(/\bdaerah istimewa\b/g, "di")
    .replace(/\bkep\.?\b/g, "kepulauan")
    .replace(/\bsumatra\b/g, "sumatera")
    .replace(/[^a-z]+/g, "");
}

const LOKAL_MENURUT_RINGKAS = new Map(
  PROVINSI_PETA_NAMA.map((n) => [ringkasNamaProvinsi(n), n]),
);

/** Nama kanonik 34 provinsi peta untuk sebuah ejaan bebas; nama yang tidak
 *  dikenali dikembalikan apa adanya. */
export function namaProvinsiLokal(nama: string): string {
  return LOKAL_MENURUT_RINGKAS.get(ringkasNamaProvinsi(nama)) ?? nama;
}

/** Tab pulau pada pop-up berita. `isi` adalah nilai `pulau` pada payload
 *  berita yang ikut tab itu — Bali & Nusa Tenggara dibaca bersama Jawa,
 *  sesuai pengelompokan desain. */
export const PULAU_TAB = [
  { kunci: "Sumatra", label: "Sumatera", isi: ["Sumatra"] },
  { kunci: "Jawa", label: "Jawa, Bali, & Nusa Tenggara", isi: ["Jawa", "Bali-Nusa"] },
  { kunci: "Kalimantan", label: "Kalimantan", isi: ["Kalimantan"] },
  { kunci: "Sulawesi", label: "Sulawesi", isi: ["Sulawesi"] },
  { kunci: "Maluku", label: "Maluku", isi: ["Maluku"] },
  { kunci: "Papua", label: "Papua", isi: ["Papua"] },
] as const;

/** Tab mana yang sebaiknya terbuka untuk sebuah pulau. */
export function tabDariPulau(pulau: string | null): string | null {
  if (!pulau) return null;
  return PULAU_TAB.find((t) => (t.isi as readonly string[]).includes(pulau))?.kunci ?? null;
}

