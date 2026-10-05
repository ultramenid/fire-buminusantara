import type { NextConfig } from "next";

/**
 * Header keamanan untuk SEMUA rute.
 *
 * Ditaruh di sini, bukan di tiap respons, supaya tidak ada halaman yang
 * terlewat — termasuk rute yang belum ada. CSP-nya sengaja menahan diri pada
 * yang tidak bisa memecah aplikasi: `frame-ancestors`/`object-src`/`base-uri`
 * menutup clickjacking dan penyuntikan <base>, tanpa membatasi `script-src`
 * (Next.js menyuntik skrip inline, dan halaman memuat Turnstile + Leaflet dari
 * CDN — CSP script yang keliru akan mematikan halaman, bukan sekadar
 * memperketatnya). `frame-src` memasukkan challenges.cloudflare.com karena
 * widget Turnstile merender dirinya dalam iframe dari sana. `geolocation=(self)`
 * DISENGAJA: form laporan memakai "Pakai lokasi saya".
 */
const HEADER_KEAMANAN = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), payment=(), geolocation=(self)",
  },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; frame-src 'self' http://localhost:3001 https://challenges.cloudflare.com https://*.windy.com https://windy.com; base-uri 'self'; object-src 'none'",
  },
];

const nextConfig: NextConfig = {
  // Proteksi version skew: Next.js otomatis mendeteksi perubahan deployment ID
  // di header navigasi/RSC. Bila terdeteksi versi baru (setelah build/deploy baru),
  // Next.js otomatis melakukan reload browser penuh (MPA navigation) alih-alih
  // transisi SPA yang terjebak pada chunk atau state lama.
  deploymentId:
    process.env.NEXT_DEPLOYMENT_ID ||
    process.env.WEB_TAG ||
    (process.env.NODE_ENV === "production"
      ? (() => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { execSync } = require("node:child_process");
            return execSync("git rev-parse --short HEAD").toString().trim();
          } catch {
            return `${Date.now()}`;
          }
        })()
      : undefined),

  // Buang X-Powered-By: Next.js — versi framework tidak perlu diumumkan.
  poweredByHeader: false,

  // Cache Components & Partial Prefetching (Next.js 16.3+)
  cacheComponents: true,
  partialPrefetching: true,

  images: {
    formats: ["image/avif", "image/webp"],
  },

  // Dipakai Docker (Dockerfile di root): `next build` menyalin server minimal
  // ke .next/standalone sehingga image produksi tidak perlu node_modules penuh.
  // Di Vercel output ini TIDAK dipakai (ia memakai .nft.json hasil tracing) —
  // jadi dinonaktifkan saat VERCEL=1, kalau tidak build gagal dengan
  // "ENOENT next-server.js.nft.json".
  ...(process.env.VERCEL ? {} : { output: "standalone" }),

  // @prisma/client dan @aws-sdk/client-s3 sudah eksternal secara bawaan, tapi
  // adapter MariaDB belum: tanpa ini webpack membundelnya ke chunk server, ia
  // tidak pernah tersalin ke node_modules standalone, dan skrip di prisma/
  // (backfill-poster.mjs dkk.) yang meng-import-nya secara polos gagal dengan
  // ERR_MODULE_NOT_FOUND di dalam kontainer produksi.
  serverExternalPackages: ["@prisma/adapter-mariadb"],

  // Batas upload video kejadian 100 MB (sama dengan CMS Laravel). Diberi 1 MB
  // napas di atas batas klien (BATAS_TOTAL_BYTE = 100 MB di lib/batas-laporan.ts):
  // body multipart = berkas + bidang isian + boundary, jadi kiriman yang lolos
  // cek klien tepat di batas masih melebihi atap yang sama nilainya.
  experimental: {
    serverActions: {
      bodySizeLimit: "101mb",
    },
    // Selama proxy.ts dipakai, Next menyangga body permintaan di memori dan
    // batas bawaannya 10 MB — sisanya DIPOTONG. Kiriman lapor berlampiran
    // melewati proxy (matcher hanya mengecualikan _next/admin/api/media), dan
    // multipart yang terpotong meledak sebagai "Unexpected end of form": 500
    // polos ber-digest, tanpa pesan apa pun bagi pelapor. Naikkan sampai
    // menutup bodySizeLimit supaya tidak ada kiriman yang lolos batas klien
    // tapi terpotong di sini.
    proxyClientMaxBodySize: "101mb",
  },

  // Reaksi dulu di bawah /admin/komentar; kini bagian itu punya layout daftar sendiri.
  async redirects() {
    return [{ source: "/admin/komentar/reaksi", destination: "/admin/reaksi", permanent: true }];
  },

  async headers() {
    return [
      // /media melayani berkas UNGGAHAN orang luar — CSP-nya lebih keras:
      // "default-src 'none'; sandbox" membuat berkasnya tidak bisa memuat atau
      // menjalankan apa pun kalau sampai dirender sebagai dokumen. Aturan ini
      // didahulukan, dan aturan umum di bawah SENGAJA mengecualikan /media
      // (lookahead negatif) supaya tidak ada dua header CSP yang bertumpuk.
      {
        source: "/media/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: "default-src 'none'; sandbox" },
        ],
      },
      {
        source: "/api/forecasting",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'; object-src 'none'" },
        ],
      },
      { source: "/((?!media/|api/forecasting).*)", headers: HEADER_KEAMANAN },
      {
        source: "/assets/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/css/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/data/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/(favicon.ico|icon.png|apple-icon.png)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      // Header tanpa-cache untuk dokumen & rute aplikasi: browser, proxy, dan
      // CDN tidak boleh menahan dokumen HTML usang lintas deploy, sehingga
      // pengguna tidak perlu hard reload untuk mendapatkan bundel skrip terbaru.
      // Aset statis ber-hash di _next/static serta berkas publik di assets/ & css/
      // membawa header cache tersendiri.
      {
        source:
          "/((?!_next/static|_next/image|assets/|css/|favicon\\.ico|icon\\.png|apple-icon\\.png|robots\\.txt|sitemap\\.xml|media/|api/forecasting|api/sebaran-asap|api/umpan|data/).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, max-age=0, must-revalidate",
          },
          { key: "Pragma", value: "no-cache" },
        ],
      },
    ];
  },
};

export default nextConfig;
