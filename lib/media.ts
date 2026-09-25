/** Base URL untuk media - bisa diatur lewat environment */
const MEDIA_BASE_URL = process.env.NEXT_PUBLIC_MEDIA_URL || "";

/** Berkas yang diunggah lewat CMS ini disimpan dengan awalan ini */
export const AWALAN_LOKAL = "fire/";

/**
 * URL sebuah berkas media.
 *
 * - Path yang diawali "fire/" → route /media, yang mengambilnya dari MinIO
 * - Path lain → gunakan MEDIA_BASE_URL (media lama dari CMS Laravel)
 *
 * Endpoint MinIO TIDAK ditulis ke dalam URL. Bucketnya tidak dibuka untuk umum,
 * jadi URL langsung ke sana dijawab 403; selain itu alamat MinIO adalah urusan
 * server — kalau ia pindah, yang tersimpan di basis data tidak ikut basi.
 */
export function urlMedia(path: string | null): string | null {
  if (!path) return null;

  // Media baru dari CMS (disimpan di MinIO dengan awalan fire/)
  if (path.startsWith(AWALAN_LOKAL)) return `/media/${path.slice(AWALAN_LOKAL.length)}`;

  // Media lama - gunakan URL eksternal atau default
  return MEDIA_BASE_URL ? `${MEDIA_BASE_URL}/${path}` : null;
}

/**
 * Apakah URL media ini dilayani oleh route /media (unggahan CMS lokal)?
 *
 * Hanya URL seperti itu yang aman dioptimasi lewat next/image: media warisan
 * (MEDIA_BASE_URL) memakai host dinamis per lingkungan yang tak bisa
 * didaftarkan ke remotePatterns statis — optimizer melempar galat runtime
 * untuk host tak dikenal, jadi media warisan tetap <img> polos.
 */
export function mediaLokal(url: string): boolean {
  return url.startsWith("/media/");
}

/** Orientasi yang dipilih peninjau saat memverifikasi — dipakai penampil media
 *  untuk mengatur rasio (mis. potret tampil tinggi, lanskap tampil lebar). */
export type Orientasi = "potret" | "lanskap";

/** Satu berkas dalam galeri kejadian, sebagaimana tersimpan di kolom `media`. */
export type BerkasMedia = {
  path: string;
  type: "image" | "video";
  poster?: string;
  /** Keterangan gambar dari form CMS — alt/caption per berkas. */
  keterangan?: string;
  /** Orientasi yang dipilih peninjau (bisa kosong sebelum diverifikasi). */
  orientasi?: Orientasi;
  /** GPS & waktu pengambilan dari EXIF foto/video yang tersimpan di JSON DB saat unggah. */
  exif?: { lat?: number; lng?: number; waktu?: string };
};

/** Satu item galeri yang siap dirender. */
export type ItemMedia = {
  jenis: "gambar" | "video";
  url: string;
  poster?: string;
  keterangan?: string;
};

/**
 * Baca kolom `media` — JSON bebas bentuk dari basis data, jadi tiap entri
 * diperiksa sendiri. Entri yang tidak lengkap dilewati, bukan membuat seluruh
 * galeri gagal: satu baris rusak tidak boleh menghilangkan media lain kejadian
 * yang sama.
 */
export function bacaBerkasMedia(nilai: unknown): BerkasMedia[] {
  if (!Array.isArray(nilai)) return [];

  const hasil: BerkasMedia[] = [];
  for (const item of nilai) {
    if (!item || typeof item !== "object") continue;
    const { path, type, poster, keterangan, orientasi, exif } = item as Record<string, unknown>;
    if (typeof path !== "string" || !path) continue;
    if (type !== "image" && type !== "video") continue;

    const berkas: BerkasMedia =
      typeof poster === "string" && poster ? { path, type, poster } : { path, type };
    if (typeof keterangan === "string" && keterangan.trim()) {
      berkas.keterangan = keterangan;
    }
    if (orientasi === "potret" || orientasi === "lanskap") {
      berkas.orientasi = orientasi;
    }
    if (exif && typeof exif === "object") {
      const e = exif as Record<string, unknown>;
      const lat = typeof e.lat === "number" && Number.isFinite(e.lat) ? e.lat : undefined;
      const lng = typeof e.lng === "number" && Number.isFinite(e.lng) ? e.lng : undefined;
      const waktu = typeof e.waktu === "string" && e.waktu.trim() ? e.waktu.trim() : undefined;
      if (lat !== undefined || lng !== undefined || waktu !== undefined) {
        berkas.exif = {
          ...(lat !== undefined ? { lat } : {}),
          ...(lng !== undefined ? { lng } : {}),
          ...(waktu !== undefined ? { waktu } : {}),
        };
      }
    }
    hasil.push(berkas);
  }
  return hasil;
}

