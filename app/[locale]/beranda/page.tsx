import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ambilBerita, ambilSemuaBerita, hitungLaporanProvinsi } from "@/lib/events";
import { ambilTigaTeratas } from "@/lib/wms";
import { ambilStatistik } from "@/lib/statistik";
import { HalamanFire } from "@/components/halaman-fire";
import { KerangkaBeranda } from "@/components/kerangka-beranda";
import { Nav } from "@/components/nav";
import { adaBahasa, type Bahasa } from "@/lib/bahasa";

// Dua prefiks yang sah — /id dan /en. Segmen lain (mis. /xyz) ditolak
// lewat notFound() di bawah.
export function generateStaticParams() {
  return [{ locale: "id" }, { locale: "en" }];
}

// Diizinkan blocking (instant = false) agar pembacaan URL params locale di level halaman
// tidak memicu peringatan Cache Components Instant Navigation.
export const instant = false;

// Judul/deskripsi dinilai crawler per URL (/id vs /en), jadi versi Inggris
// diterjemahkan penuh — bukan fallback bahasa Indonesia.
const TEKS_BERANDA: Record<Bahasa, { judul: string; deskripsi: string; ogLocale: string }> = {
  id: {
    judul: "Lapor Karhutla!",
    deskripsi:
      "Menyaksikan kebakaran atau dampak asapnya? Laporkan di sini.Laporan dikurasi sebelum ditampilkan.",
    ogLocale: "id_ID",
  },
  en: {
    judul: "Notify wildfire!",
    deskripsi:
      "Witnessing a fire or its haze? File it here. Reports are curated before being displayed.",
    ogLocale: "en_US",
  },
};

// Metadata per locale — cangkang statis di-prerender, isi dinamis mengalir
// lewat connection() di IsiHalaman, jadi generateMetadata tidak menambah
// biaya cache baru.
export async function generateMetadata({ params }: PageProps<'/[locale]/beranda'>): Promise<Metadata> {
  const { locale } = await params;
  // Segmen tak dikenal tetap 404 lewat notFound() di bawah; metadata butuh
  // nilai aman sementara supaya tak ada judul kosong.
  const bahasa: Bahasa = adaBahasa(locale) ? locale : "id";
  const teks = TEKS_BERANDA[bahasa];
  return {
    title: teks.judul,
    description: teks.deskripsi,
    // Kanonis menunjuk URL prefiks bahasanya sendiri; hreflang id/en
    // menandai keduanya sederajat supaya tak dianggap konten duplikat.
    // Path relatif diselesaikan absolut lewat metadataBase di layout akar.
    alternates: {
      canonical: `/${bahasa}/beranda`,
      languages: { id: "/id/beranda", en: "/en/beranda", "x-default": "/id/beranda" },
    },
    openGraph: {
      title: teks.judul,
      description: teks.deskripsi,
      url: `/${bahasa}/beranda`,
      siteName: "Fire",
      locale: teks.ogLocale,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: teks.judul,
      description: teks.deskripsi,
      images: ["/assets/img/og-fire.jpg"],
    },
    other: {
      "content-language": bahasa,
    },
  };
}

// Isi halaman dipisah dari kerangkanya supaya kerangka — Nav — terstream
// seketika, sementara data di bawah ini masih diambil. Tanpa pemisahan ini
// HTML baru tiba setelah seluruh kueri selesai dan pengunjung menatap
// layar kosong selama itu.
//
// `params` DI-AWAIT DI SINI, bukan di komponen halaman: App Shell di bawah
// Partial Prefetching dipakai bersama /id/beranda dan /en/beranda, jadi pembacaan data URL
// harus berada di dalam <Suspense>.
async function IsiHalaman({ params }: Pick<PageProps<'/[locale]/beranda'>, 'params'>) {
  const { locale } = await params;
  const bahasa: Bahasa = adaBahasa(locale) ? locale : "id";
  await connection();
  const [berita, semuaBerita, jumlahLaporan, tigaTeratas, statistik] = await Promise.all([
    ambilBerita(bahasa),
    ambilSemuaBerita(bahasa),
    hitungLaporanProvinsi(),
    ambilTigaTeratas(),
    ambilStatistik(bahasa),
  ]);

  return (
    <HalamanFire
      berita={berita}
      semuaBerita={semuaBerita}
      jumlahLaporan={jumlahLaporan}
      tigaTeratas={tigaTeratas}
      statistik={statistik}
      bahasa={bahasa}
    />
  );
}

