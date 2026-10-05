import type { Metadata } from "next";
import { bacaSesi } from "@/lib/sesi";
import { hitungTunggakan } from "@/lib/tunggakan";
import { MenuAdmin, MenuAdminAtas } from "./menu-admin";
import { TunggakanHidup } from "./tunggakan-hidup";
import { Toaster } from "./toaster";
import { Penjaga } from "./penjaga";
import { Palet } from "./palet";
import { Pintasan } from "./ruang-klien";
import "./cms.css";

// instant = false: disengaja — seluruh CMS bergerbang sesi.
//
// Setiap halaman di bawah sini memanggil bacaSesi() di puncaknya lalu
// redirect ke /admin/login; membungkus pembacaan itu dalam <Suspense> justru
// melumpuhkan gerbangnya. Di layout, flag ini menutup seluruh subpohon saat
// build — navigasi klien tetap divalidasi per segmen di dev, jadi tiap
// halaman CMS masih memunculkan insight blocking-prerender-dynamic di
// overlay. Itu diharapkan, bukan kebocoran.
//
// Memindahkan gerbangnya ke proxy.ts adalah perbaikan arsitektur tersendiri,
// bukan pekerjaan Cache Components.
export const instant = false;

export const metadata: Metadata = {
  title: "CMS Pasopati Fire",
  description: "Panel admin pengelolaan pantauan karhutla Indonesia.",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sesi = await bacaSesi();

  // Halaman masuk ikut berada di bawah /admin. Tanpa sesi, kerangkanya tidak
  // dipasang: pintu masuk tidak boleh memamerkan menu yang belum boleh dibuka.
  if (!sesi) {
    return <div className="cms min-h-screen">{children}<Toaster /></div>;
  }

  // Titik awal angka tunggakan; TunggakanHidup menyambungkannya ke aliran SSE.
  const tunggakan = await hitungTunggakan();

  // Satu jendela setinggi layar, seperti aplikasi desktop: halaman tidak
  // bergulir — <main> dan panel di dalamnya yang bergulir sendiri.
  return (
    <div className="cms h-dvh overflow-hidden">
      <TunggakanHidup awal={tunggakan}>
        <div className="flex h-full flex-col lg:flex-row">
          <MenuAdmin tunggakan={tunggakan} peran={sesi.peran} nama={sesi.nama} />
          <MenuAdminAtas tunggakan={tunggakan} peran={sesi.peran} />
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </TunggakanHidup>
      <Palet peran={sesi.peran} />
      <Penjaga />
      <Pintasan />
      <Toaster />
    </div>
  );
}
