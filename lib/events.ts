import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "./prisma";
import { bagiRelKanan } from "./rel-kanan";
import { inferPulau, inferProvinsi, rapikanLokasi, PROVINSI_PETA_NAMA } from "./wilayah";
import { urlMedia, itemMedia, type ItemMedia } from "./media";
import type { Bahasa } from "./bahasa";

/** Bentuk satu kartu berita, sama persis dengan payload FireController lama. */
export type Berita = {
  id: number;
  slug: string | null;
  pulau: string | null;
  /** Provinsi kanonik (34 nama peta) dari kolom location — pop-up wilayah
   *  menyaring daftar per provinsi yang ditekan, bukan se-pulau. */
  provinsi: string | null;
  tanggal: string;
  judul: string;
  /** Thumbnail asli kejadian (sama dengan `poster`), null kalau tidak ada —
   *  tidak memakai foto dummy. Komponen menampilkan placeholder sendiri. */
  gambar: string | null;
  alt: string;
  video: string | null;
  /** Poster video: HANYA thumbnail asli kejadian ini, tanpa cadangan. Kalau
   *  memakai gambar bawaan, setiap video yang thumbnail-nya gagal dibuat tampil
   *  dengan foto yang sama dan terlihat seolah kartunya tertukar. */
  poster: string | null;
  lokasi: string | null;
  /** Koordinat kejadian — kolomnya NOT NULL di basis data, selalu ada. */
  lat: number;
  lng: number;
  /** Deskripsi laporan (description_id), ditampilkan di pop-up rincian. */
  deskripsi: string | null;
  /** Galeri media untuk slider kartu dan pop-up. Selalu terisi selama kejadian
   *  punya media apa pun — `gambar`/`video` di atas dipertahankan supaya
   *  pemakai lama payload ini (mis. daftar di pop-up peta) tidak perlu ikut
   *  berubah. */
  media: ItemMedia[];
  /** true = foto memenuhi bingkai kartu, judul menumpang putih di atasnya. */
  vertikal: boolean;
  /** Jumlah komentar tersetujui — hanya diisi ambilUmpan (urutan "komentar
   *  terbanyak" di umpan). Kosong di sumber lain, dibaca sebagai 0. */
  jumlahKomentar?: number;
};

/** Pemformat tanggal per bahasa — dipilih sesuai locale, bukan hardcode id-ID.
 *  Inggris tidak disediakan Intl khusus supaya hasilnya konsisten di server. */
const tanggalPerBahasa: Record<Bahasa, Intl.DateTimeFormat> = {
  id: new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }),
  en: new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", year: "numeric" }),
};

/** Kolom yang selalu dibaca, apa pun bahasanya — versi EN dibaca bersamaan
 *  supaya PILIH tidak perlu bercabang per bahasa; kosong/null jatuh kembali
 *  ke versi Indonesia di keBerita. */
const PILIH = {
  id: true, slug: true, title_id: true, title_en: true,
  description_id: true, description_en: true, event_date: true, location: true,
  location_lat: true, location_lng: true,
  image_id: true, image_en: true, video: true, media: true, orientation: true,
} as const;

type Baris = {
  id: bigint; slug: string | null; title_id: string; title_en: string;
  description_id: string | null; description_en: string | null;
  event_date: Date; location: string; location_lat: unknown; location_lng: unknown;
  image_id: string | null; image_en: string | null; video: string | null;
  media: unknown;
  orientation: string;
};

/** Versi Inggris yang dipakai: teks EN hanya kalau tidak kosong — kosong atau
 *  null jatuh kembali ke Indonesia supaya kartu EN tak pernah tampil kosong. */
function enAtauId(en: string | null | undefined, id: string): string {
  return en?.trim() ? en : id;
}