// Kepala halaman yang bergantung locale — JSON-LD, Nav, dan H1. Ketiganya
// membaca segmen [locale], jadi mereka pun harus berada di dalam <Suspense>:
// App Shell rute /[locale]/beranda dipakai bersama /id/beranda dan /en/beranda, dan data URL di
// luar boundary mengikatnya ke satu URL (insight instant-shell-url-data).
async function KepalaLokal({ params }: Pick<PageProps<'/[locale]/beranda'>, 'params'>) {
  const { locale } = await params;
  // Backstop: proxy.ts sudah menjamin prefiks /id atau /en sebelum permintaan
  // sampai ke sini, jadi cabang ini praktis tak terjangkau.
  if (!adaBahasa(locale)) notFound();

  // Basis absolut disamakan dengan metadataBase di layout akar supaya URL
  // skema tetap benar di staging maupun produksi.
  const situs = process.env.NEXT_PUBLIC_SITE_URL || "https://fire.nusantara.earth";
  // Skema WebSite ditulis sebaris — components/json-ld.tsx milik agen lain,
  // jadi satu sumber kebenaran di sini menghindari konflik penggabungan.
  const skemaSitus = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Fire",
    alternateName:
      locale === "en"
        ? "Forest and Land Fire Monitoring in Indonesia"
        : "Pantauan Karhutla Indonesia",
    url: `${situs}/${locale}/beranda`,
    inLanguage: locale,
    publisher: {
      "@type": "Organization",
      name: "Fire",
      url: situs,
      logo: {
        "@type": "ImageObject",
        url: `${situs}/assets/img/og-fire.jpg`,
      },
    },
  };

  return (
    <>
      {/* ponytail: <html lang> di layout akar tidak bisa membaca segmen [locale]
          tanpa memindahkan seluruh struktur — Nav yang membetulkannya di sisi
          klien; pindahkan layout akar ke [locale] kalau rasa bahasa halaman
          perlu benar sejak byte pertama (SEO). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(skemaSitus) }}
      />
      {/* Nav membaca pathname (data URL) — sudah tercakup boundary di atas.
          Bilahnya fixed h-16 dan isi halaman sudah menghitung jarak aman
          darinya, jadi fallback kosong tidak menggeser apa pun. */}
      <Nav bahasa={locale} />
      {/* H1 ikut bahasa halaman — satu H1 berbahasa salah per URL merusak
          relevansi kata kunci untuk versi Inggrisnya. */}
      <h1 className="sr-only">
        {locale === "en"
          ? "Forest and land fire monitoring in Indonesia"
          : "Pantauan kebakaran hutan dan lahan Indonesia"}
      </h1>
    </>
  );
}

// Kerangka halaman SENGAJA tidak async dan tidak menyentuh `params`: semua
// yang bergantung URL turun ke dalam <Suspense> di bawah, sehingga App Shell
// rute ini tetap bisa diprerender sekali dan dipakai ulang oleh /id dan /en.
export default function Halaman({ params }: PageProps<'/[locale]/beranda'>) {
  return (
    <div className="min-h-screen bg-white text-tinta dark:bg-[#0a0a0a] dark:text-[#f5f5f5] transition-colors duration-200">
      <Suspense fallback={null}>
        <KepalaLokal params={params} />
      </Suspense>
      {/* Kerangka pemuatan menahan geometri dua layar supaya isi yang
          menggantikannya tidak menggeser tata letak saat data tiba. Fallback
          tidak boleh tahu locale (itu data URL), jadi KerangkaBeranda memakai
          bawaannya — yang berbeda hanya teks sr-only "Memuat…". */}
      <Suspense fallback={<KerangkaBeranda />}>
        <IsiHalaman params={params} />
      </Suspense>
    </div>
  );
}
