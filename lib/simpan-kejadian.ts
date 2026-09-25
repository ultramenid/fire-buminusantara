import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { simpanBerkasGaleri, hapusBerkas } from "./unggah";
import { bacaBerkasMedia, orientasiKartu, type BerkasMedia } from "./media";
import { lokasiDariKoordinat } from "./geo";

/** Revalidasi cache halaman beranda dan locale saat data kejadian berubah. */
export function revalidasiKejadian() {
  try {
    revalidatePath("/[locale]", "page");
    revalidatePath("/id", "page");
    revalidatePath("/en", "page");
  } catch {}
}

export type HasilSimpan = { ok: true; id: number } | { ok: false; galat: string };

/** Slug dari judul, dijamin unik. Angka ditambahkan hanya kalau memang bentrok. */
export async function buatSlug(judul: string, kecualiId?: number): Promise<string> {
  const dasar = judul.toLowerCase().normalize("NFKD")
    .replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 200) || "kejadian";

  for (let n = 0; n < 50; n++) {
    const calon = n === 0 ? dasar : `${dasar}-${n + 1}`;
    const ada = await prisma.events.findUnique({ where: { slug: calon }, select: { id: true } });
    if (!ada || (kecualiId && Number(ada.id) === kecualiId)) return calon;
  }
  return `${dasar}-${Date.now()}`;
}