function keBerita(e: Baris, bahasa: Bahasa): Berita {
  const mediaList = itemMedia(e.media, e.image_id, e.video);
  // Judul/deskripsi/alt sesuai bahasa — EN kosong kembali ke ID (fallback).
  const judul = bahasa === "en" ? enAtauId(e.title_en, e.title_id) : e.title_id;
  const deskripsi =
    bahasa === "en" ? enAtauId(e.description_en, e.description_id ?? "") : e.description_id;
  // Thumbnail kejadian: gambar utama versi bahasa (EN kosong → ID) → foto
  // galeri → poster video (urutan sama dengan pratinjau admin). Fallback
  // poster video menjaga kejadian yang hanya bervideo tetap punya thumbnail
  // untuk pratinjau bagikan (og:image) — tanpa itu, tautannya dibagikan tanpa
  // gambar sama sekali.
  const poster =
    urlMedia(bahasa === "en" ? (e.image_en?.trim() ? e.image_en : e.image_id) : e.image_id) ??
    (mediaList.find((m) => m.jenis === "gambar")?.url ?? null) ??
    mediaList.find((m) => m.poster)?.poster ??
    null;

  return {
    // BigInt tidak bisa lewat JSON.stringify, dan payload ini menyeberang ke
    // komponen klien — jadi dijadikan number di sini, sekali.
    id: Number(e.id),
    slug: e.slug,
    pulau: inferPulau(e.location),
    provinsi: inferProvinsi(e.location),
    tanggal: tanggalPerBahasa[bahasa].format(e.event_date),
    judul,
    // Payload ini menyeberang ke komponen klien; tanpa foto asli, `gambar`
    // dibiarkan null — tidak ada foto dummy lagi. Yang memakainya (mis. kartu
    // dan pop-up) menampilkan placeholder sendiri.
    gambar: poster,
    alt: judul,
    video: urlMedia(e.video),
    poster,
    lokasi: rapikanLokasi(e.location),
    // Decimal Prisma, bukan number — dijadikan number sekali di sini seperti id.
    lat: Number(e.location_lat),
    lng: Number(e.location_lng),
    deskripsi,
    media: mediaList,
    vertikal: e.orientation === "horizontal",
  };
}

/** Sepuluh kejadian terbaru untuk korsel dan pop-up peta. */
/**
 * Saringan tayang. SATU tempat kebenaran untuk semua kueri publik di berkas
 * ini: kejadian berstatus draft tersimpan di CMS tapi tidak boleh bocor ke
 * korsel, permalink, sitemap, maupun angka peta.
 *
 * Kueri CMS SENGAJA tidak memakainya — kurator justru harus melihat draft.
 */
export const TAYANG = { status: "published" } as const;

/** Jumlah kartu umpan yang ikut di HTML halaman; sisanya diambil klien dari
 *  /api/umpan supaya muatan awal tidak membengkak seiring arsip. */
export const UMPAN_AWAL = 24;

/**
 * Kejadian untuk korsel beranda, urutan CAMPURAN "terbaru + komentar terbanyak":
 * kartu pertama (yang disorot di TENGAH korsel) adalah kejadian PALING BARU,
 * lalu sisanya diurut dari yang KOMENTARNYA PALING BANYAK (seri → yang lebih
 * baru dulu). Jadi pengunjung langsung melihat laporan terbaru, sekaligus
 * laporan-laporan yang paling ramai dibahas.
 */
export async function ambilBerita(bahasa: Bahasa = "id", limit = 10): Promise<Berita[]> {
  const [semua, hitung] = await Promise.all([
    // event_date bisa seri (beberapa laporan setanggal) — id menaik dipakai
    // pemecah seri supaya "paling baru" benar-benar yang terakhir dibuat.
    prisma.events.findMany({
      where: TAYANG,
      take: Math.max(limit * 2, 100),
      orderBy: [{ event_date: "desc" }, { id: "desc" }],
      select: PILIH,
    }),
    // Komentar bersifat polimorfik (commentable_type/_id ala Laravel), bukan
    // relasi Prisma — jadi jumlahnya dihitung terpisah lewat groupBy.
    prisma.comments.groupBy({
      by: ["commentable_id"],
      where: { commentable_type: "App\\Models\\Event", is_approved: true, commentable_id: { not: null } },
      _count: true,
    }),
  ]);

  const jumlahKomentar = new Map<number, number>();
  for (const h of hitung) {
    if (h.commentable_id != null) jumlahKomentar.set(Number(h.commentable_id), h._count);
  }
  const komentar = (b: (typeof semua)[number]) => jumlahKomentar.get(Number(b.id)) ?? 0;

  // semua sudah desc menurut tanggal → elemen [0] adalah yang terbaru.
  const [terbaru, ...sisa] = semua;
  sisa.sort((a, b) => {
    const beda = komentar(b) - komentar(a); // komentar terbanyak dulu
    if (beda !== 0) return beda;
    const bedaTgl = b.event_date.getTime() - a.event_date.getTime(); // seri → terbaru dulu
    if (bedaTgl !== 0) return bedaTgl;
    return Number(b.id) - Number(a.id);
  });

  const urut = terbaru ? [terbaru, ...sisa] : sisa;
  return urut.slice(0, limit).map((b) => keBerita(b as Baris, bahasa));
}

