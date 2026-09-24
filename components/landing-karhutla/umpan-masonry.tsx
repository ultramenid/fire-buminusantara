"use client";

import { useMemo } from "react";
import type { Laporan } from "./tipe";

/* Umpan masonry berkolom tetap — pola yang sama dengan MasonryKolom di index:
   kartu dibagi bergiliran (0,1,2,0,1,2…) ke sejumlah daftar terpisah, lalu
   daftar-daftar itu dijajar. Sengaja BUKAN CSS `columns`: di sana peramban
   yang memutuskan isi tiap kolom dan menghitung ulangnya setiap tinggi isi
   berubah — gambar yang baru termuat melempar kartu ke kolom lain. Di sini
   penempatan ditentukan indeks, jadi kekal: gambar yang telat hanya mendorong
   kartu di bawahnya dalam kolom yang sama. */
export function UmpanMasonry({ daftar, kolom, kartu }: {
  daftar: Laporan[];
  kolom: number;
  kartu: (l: Laporan, i: number) => React.ReactNode;
}) {
  const keranjang = useMemo(() => {
    const isi: Laporan[][] = Array.from({ length: Math.max(1, kolom) }, () => []);
    daftar.forEach((l, i) => {
      isi[i % isi.length].push(l);
    });
    return isi;
  }, [daftar, kolom]);

  return (
    <div className="lk-masonry mt-5 flex items-start">
      {keranjang.map((isiKolom, i) => (
        <div key={i} className="lk-masonry-kolom flex min-w-0 flex-1 flex-col">
          {isiKolom.map((l, j) => kartu(l, i * 100 + j))}
        </div>
      ))}
    </div>
  );
}