function angka(nilai: FormDataEntryValue | null): number | null {
  const n = Number(String(nilai ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

function berkasTerisi(nilai: FormDataEntryValue | null): File | null {
  return nilai instanceof File && nilai.size > 0 ? nilai : null;
}

/**
 * Susun galeri hasil form: yang lama dipertahankan hanya kalau kotak
 * "pertahankan"-nya masih tercentang, lalu berkas baru ditambahkan di
 * belakangnya.
 *
 * PENTING (Pencegahan Kehilangan Data): Berkas yang dilepas TIDAK LANGSUNG
 * dihapus di sini, melainkan dicatat ke dalam `dihapus`. Penghapusan fisik
 * dari S3 HANYA dilakukan setelah transaksi database berhasil di-commit.
 * Jika berkas baru gagal diunggah atau database gagal menyimpan, berkas lama
 * tetap utuh dan berkas baru yang sempat terunggah dibersihkan (rollback).
 */
async function susunGaleri(
  data: FormData,
  lama: BerkasMedia[],
): Promise<
  | { media: BerkasMedia[]; dihapus: BerkasMedia[]; baruDiupload: BerkasMedia[] }
  | { galat: string }
> {
  const keepEntries = data.getAll("keep_media").map((v) => String(v).trim());
  const simpanIndex = new Set(
    keepEntries.map((v) => Number(v)).filter(Number.isInteger),
  );
  const simpanPath = new Set(keepEntries);

  const media: BerkasMedia[] = [];
  const dihapus: BerkasMedia[] = [];
  const baruDiupload: BerkasMedia[] = [];

  for (const [i, berkas] of lama.entries()) {
    if (simpanIndex.has(i) || simpanPath.has(berkas.path)) {
      const ket = String(data.get(`media_desc_${i}`) ?? "").trim();
      // Keterangan kosong berarti sengaja dikosongkan — jangan pakai yang lama.
      media.push({ ...berkas, keterangan: ket || undefined });
    } else {
      // Tandai untuk dihapus NANTI setelah database berhasil di-commit
      dihapus.push(berkas);
    }
  }

  const kiriman = data.getAll("media_files");
  console.log("[Galeri] berkas diterima:", kiriman.length, kiriman.map((v) =>
    v instanceof File ? `${v.name} (${v.size}B, ${v.type})` : `bukan-File: ${typeof v}`));

  // Dipasangkan lewat indeks — bukan digeser saat berkas kosong dilewati —
  // supaya urutan keterangan selalu cocok dengan urutan kiriman berkasnya.
  const keteranganBaru = data.getAll("media_desc_baru").map((v) => String(v).trim());

  for (const [i, nilai] of kiriman.entries()) {
    const berkas = berkasTerisi(nilai);
    if (!berkas) {
      console.warn("[Galeri] entri dilewati (kosong atau bukan File)");
      continue;
    }
    const hasil = await simpanBerkasGaleri(berkas);
    if ("galat" in hasil) {
      // Rollback: bersihkan berkas yang sudah terlanjur diunggah di iterasi ini
      for (const b of baruDiupload) {
        await hapusBerkas(b.path);
        await hapusBerkas(b.poster);
      }
      return { galat: `Media galeri: ${hasil.galat}` };
    }
    const entri = { ...hasil, keterangan: keteranganBaru[i] || undefined };
    baruDiupload.push(entri);
    media.push(entri);
  }

  return { media, dihapus, baruDiupload };
}

/**
 * Simpan kejadian, untuk tambah maupun ubah.
 *
 * `mediaAwal` — galeri awal selain isi basis data: dipakai alur "verifikasi &
 * sunting" laporan warga, di mana lampiran laporan (sudah di MinIO) menjadi
 * galeri awal form tambah. Indeks `keep_media`/keterangan `media_desc_*` dari
 * form sejajar dengan urutan galeri yang ditampilkan, jadi media awal harus
 * persis yang dirender (galeriTersimpan dari media yang sama).
 */
export async function simpanKejadian(data: FormData, id?: number, mediaAwal?: BerkasMedia[]): Promise<HasilSimpan> {
  const judulId = String(data.get("title_id") ?? "").trim();
  const judulEn = String(data.get("title_en") ?? "").trim();
  const deskripsiId = String(data.get("description_id") ?? "").trim();
  const deskripsiEn = String(data.get("description_en") ?? "").trim();
  const lokasi = String(data.get("location") ?? "").trim();
  const tanggal = String(data.get("event_date") ?? "").trim();
  const lat = angka(data.get("location_lat"));
  const lng = angka(data.get("location_lng"));
  const orientasi = String(data.get("orientation") ?? "landscape");
  // Nilai asing diperlakukan sebagai draft: gagal ke arah TIDAK menayangkan.
  const status =
    data.get("status") === "published" ? ("published" as const) : ("draft" as const);

  if (!judulId || !judulEn) return { ok: false, galat: "Judul (ID) dan (EN) wajib diisi." };
  if (!lokasi) return { ok: false, galat: "Lokasi wajib diisi." };
  if (!tanggal) return { ok: false, galat: "Tanggal kejadian wajib diisi." };
  if (lat === null || lat < -90 || lat > 90) return { ok: false, galat: "Latitude harus antara -90 dan 90." };
  if (lng === null || lng < -180 || lng > 180) return { ok: false, galat: "Longitude harus antara -180 dan 180." };

  // Galeri lama dibaca dari basis data, bukan dari form: form hanya mengirim
  // indeks mana yang dipertahankan, jadi urutan acuannya harus sama dengan
  // yang dirender saat form dibuka. Pengecualian: mediaAwal dari laporan
  // warga (kejadian baru yang galerinya berasal dari lampiran laporan).
  const lama = mediaAwal ?? (id
    ? bacaBerkasMedia(
        (await prisma.events.findUnique({ where: { id }, select: { media: true } }))?.media,
      )
    : []);

  const galeri = await susunGaleri(data, lama);
  if ("galat" in galeri) return { ok: false, galat: galeri.galat };

  const slugDiminta = String(data.get("slug") ?? "").trim();
  let slug = slugDiminta || (await buatSlug(judulId, id));

  const isi = {
    title_id: judulId,
    title_en: judulEn,
    description_id: deskripsiId || null,
    description_en: deskripsiEn || null,
    slug,
    event_date: new Date(tanggal),
    location: lokasi,
    location_lat: lat,
    location_lng: lng,
    orientation: orientasi === "horizontal" ? ("horizontal" as const) : ("landscape" as const),
    status,
    media: galeri.media,
    updated_at: new Date(),
  };

  try {
    let idTersimpan: number;
    try {
      if (id) {
        const ubah = await prisma.events.update({ where: { id }, data: isi, select: { id: true } });
        idTersimpan = Number(ubah.id);
      } else {
        const baru = await prisma.events.create({
          data: { ...isi, created_at: new Date() },
          select: { id: true },
        });
        idTersimpan = Number(baru.id);
      }
    } catch (dbErr: unknown) {
      const msg = dbErr instanceof Error ? dbErr.message : "";
      // Jika terjadi tabrakan slug konkuren, coba sekali lagi dengan slug berakhiran acak
      if ((msg.includes("slug") || msg.includes("Unique constraint")) && !slugDiminta) {
        slug = `${slug.slice(0, 190)}-${Math.random().toString(36).slice(2, 6)}`;
        isi.slug = slug;
        if (id) {
          const ubah = await prisma.events.update({ where: { id }, data: isi, select: { id: true } });
          idTersimpan = Number(ubah.id);
        } else {
          const baru = await prisma.events.create({
            data: { ...isi, created_at: new Date() },
            select: { id: true },
          });
          idTersimpan = Number(baru.id);
        }
      } else {
        throw dbErr;
      }
    }

    // Database berhasil disimpan! Sekarang aman menghapus berkas lama dari S3
    for (const b of galeri.dihapus) {
      await hapusBerkas(b.path);
      await hapusBerkas(b.poster);
    }

    revalidasiKejadian();

    return { ok: true, id: idTersimpan };
  } catch (e) {
    // Database gagal: bersihkan berkas baru yang sempat terunggah ke S3 agar tidak jadi file yatim
    for (const b of galeri.baruDiupload) {
      await hapusBerkas(b.path);
      await hapusBerkas(b.poster);
    }
    return { ok: false, galat: e instanceof Error ? e.message : "Gagal menyimpan." };
  }
}

export type HasilPromosi = { ok: true; id: number } | { ok: false; galat: string };

/** Input minimal dari sebuah laporan publik yang dinaikkan jadi kejadian. */
export type LaporanPromosi = {
  title: string;
  /** Rapian kurator; kosong/null = perilaku lama dipakai. */
  title_en?: string | null;
  description: string | null;
  description_en?: string | null;
  location?: string | null;
  event_status?: string;
  media: unknown;
  location_lat: unknown;
  location_lng: unknown;
  created_at: Date | null;
};

/**
 * Naikkan laporan terverifikasi menjadi baris `events` baru.
 *
 * Laporan publik tidak punya kolom yang wajib ada di `events` (tanggal,
 * teks lokasi, judul EN, slug), jadi dipetakan dengan akal sehat:
 *  - judul EN memakai judulnya (laporan tidak pernah bilingua).
 *  - tanggal memakai waktu laporan dibuat.
 *  - teks lokasi memakai nama daerah hasil reverse-geocode dari koordinat
 *    laporan; kalau geo tak terjangkau atau titiknya di luar semua daerah,
 *    jatuh ke format "lat, lng" (atau "Lokasi tidak diketahui"). Wilayah/admin
 *    dapat mengubahnya belakangan.
 *  - lampiran laporan dibawa apa adanya ke kolom media (format sama).
 *  - orientasi kartu diambil dari pilihan potret/lanskap peninjau — tanpa itu
 *    kartunya selalu lanskap dan foto potret terpotong jelek di korsel.
 */
export async function promosiKeKejadian(
  laporan: LaporanPromosi,
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0] = prisma,
): Promise<HasilPromosi> {
  const lat = laporan.location_lat === null ? 0 : Number(laporan.location_lat);
  const lng = laporan.location_lng === null ? 0 : Number(laporan.location_lng);
  const diketahui = laporan.location_lat !== null && laporan.location_lng !== null;

  // Nama tempat pilihan kurator menang atas reverse geocode: ia melihat
  // lampirannya dan tahu di mana kejadiannya, layanan geocode hanya menebak
  // dari titik.
  const lokasiKurator = laporan.location?.trim() ?? "";

  let lokasi: string;
  if (lokasiKurator) {
    lokasi = lokasiKurator;
  } else if (!diketahui) {
    lokasi = "Lokasi tidak diketahui";
  } else {
    // Reverse geocode opsional & non-blokir: kegagalannya tidak boleh
    // menggagalkan kenaikan laporan, maka fallback ke koordinat mentah.
    lokasi =
      (await lokasiDariKoordinat(lat, lng)) ??
      `${(Math.round(lat * 1e6) / 1e6).toFixed(6)}, ${(Math.round(lng * 1e6) / 1e6).toFixed(6)}`;
  }

  const slug = await buatSlug(laporan.title);

  const dataKejadian = {
    title_id: laporan.title,
    // Tanpa rapian kurator, judul Indonesia disalin — situs berbahasa Inggris
    // lebih baik menampilkan judul asli daripada kolom kosong.
    title_en: laporan.title_en?.trim() || laporan.title,
    description_id: laporan.description || null,
    description_en: laporan.description_en?.trim() || null,
    slug,
    event_date: laporan.created_at ?? new Date(),
    location: lokasi,
    location_lat: lat,
    location_lng: lng,
    orientation: orientasiKartu(laporan.media),
    // Ditentukan kurator di form perapian laporan; bawaannya published,
    // jadi laporan yang diverifikasi tanpa disentuh tetap langsung tayang
    // seperti sebelumnya.
    status: laporan.event_status === "draft" ? ("draft" as const) : ("published" as const),
    media: laporan.media ?? undefined,
    image_en: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  try {
    try {
      const baru = await tx.events.create({
        data: dataKejadian,
        select: { id: true },
      });
      revalidasiKejadian();
      return { ok: true, id: Number(baru.id) };
    } catch (createErr: unknown) {
      const msg = createErr instanceof Error ? createErr.message : "";
      if (msg.includes("slug") || msg.includes("Unique constraint")) {
        // Retry otomatis dengan suffix acak jika slug bentrok di transaksi paralel
        dataKejadian.slug = `${slug.slice(0, 190)}-${Math.random().toString(36).slice(2, 6)}`;
        const baru = await tx.events.create({
          data: dataKejadian,
          select: { id: true },
        });
        revalidasiKejadian();
        return { ok: true, id: Number(baru.id) };
      }
      throw createErr;
    }
  } catch (e) {
    return { ok: false, galat: e instanceof Error ? e.message : "Gagal menaikkan laporan." };
  }
}

/**
 * Hapus kejadian dari basis data beserta revalidasi cache terkait.
 */
export async function hapusKejadian(id: number) {
  const hasil = await prisma.events.delete({ where: { id } });
  revalidasiKejadian();
  return hasil;
}