/**
 * Isi rel kanan konsol /peta: 5 laporan terbaru + 5 laporan terpopuler
 * (komentar terbanyak, di luar lima terbaru supaya tidak ganda).
 */
export async function ambilRelKanan(
  bahasa: Bahasa = "id",
  baru = 5,
  ramai = 5,
): Promise<{ terbaru: Berita[]; populer: Berita[]; komentar: Record<string, number> }> {
  // Mode contoh (PETA_DUMMY=1, mis. pratinjau Vercel tanpa basis data):
  // kembalikan data statis supaya halaman tetap tampil penuh.
  if (process.env.PETA_DUMMY === "1") {
    const { TERBARU_CONTOH, POPULER_CONTOH } = await import("./contoh-peta");
    // Tanpa basis data tak ada komentar: peringkat kosong berarti filter
    // "populer" jatuh ke urutan bawaan (terbaru dulu), bukan daftar kosong.
    return { terbaru: TERBARU_CONTOH.slice(0, baru), populer: POPULER_CONTOH.slice(0, ramai), komentar: {} };
  }

  const [semua, hitung] = await Promise.all([
    // event_date bisa seri — id menaik dipakai pemecah seri supaya "paling
    // baru" benar-benar yang terakhir dibuat.
    prisma.events.findMany({
      where: TAYANG,
      take: Math.max((baru + ramai) * 2, 100),
      orderBy: [{ event_date: "desc" }, { id: "desc" }],
      select: PILIH,
    }),
    // Komentar polimorfik ala Laravel, bukan relasi Prisma — dihitung terpisah.
    prisma.comments.groupBy({
      by: ["commentable_id"],
      where: { commentable_type: "App\\Models\\Event", is_approved: true, commentable_id: { not: null } },
      _count: true,
    }),
  ]);

  const jumlahKomentar = new Map<number, number>();
  for (const h of hitung) {
    if (h.commentable_id != null) jumlahKomentar.set(Number(h.commentable_id), h._count);
  }

  const { terbaru, populer } = bagiRelKanan(semua, jumlahKomentar, baru, ramai);

  return {
    terbaru: terbaru.map((b) => keBerita(b as Baris, bahasa)),
    populer: populer.map((b) => keBerita(b as Baris, bahasa)),
    /* Peringkatnya, bukan laporannya: rel kanan mode arsip penuh mengurutkan
       `berita` yang sudah ada di klien dengan angka ini. Mengirim daftar
       laporan populer yang panjang berarti objek yang sama dikirim dua kali
       dalam satu muatan halaman. Hanya laporan berkomentar yang terdaftar. */
    komentar: Object.fromEntries(jumlahKomentar),
  };
}

/**
 * SELURUH kejadian tayang untuk peta + pop-up wilayah — TANPA batas 10.
 *
 * `ambilBerita` di atas memang hanya 10 (kurasi korsel), dan pop-up peta
 * tadinya memakai daftar yang sama — akibatnya laporan ke-11 dan seterusnya
 * tak pernah tampil di daftar wilayah walau penghitung provinsinya menyebut
 * angka yang benar. Urutannya murni terbaru dulu (tanpa campuran komentar):
 * pop-up adalah arsip lengkap, bukan etalase.
 */
export async function ambilSemuaBerita(bahasa: Bahasa = "id"): Promise<Berita[]> {
  // Mode contoh — lihat ambilRelKanan di atas.
  if (process.env.PETA_DUMMY === "1") {
    const { BERITA_CONTOH } = await import("./contoh-peta");
    return BERITA_CONTOH;
  }

  const semua = await prisma.events.findMany({
    where: TAYANG,
    orderBy: [{ event_date: "desc" }, { id: "desc" }],
    select: PILIH,
  });
  return semua.map((b) => keBerita(b as Baris, bahasa));
}

