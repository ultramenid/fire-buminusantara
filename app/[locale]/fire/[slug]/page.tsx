import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cacheLife, cacheTag } from "next/cache";
import { ambilBerita, ambilBeritaSlug, hitungLaporanProvinsi, TAYANG } from "@/lib/events";
import { prisma } from "@/lib/prisma";
import { JsonLd } from "@/components/json-ld";
import { ambilTigaTeratas } from "@/lib/wms";
import { ambilStatistik } from "@/lib/statistik";
import { HalamanFire } from "@/components/halaman-fire";
import { KerangkaBeranda } from "@/components/kerangka-beranda";
import { Nav } from "@/components/nav";
import { adaBahasa, type Bahasa } from "@/lib/bahasa";

// Halaman rincian kejadian dengan slug dinamis dari database (dibuat di CMS kapan saja).
// Diizinkan blocking (instant = false) agar tidak memblokir prerender build.
export const instant = false;

// Basis absolut yang sama dengan fallback og:video di bawah — JSON-LD wajib
// URL absolut, sementara metadataBase hanya me-resolve kolom Metadata.
const DASAR_SITUS = process.env.NEXT_PUBLIC_SITE_URL || "https://fire.nusantara.earth";

// Kolom SEO mentah (EN + tanggal) belum ada di tipe Berita lib/events.ts —
// diambil langsung di sini supaya tak menyentuh berkas milik agen lain.
async function ambilRincianSeo(slug: string) {
  return prisma.events.findFirst({
    where: { slug, ...TAYANG },
    select: { title_en: true, description_en: true, event_date: true, updated_at: true },
  });
}

// Judul/deskripsi sesuai locale — versi EN kosong kembali ke versi id supaya
// locale=id berperilaku persis seperti sebelumnya (tanpa cabang khusus).
function teksSeo(seo: Awaited<ReturnType<typeof ambilRincianSeo>>, kejadian: { judul: string; deskripsi: string | null }, locale: string) {
  const inggris = locale === "en";
  const judul = (inggris ? seo?.title_en?.trim() : "") || kejadian.judul;
  const deskripsi = (inggris ? seo?.description_en?.trim() : "") || kejadian.deskripsi;
  return { judul, deskripsi };
}

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

/**
 * Bahan metadata satu kejadian, di-cache.
 *
 * Tanpa cache, generateMetadata membaca database saat prerender dan rute ini
 * jadi blocking. Insight yang muncul adalah `blocking-prerender-current-time`
 * — dan `Date.now()`-nya bukan milik kode ini melainkan milik driver database;
 * dibuktikan dengan bisect sampai ke kueri Prisma telanjang. Yang salah bukan
 * jam yang dibaca, melainkan pembacaan tanpa cache-nya.
 *
 * Ditandai "kejadian": setiap penyimpanan, promosi laporan, dan penghapusan di
 * CMS memanggil updateTag("kejadian"), jadi judul dan deskripsi pratinjau
 * bagikan tidak pernah basi meski di-cache.
 *
 * Slug tak dikenal ikut di-cache sebagai null — itu memang yang diinginkan:
 * 404 tetap 404 sampai kejadiannya benar-benar dibuat, dan pembuatannya
 * membatalkan tag ini.
 */
async function ambilMetaKejadian(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("kejadian");
  const [kejadian, seo] = await Promise.all([ambilBeritaSlug(slug), ambilRincianSeo(slug)]);
  return { kejadian, seo };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!adaBahasa(locale)) notFound();

  const { kejadian, seo } = await ambilMetaKejadian(slug);
  if (!kejadian) {
    notFound();
  }

  const { judul: judulSeo, deskripsi: deskripsiSeo } = teksSeo(seo, kejadian, locale);
  const judul = judulSeo;
  const deskripsi =
    deskripsiSeo ||
    `Pantauan karhutla di ${kejadian.lokasi ?? "Indonesia"} (${kejadian.tanggal}).`;
  const gambar = kejadian.poster;
  // og:video: kolom `video` lama ATAU video pertama di galeri `media` — kejadian
  // yang dibuat lewat CMS menaruh videonya di galeri, kolom lamanya kosong.
  // Tanpa ini, kejadian bervideo-galeri dibagikan tanpa og:video sama sekali.
  const video = kejadian.video ?? kejadian.media.find((m) => m.jenis === "video")?.url ?? null;

  return {
    title: judul,
    description: deskripsi,
    // Kanonik per locale + hreflang id/en: path relatif diselesaikan absolut
    // lewat metadataBase di root layout (pola yang sama seperti og:url).
    alternates: {
      canonical: `/${locale}/fire/${slug}`,
      languages: {
        id: `/id/fire/${slug}`,
        en: `/en/fire/${slug}`,
        "x-default": `/id/fire/${slug}`,
      },
    },
    openGraph: {
      title: judul,
      description: deskripsi,
      // URL absolut og:url & og:image dijamin oleh metadataBase di root layout.
      // Tanpa og:url yang absolut, sebagian crawler memperlakukan tautan yang
      // dibagikan (dengan prefiks /id/ dst.) dan kanoniknya sebagai dua halaman.
      url: `/${locale}/fire/${slug}`,
      siteName: "Fire",
      locale: locale === "en" ? "en_US" : "id_ID",
      images: gambar ? [{ url: gambar, alt: judulSeo }] : [],
      // og:video: WhatsApp/Twitter kadang memutar mp4 langsung dari pratinjau.
      // Fallback utamanya tetap og:image di atas (poster video) — jauh lebih
      // andal di semua perangkat. URL-nya dibuat absolut sendiri: tidak seperti
      // images, metadataBase TIDAK me-resolve og:video di versi Next ini.
      videos: video
        ? [{ url: new URL(video, process.env.NEXT_PUBLIC_SITE_URL || "https://fire.nusantara.earth").toString() }]
        : [],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: judul,
      description: deskripsi,
      images: gambar ? [gambar] : [],
    },
    other: {
      "content-language": locale,
    },
  };
}

