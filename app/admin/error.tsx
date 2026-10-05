"use client";

import Link from "next/link";
import { ISI, KopPanel } from "./ruang";

/**
 * Batas galat CMS.
 *
 * Tanpa berkas ini, aksi yang melempar (DB tersendat saat "Setujui"/"Hapus")
 * jatuh ke app/global-error.tsx dan seluruh CMS — menu samping ikut — lenyap.
 * Di sini layout /admin tetap terpasang dan petugas cukup menekan "Coba lagi".
 * Pesan galat mentah sengaja tidak ditampilkan; `digest` cukup untuk mencocokkan
 * baris log server.
 */
export default function GalatAdmin({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <>
      <KopPanel
        mata="Galat"
        judul="Ada yang gagal"
      >
        <Link href="/admin" className="cms-tombol cms-tombol--garis">
          Ke ringkasan
        </Link>
      </KopPanel>
      <div className={ISI}>
        <p className="mb-5 max-w-[64ch] text-[13px] leading-[1.55] text-[var(--redup)]">{"Permintaan terakhir tidak berhasil diproses. Data Anda tidak berubah kecuali halaman menyatakan sebaliknya. Coba lagi; bila berulang, kirim kode di bawah ke pengelola."}</p>

      <div className="cms-kosong" role="alert">
        <button type="button" onClick={() => retry()} className="cms-tombol cms-tombol--utama">
          Coba lagi
        </button>
        {error.digest && (
          <p className="mt-4 font-mono text-[12px] text-[var(--redup)]">Kode: {error.digest}</p>
        )}
      </div>
      </div>
    </>
  );
}
