import { cacheLife, cacheTag } from "next/cache.js";
import { BAHASA, type Bahasa } from "./bahasa.ts";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.ts";
import { BAWAN_STATISTIK, type Statistik } from "./statistik.ts";

/** Kartu strip statistik landing, per bahasa. */
export type Sorotan = Record<Bahasa, Statistik[]>;

/** Banyak kartu tetap — sama dengan bawaan; form CMS mengisi sejumlah ini. */
export const JUMLAH_KARTU = BAWAN_STATISTIK.id.length;
const MAKS_NILAI = 40;
const MAKS_KETERANGAN = 300;

type Kartu = { nilai: string; keterangan: string };

function kartuSah(k: unknown): k is Kartu {
  const x = k as Partial<Kartu> | null;
  return typeof x?.nilai === "string" && x.nilai !== "" && typeof x.keterangan === "string" && x.keterangan !== "";
}

/** JSON dari basis data → Sorotan. Bahasa yang isinya rusak/kurang jatuh ke bawaannya. */
function rapikan(kartu: unknown): Sorotan {
  const hasil = {} as Sorotan;
  for (const b of BAHASA) {
    const daftar = (kartu as Record<string, unknown> | null)?.[b];
    hasil[b] = Array.isArray(daftar) && daftar.length === JUMLAH_KARTU && daftar.every(kartuSah)
      ? daftar.map(({ nilai, keterangan }) => ({ tanggal: "", label: "", nilai, keterangan }))
      : BAWAN_STATISTIK[b];
  }
  return hasil;
}

/** Satu baris hidup (id terkecil); kosong/gagal = bawaan. TAK PERNAH
 *  melempar: galat basis data (pool habis, tabel belum migrasi, dsb) hanya
 *  berarti isi bawaan — halaman publik tidak boleh 500 karenanya.
 *
 *  Di-cache dengan tag "sorotan", bukan cache dalam-memori per-instans
 *  (yang membuat simpanan CMS tak kunjung tampil di instans lain): aksi
 *  simpan CMS memanggil updateTag("sorotan"), jadi isi baru langsung
 *  tampil. Galat hanya di-cache sebentar supaya bawaan tidak tertahan. */
export async function ambilSorotan(): Promise<Sorotan> {
  "use cache";
  cacheTag("sorotan");
  try {
    const baris = await prisma.sorotan_statistik.findFirst({ orderBy: { id: "asc" }, select: { kartu: true } });
    cacheLife("hours");
    return rapikan(baris?.kartu ?? null);
  } catch {
    cacheLife("seconds");
    return rapikan(null);
  }
}

/** Simpan dari FormData CMS: `nilai_<bahasa>_<i>` dan `keterangan_<bahasa>_<i>`, semua wajib. */
export async function simpanSorotan(
  masukan: FormData,
): Promise<{ ok: true } | { ok: false; galat: string; bidang?: string }> {
  const kartu = {} as Record<Bahasa, Kartu[]>;
  for (const b of BAHASA) {
    kartu[b] = [];
    for (let i = 0; i < JUMLAH_KARTU; i++) {
      const nilai = String(masukan.get(`nilai_${b}_${i}`) ?? "").trim();
      const keterangan = String(masukan.get(`keterangan_${b}_${i}`) ?? "").trim();
      const nama = `Kartu ${i + 1} (${b.toUpperCase()})`;
      if (nilai === "" || nilai.length > MAKS_NILAI) {
        return { ok: false, galat: `${nama}: angka wajib diisi, maks. ${MAKS_NILAI} karakter.`, bidang: `nilai_${b}_${i}` };
      }
      if (keterangan === "" || keterangan.length > MAKS_KETERANGAN) {
        return { ok: false, galat: `${nama}: keterangan wajib diisi, maks. ${MAKS_KETERANGAN} karakter.`, bidang: `keterangan_${b}_${i}` };
      }
      kartu[b].push({ nilai, keterangan });
    }
  }

  const ada = await prisma.sorotan_statistik.findFirst({ orderBy: { id: "asc" }, select: { id: true } });
  const data = { kartu, updated_at: new Date() } satisfies Prisma.sorotan_statistikUncheckedCreateInput;
  if (ada) {
    await prisma.sorotan_statistik.update({ where: { id: ada.id }, data });
  } else {
    await prisma.sorotan_statistik.create({ data });
  }
  return { ok: true };
}