async function IsiHalaman({
  bahasa,
  slug,
  kejadianAwal,
}: {
  bahasa: Bahasa;
  slug: string;
  kejadianAwal: NonNullable<Awaited<ReturnType<typeof ambilBeritaSlug>>>;
}) {
  await connection();
  const [berita, jumlahLaporan, tigaTeratas, statistik, seo] = await Promise.all([
    ambilBerita(),
    hitungLaporanProvinsi(),
    ambilTigaTeratas(),
    ambilStatistik(bahasa),
    ambilRincianSeo(slug),
  ]);

  const kejadian = kejadianAwal;

  // Pastikan kejadian selalu ada di daftar berita meskipun sudah lama (di luar top 10)
  const daftarBerita = berita.some((b) => b.id === kejadian.id)
    ? berita
    : [kejadian, ...berita];

  // Data terstruktur untuk crawler — URL/gambar absolut karena JSON-LD tidak
  // ikut di-resolve metadataBase; nama organisasi mengikuti siteName layout.
  const { judul: judulSeo, deskripsi: deskripsiSeo } = teksSeo(seo, kejadian, bahasa);
  const urlHalaman = new URL(`/${bahasa}/fire/${slug}`, DASAR_SITUS).toString();
  const gambarAbsolut = kejadian.poster ? new URL(kejadian.poster, DASAR_SITUS).toString() : null;
  const terbit = seo?.event_date?.toISOString() ?? null;
  const diubah = seo?.updated_at?.toISOString() ?? terbit;
  const organisasi = { "@type": "Organization", name: "Fire", url: DASAR_SITUS };
  const beritaLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: judulSeo,
    ...(deskripsiSeo ? { description: deskripsiSeo } : {}),
    ...(gambarAbsolut ? { image: [gambarAbsolut] } : {}),
    ...(terbit ? { datePublished: terbit } : {}),
    ...(diubah ? { dateModified: diubah } : {}),
    inLanguage: bahasa,
    mainEntityOfPage: { "@type": "WebPage", "@id": urlHalaman },
    author: organisasi,
    publisher: {
      ...organisasi,
      logo: {
        "@type": "ImageObject",
        url: new URL("/assets/img/og-fire.jpg", DASAR_SITUS).toString(),
      },
    },
  };
  const remahLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: bahasa === "en" ? "Home" : "Beranda",
        item: `${DASAR_SITUS}/${bahasa}`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: judulSeo,
        item: urlHalaman,
      },
    ],
  };

  return (
    <>
      <h1 className="sr-only">{judulSeo}</h1>
      <JsonLd data={beritaLd} />
      <JsonLd data={remahLd} />
      <HalamanFire
        berita={daftarBerita}
        jumlahLaporan={jumlahLaporan}
        tigaTeratas={tigaTeratas}
        statistik={statistik}
        kejadianAwal={kejadian}
        bahasa={bahasa}
      />
    </>
  );
}

export default async function HalamanKejadian({ params }: Props) {
  await connection();
  const { locale, slug } = await params;
  if (!adaBahasa(locale)) notFound();

  // Validasi slug sebelum memasuki Suspense boundary agar Next.js mengirimkan
  // HTTP status 404 yang benar alih-alih HTTP 200 soft 404.
  const kejadian = await ambilBeritaSlug(slug);
  if (!kejadian) notFound();

  return (
    <>
      <Nav bahasa={locale as Bahasa} />
      <Suspense fallback={<KerangkaBeranda bahasa={locale as Bahasa} />}>
        <IsiHalaman bahasa={locale as Bahasa} slug={slug} kejadianAwal={kejadian} />
      </Suspense>
    </>
  );
}