/**
 * Seluruh kejadian tayang untuk umpan rel kanan — terbaru dulu (tanggal
 * kejadian, lalu id) — masing-masing membawa jumlah komentarnya. Pengurutan
 * "komentar terbanyak" terjadi di klien lewat saklar urutan umpan, jadi
 * angkanya ikut dikirim alih-alih mengurutkan di sini.
 *
 * Di-cache: CMS membatalkan "kejadian" (simpan/tayang/hapus/promosi) dan
 * "komentar" (moderasi). Komentar publik baru tidak membatalkan tag apa pun,
 * jadi umur "minutes" yang menjaga angkanya paling lama basi ~1 menit.
 */
export async function ambilUmpan(bahasa: Bahasa = "id"): Promise<Berita[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("kejadian", "komentar");
  // Mode contoh — lihat ambilRelKanan di atas. Tanpa basis data tak ada
  // komentar; semua laporan dianggap 0.
  if (process.env.PETA_DUMMY === "1") {
    const { BERITA_CONTOH } = await import("./contoh-peta");
    return BERITA_CONTOH;
  }

  const [semua, hitung] = await Promise.all([
    prisma.events.findMany({
      where: TAYANG,
      orderBy: [{ event_date: "desc" }, { id: "desc" }],
      select: PILIH,
    }),
    // Komentar polimorfik ala Laravel, bukan relasi Prisma — dihitung terpisah.
    prisma.comments.groupBy({
      by: ["commentable_id"],
      where: { commentable_type: "App\\Models\\Event", is_approved: true, commentable_id: { not: null } },
      _count: true,
    }),
  ]);

  const jumlahKomentar = new Map<number, number>();
  for (const h of hitung) {
    if (h.commentable_id != null) jumlahKomentar.set(Number(h.commentable_id), h._count);
  }
  return semua.map((b) => ({
    ...keBerita(b as Baris, bahasa),
    jumlahKomentar: jumlahKomentar.get(Number(b.id)) ?? 0,
  }));
}

/** Satu kejadian lewat permalink /fire/<slug>. */
export async function ambilBeritaSlug(slug: string, bahasa: Bahasa = "id"): Promise<Berita | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("kejadian");
  // findFirst, bukan findUnique: slug tetap unik, tapi saringan tayang harus
  // ikut masuk where — draft yang di-permalink-kan langsung harus 404.
  const baris = await prisma.events.findFirst({ where: { slug, ...TAYANG }, select: PILIH });
  return baris ? keBerita(baris as Baris, bahasa) : null;
}

/**
 * Jumlah laporan per provinsi untuk angka di tengah tiap poligon peta.
 *
 * Ke-34 provinsi selalu ada; yang belum terliput bernilai 0 supaya peta
 * menggambar "0" alih-alih memperlakukannya sebagai wilayah tanpa data.
 *
 * Dihitung dari SELURUH kejadian, bukan dari sepuluh terbaru di atas — kalau
 * memakai koleksi itu, angka provinsi menyusut sendiri begitu laporan ke-11
 * masuk. Diturunkan dari daftar ambilUmpan yang sudah di-cache (provinsi-nya
 * sudah disimpulkan di keBerita), bukan pindai tabel kedua.
 */
export async function hitungLaporanProvinsi(): Promise<Record<string, number>> {
  // Mode contoh — lihat ambilRelKanan di atas.
  if (process.env.PETA_DUMMY === "1") {
    const { JUMLAH_CONTOH } = await import("./contoh-peta");
    return { ...JUMLAH_CONTOH };
  }

  const jumlah: Record<string, number> = Object.fromEntries(
    PROVINSI_PETA_NAMA.map((n) => [n, 0]),
  );

  for (const { provinsi } of await ambilUmpan("id")) {
    // Lokasi yang tidak menyebut provinsi mana pun sengaja tidak dihitung —
    // lebih baik tidak terhitung daripada masuk kolom yang salah.
    if (provinsi) jumlah[provinsi]++;
  }

  return jumlah;
}