/**
 * Galeri siap render untuk slider kartu dan pop-up rincian. Kejadian lama yang
 * hanya punya image_id/video tetap tampil tanpa perlu memindahkan datanya.
 */
export function itemMedia(
  media: unknown,
  imageId: string | null,
  video: string | null,
): ItemMedia[] {
  const galeri: ItemMedia[] = [];
  const terpakai: string[] = [];

  for (const berkas of bacaBerkasMedia(media)) {
    const url = urlMedia(berkas.path);
    if (!url) continue;
    if (berkas.type === "video") {
      const poster = berkas.poster ? urlMedia(berkas.poster) : null;
      galeri.push(
        poster
          ? { jenis: "video", url, poster, keterangan: berkas.keterangan }
          : { jenis: "video", url, keterangan: berkas.keterangan },
      );
    } else {
      galeri.push({ jenis: "gambar", url, keterangan: berkas.keterangan });
    }
    terpakai.push(berkas.path);
  }

  // `image_id` bukan item galeri tersendiri saat kejadian punya video: ia
  // poster video itu — kalau admin tidak mengunggah gambar, yang mengisinya
  // adalah bingkai otomatis dari video yang sama. Dihitung sebagai item,
  // kejadian bervideo tunggal tampil seolah punya dua media dan slider
  // memunculkan titik navigasinya.
  const pakaiImageId = Boolean(imageId) && !video;

  const utama: ItemMedia[] = [];
  if (video && !terpakai.includes(video)) {
    const url = urlMedia(video);
    if (url) utama.push({ jenis: "video", url });
  }
  if (pakaiImageId && imageId && !terpakai.includes(imageId)) {
    const url = urlMedia(imageId);
    if (url) utama.push({ jenis: "gambar", url });
  }

  return [...utama, ...galeri];
}

/**
 * Galeri apa adanya dari kolom `media`, TANPA media legacy di depannya.
 *
 * Dipakai form admin: kotak centang `keep_media` menunjuk indeks di kolom itu,
 * jadi urutannya harus persis sama dengan yang tersimpan — bukan urutan
 * tampilan dari itemMedia(). Entri yang URL-nya tidak terbentuk tetap
 * disertakan sebagai url kosong supaya indeksnya tidak bergeser.
 */
export function galeriTersimpan(media: unknown): ItemMedia[] {
  return bacaBerkasMedia(media).map((b) => {
    const url = urlMedia(b.path) ?? "";
    if (b.type !== "video") {
      return { jenis: "gambar" as const, url, keterangan: b.keterangan };
    }
    const poster = b.poster ? urlMedia(b.poster) : null;
    return poster
      ? { jenis: "video" as const, url, poster, keterangan: b.keterangan }
      : { jenis: "video" as const, url, keterangan: b.keterangan };
  });
}

/**
 * Orientasi kartu korsel dari lampiran laporan: pilihan potret/lanskap peninjau
 * yang tersimpan di JSON media. Yang pertama punya pilihan yang menang — kartu
 * memang menonjolkan satu media saja, sisanya menumpang di slider.
 *
 * Dipetakan ke nilai kolom `events.orientation`: foto potret → "horizontal"
 * (foto memenuhi kartu), sisanya → "landscape" (foto di bawah teks, bingkai
 * 3:2). Tanpa pilihan apa pun, jatuh ke "landscape" — sama dengan bawaan
 * kolomnya. Dipakai promosiKeKejadian() saat laporan naik jadi kejadian.
 */
export function orientasiKartu(media: unknown): "horizontal" | "landscape" {
  const pilihan = bacaBerkasMedia(media).find((b) => b.orientasi)?.orientasi;
  return pilihan === "potret" ? "horizontal" : "landscape";
}
