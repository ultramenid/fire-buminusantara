"use client";

import { useCallback, useState } from "react";
import { VideoKartu } from "./video-kartu";
import type { ItemMedia } from "@/lib/media";

type Props = {
  media: ItemMedia[];
  /** Poster untuk tiap video kartu — thumbnail kejadian, bukan per media. */
  poster: string | null;
  label: string;
  /** Kartu ini sedang di tengah? Hanya yang tengah yang diputar & bisa diklik. */
  aktif: boolean;
  kurangiGerak: boolean;
  /** Kelas untuk elemen media; sama untuk foto dan video agar kotaknya identik. */
  kelasMedia: string;
  onBuka: () => void;
  /** Dipanggil saat titik ditekan — memundurkan hitungan geser otomatis korsel
   *  supaya media yang baru dipilih tidak langsung tergeser. */
  onGeser: () => void;
};

/**
 * Slider media pada satu kartu korsel.
 *
 * Hanya media yang sedang ditunjuk yang dirender. Di Alpine seluruh media
 * dipasang bersamaan lalu disembunyikan dengan x-show — dan itulah sumber
 * bug-nya: `x-show` tidak menjeda <video>, jadi semua video satu kartu berjalan
 * sekaligus, ikut mengunduh berkasnya dan ikut memicu `ended`. Di sini yang
 * tersembunyi memang tidak ada di DOM, jadi persoalannya tidak bisa muncul.
 */
export function SliderKartu({
  media, poster, label, aktif, kurangiGerak, kelasMedia, onBuka, onGeser,
}: Props) {
  // Indeks bertahan per kartu, seperti map indeksMedia[kunci] di Alpine: kartu
  // yang tergeser keluar lalu kembali menampilkan media yang tadi dipilih.
  const [indeks, setIndeks] = useState(0);

  // Galeri bisa menyusut saat data dimuat ulang; indeks yang tertinggal di luar
  // batas akan merender undefined.
  const kini = indeks < media.length ? indeks : 0;

  const m = media[kini];
  if (!m) return null;

  return (
    <>
      {m.jenis === "video" ? (
        // key: media berganti berarti elemen video berganti, bukan sekadar
        // src-nya. Tanpa itu React memakai ulang elemen yang sama dan lencana
        // durasi milik media sebelumnya sempat terbawa.
        // Poster per-media (bingkai videonya sendiri) menang atas thumbnail
        // kejadian — kartu multi-video tidak berbagi satu gambar yang salah.
        <VideoKartu key={`v${kini}`} src={m.url} poster={m.poster ?? poster} label={label} aktif={aktif}
                    kurangiGerak={kurangiGerak} className={kelasMedia} onBuka={onBuka} />
      ) : (
        <FotoKartu key={`g${kini}`} src={m.url} alt={label} aktif={aktif}
                   className={kelasMedia} onBuka={onBuka} />
      )}

      {media.length > 1 && (
        <div className="absolute bottom-1.5 left-1/2 z-20 flex -translate-x-1/2 items-center">
          {media.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Media ${i + 1}`}
              aria-current={i === kini}
              onClick={(e) => {
                e.stopPropagation();
                setIndeks(i);
                onGeser();
              }}
              className="flex min-h-[28px] min-w-[28px] items-center justify-center p-1"
            >
              <span
                aria-hidden="true"
                className={`block h-2 w-2 rounded-full transition-all ${
                  i === kini ? "scale-110 bg-white" : "bg-white/50 hover:bg-white/75"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function FotoKartu({
  src,
  alt,
  aktif,
  className,
  onBuka,
}: {
  src: string;
  alt: string;
  aktif: boolean;
  className: string;
  onBuka: () => void;
}) {
  const [fotoSiap, setFotoSiap] = useState(false);

  /* Foto yang sudah di tembolok peramban sudah `complete` sejak elemennya
     dipasang, dan onLoad TIDAK dijamin menyala lagi untuknya. Tanpa cek ini
     setiap remount memasang kerangka dulu — dan kartu memang di-mount ulang
     serentak begitu daftar berita berubah (mis. kejadian baru masuk lewat
     penyegar otomatis), sehingga semua foto berkedip putih bersamaan.
     Ref callback berjalan sebelum paint, jadi kerangkanya tidak sempat
     terlihat. */
  const pasangFoto = useCallback((el: HTMLImageElement | null) => {
    if (el?.complete) setFotoSiap(true);
  }, []);

  return (
    <>
      <img
        ref={pasangFoto}
        src={src}
        alt={alt}
        loading="eager"
        decoding="async"
        onLoad={() => setFotoSiap(true)}
        onError={() => setFotoSiap(true)}
        onClick={(e) => {
          if (aktif) {
            e.stopPropagation();
            onBuka();
          }
        }}
        className={`${className} ${aktif ? "grayscale-0" : "grayscale-[0.65]"}`}
      />
      <div aria-hidden="true" className={`kartu-kerangka ${fotoSiap ? "tutup" : ""}`} />
    </>
  );
}
