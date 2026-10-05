import Link from "next/link";
import type { Metadata } from "next";
import { ISI, KopPanel } from "./ruang";

export const metadata: Metadata = {
  title: "404 — Tidak ditemukan | CMS Pasopati Fire",
  robots: { index: false, follow: false },
};

/** Tujuan yang masuk akal dari sebuah jalan buntu di meja jaga: tiga antrean
 *  yang memang dikerjakan tiap hari. Ringkasan sudah jadi tombol di kop. */
const JALAN_KELUAR = [
  { href: "/admin/laporan", label: "Laporan warga" },
  { href: "/admin/komentar", label: "Komentar" },
  { href: "/admin/kejadian", label: "Kejadian" },
];

/**
 * 404 khusus CMS.
 *
 * Tanpa berkas ini, `notFound()` dari halaman mana pun di bawah /admin jatuh
 * ke app/not-found.tsx — halaman publik bertombol "Kembali ke Beranda" dan
 * "English Version", yang melempar petugas keluar dari meja kerjanya.
 *
 * Yang paling sering membawa orang ke sini bukan salah ketik URL, melainkan
 * catatan yang lenyap di bawah kaki sendiri: rekan menghapus laporan yang
 * sedang dibuka, dan halaman ini menggantikannya saat penyegar otomatis
 * memuat ulang. Karena itu kalimatnya menyebut kemungkinan itu lebih dulu —
 * dan karena berkas ini duduk di bawah layout /admin, tulang punggung beserta
 * angka tunggakannya tetap terpasang di samping.
 */
export default function TidakDitemukan() {
  return (
    <>
      <KopPanel
        mata="Galat 404"
        judul="Tidak ditemukan"
      >
        <Link href="/admin" className="cms-tombol cms-tombol--garis">
          Ke ringkasan
        </Link>
      </KopPanel>
      <div className={ISI}>
        <p className="mb-5 max-w-[64ch] text-[13px] leading-[1.55] text-[var(--redup)]">{"Catatan yang dituju mungkin sudah dihapus peninjau lain, atau alamatnya keliru. Tidak ada yang perlu diperbaiki di sini — pilih antrean di bawah, atau pakai menu di samping."}</p>

      <div className="cms-kosong">
        <p className="cms-judul text-[18px]">Jalan buntu</p>
        <p className="mx-auto mt-2 max-w-[46ch] text-[13.5px] text-[var(--redup)]">
          Halaman yang Anda tuju tidak ada di CMS ini.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {JALAN_KELUAR.map((t) => (
            <Link key={t.href} href={t.href} className="cms-tombol cms-tombol--garis cms-tombol--kecil">
              {t.label}
            </Link>
          ))}
        </div>
      </div>
      </div>
    </>
  );
}
