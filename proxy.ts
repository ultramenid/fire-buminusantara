import { NextResponse, type NextRequest } from "next/server";
import { BAHASA } from "@/lib/bahasa";

/**
 * Pengalih prefiks bahasa. URL tanpa prefiks (mis. /) dikirim ke /id/…
 * — /id adalah bahasa bawaan; proxy ini tidak bernegosiasi dengan
 * Accept-Language, satu bahasa bawaan cukup untuk dua bahasa saja.
 *
 * CMS (admin), API, dan rute media TIDAK berprefiks bahasa dan harus
 * lewat apa adanya — karena itu matcher mengecualikannya.
 *
 * Mode etalase (PETA_SAJA=1, mis. deploy Vercel coba-coba): semua halaman
 * publik selain /<locale> dialihkan ke /id, dan /admin
 * dikembalikan 404 — CMS tidak ikut dipamerkan.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rute lama konsol peta (/id/peta) — sejak konsol menjadi index, tautan
  // lama (bagikan, bookmark) dialihkan permanen ke /<locale>. Berlaku di
  // kedua mode (biasa maupun etalase) dan diletakkan paling atas supaya tak
  // tersangkut aturan lain di bawah.
  const bahasaLawas = BAHASA.find((b) => pathname === `/${b}/peta` || pathname.startsWith(`/${b}/peta/`));
  if (bahasaLawas) {
    request.nextUrl.pathname = `/${bahasaLawas}`;
    return NextResponse.redirect(request.nextUrl, 308);
  }

  // Beranda lama (/<locale>/beranda) tidak dibuka untuk umum — konsol peta di
  // /<locale> adalah halaman utama. Ditolak 404 di kedua mode; berkas halamannya
  // dibiarkan ada supaya mudah dibuka lagi bila diperlukan.
  if (BAHASA.some((b) => pathname === `/${b}/beranda` || pathname.startsWith(`/${b}/beranda/`))) {
    return new NextResponse(null, { status: 404 });
  }

  if (process.env.PETA_SAJA === "1") {
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      return new NextResponse(null, { status: 404 });
    }
    const kePeta = BAHASA.some((b) => pathname === `/${b}` || pathname === `/${b}/`);
    // Panel situasi seluler ikut dibuka: di ponsel dasbor dipecah dua halaman
    // — daftar laporan di /<locale> dan panel di /<locale>/karhutla/panel — dan
    // bilah tab bawah menautkannya. Tanpa pengecualian ini tombol panelnya
    // memulangkan pengunjung ke /id, yang terasa seperti tombol mati.
    const kePanel = BAHASA.some((b) =>
      pathname === `/${b}/karhutla/panel` || pathname === `/${b}/karhutla/panel/`);
    // Peta sematan (iframe di situs lain) — lihat app/[locale]/embed.
    const keSemat = BAHASA.some((b) => pathname === `/${b}/embed`);
    const aset = pathname.startsWith("/_next/") || pathname.startsWith("/assets/") || pathname.startsWith("/css/") ||
      pathname.startsWith("/api/") || pathname.startsWith("/media/") || pathname.includes(".");
    if (!kePeta && !kePanel && !keSemat && !aset) {
      request.nextUrl.pathname = "/id";
      return NextResponse.redirect(request.nextUrl, 308);
    }
  }

  // CMS tidak berprefiks bahasa. Matcher memasukkan /admin hanya supaya mode
  // etalase di atas bisa menutupnya; di mode biasa ia lewat apa adanya.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return NextResponse.next();
  }

  const adaPrefiks = BAHASA.some((b) => pathname === `/${b}` || pathname.startsWith(`/${b}/`));
  if (!adaPrefiks) {
    request.nextUrl.pathname = `/${BAHASA[0]}${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(request.nextUrl, 308);
  }

  const match = pathname.match(/^\/(id|en)(\/|$)/);
  const locale = match ? match[1] : BAHASA[0];
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-locale", locale);
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  // Lewati internal Next.js, rute tanpa-bahasa (admin/api/media), berkas
  // statis, dan semua yang berekstensi (favicon.ico, robots.txt, llms.txt dsb.).
  // /admin ikut dicocokkan terpisah: tanpa itu PETA_SAJA=1 tak pernah bisa
  // mengembalikan 404 untuk CMS (proxy tak dijalankan sama sekali di sana).
  matcher: ["/((?!_next|admin|api|media|assets|llms|robots|sitemap|.*\\..*).*)", "/admin", "/admin/:path*"],
};