"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { Bahasa } from "@/lib/bahasa";
import { mediaLokal } from "@/lib/media";
import { IkonBagikan } from "./ikon";
import { VideoOtomatis } from "./video-otomatis";
import { TEKS } from "./teks";
import type { Laporan } from "./tipe";

/* Tampilan "Postingan" seluler ala IG — dibuka dari tap gambar di umpan
   (desktop langsung ke rincian). Bilah kembali + judul, baris penulis,
   media selebar layar (dots ketuk, tanpa geser), baris aksi (suka
   perangkat-lokal, komentar, bagikan), caption + selengkapnya + tanggal. */
export function TampilanPostingan({ laporan: l, bahasa, onTutup, onBuka, onKomentar, onPrev, onNext, statis = false }: {
  laporan: Laporan;
  bahasa: Bahasa;
  onTutup: () => void;
  onBuka: () => void;
  onKomentar: () => void;
  /** Navigasi antar postingan ala Instagram: panah pindah postingan
      sebelumnya/berikutnya. Tak diberikan → panah disembunyikan. */
  onPrev?: () => void;
  onNext?: () => void;
  /** true di halaman detail tersendiri: mengalir normal, bukan overlay fixed. */
  statis?: boolean;
}) {
  const t = TEKS[bahasa];
  const [idx, setIdx] = useState(0);
  const [tersalin, setTersalin] = useState(false);
  const [descPenuh, setDescPenuh] = useState(false);
  const sentuh = useRef<{ x: number; y: number } | null>(null);
  // Jumlah komentar untuk angka di samping ikon — diambil sekali saat buka.
  const [jumlahKomentar, setJumlahKomentar] = useState<number | null>(null);
  useEffect(() => {
    let hidup = true;
    fetch(`/api/laporan/${l.id}/komentar`, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        if (!hidup) return;
        const daftar = Array.isArray((j as { komentar?: unknown })?.komentar)
          ? ((j as { komentar: { balasan?: unknown[] }[] }).komentar)
          : [];
        setJumlahKomentar(
          daftar.reduce((n, k) => n + 1 + (Array.isArray(k.balasan) ? k.balasan.length : 0), 0),
        );
      })
      .catch(() => {
        /* gagal muat: angka disembunyikan, bukan dinolkan */
      });
    return () => {
      hidup = false;
    };
  }, [l.id]);
  // "Selengkapnya" hanya bila deskripsi benar-benar terpotong clamp —
  // diukur, bukan ditebak dari panjang teks (responsif di semua lebar).
  const descRef = useRef<HTMLSpanElement | null>(null);
  const [descTerpotong, setDescTerpotong] = useState(false);
  useEffect(() => {
    const ukur = () => {
      // Saat mengembang jangan ukur (tak terpotong) — tombolnya harus tetap
      // ada supaya bisa melipat lagi.
      if (descPenuh) return;
      const el = descRef.current;
      setDescTerpotong(!!el && el.scrollHeight > el.clientHeight + 1);
    };
    ukur();
    window.addEventListener("resize", ukur);
    return () => window.removeEventListener("resize", ukur);
  }, [l.deskripsi, descPenuh]);
  // Satu media utama bila galeri kosong (jaga-jaga): bangun dari gambar/video.
  const items = l.galeri.length > 0
    ? l.galeri
    : [{ url: "", jenis: "gambar" as const }];
  const n = items.length;
  const aktif = items[Math.min(idx, n - 1)];

  useEffect(() => {
    const saatTombol = (e: KeyboardEvent) => {
      if (e.key === "Escape") onTutup();
      if (e.key === "ArrowLeft") onPrev?.();
      if (e.key === "ArrowRight") onNext?.();
    };
    window.addEventListener("keydown", saatTombol);
    // Kunci badan hanya mode overlay — varian halaman (statis) harus bisa
    // menggulir normal.
    if (statis) {
      return () => window.removeEventListener("keydown", saatTombol);
    }
    const limpahan = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", saatTombol);
      document.body.style.overflow = limpahan;
    };
  }, [onTutup, statis, onPrev, onNext]);

  async function bagikan() {
    const tautan = `${window.location.origin}${l.href}`;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: l.judul, url: tautan });
        return;
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(tautan);
      setTersalin(true);
      window.setTimeout(() => setTersalin(false), 2000);
    } catch {
      /* izin clipboard diblokir */
    }
  }

  return (
    <div className={`lk-postingan${statis ? " lk-postingan--statis" : ""} bg-white text-tinta dark:bg-black dark:text-[#f5f5f5]`} role="dialog" aria-modal="true" aria-label={l.judul}>
      <div className="lk-postingan-penulis bg-white/95 text-tinta border-b border-black/[0.06] dark:bg-black/90 dark:text-[#f5f5f5] dark:border-white/10">
        <button
          type="button"
          onClick={onTutup}
          aria-label={bahasa === "en" ? "Back" : "Kembali"}
          className="lk-postingan-kembali cursor-pointer -ml-1 mr-0.5 rounded-full p-1.5 text-tinta transition hover:bg-black/10 dark:text-[#f5f5f5] dark:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#ff5a26]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <Image src="/assets/img/logo-fire.png" alt="" aria-hidden="true" width={99} height={160} className="lk-postingan-avatar" />
        <div className="min-w-0 flex-1">
          <p className="lk-postingan-nama text-tinta dark:text-[#f5f5f5]">Lapor Karhutla</p>
          {l.lokasi && <p className="lk-postingan-lokasi text-black/55 dark:text-[#a0a0a0]">{l.lokasi}</p>}
        </div>
      </div>

      <div
        className="lk-postingan-media"
        onTouchStart={(e) => {
          const s = e.touches[0];
          sentuh.current = { x: s.clientX, y: s.clientY };
        }}
        onTouchEnd={(e) => {
          const awal = sentuh.current;
          sentuh.current = null;
          if (!awal || n < 2) return;
          const s = e.changedTouches[0];
          const dx = s.clientX - awal.x;
          const dy = s.clientY - awal.y;
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            setIdx((i) => (i + (dx < 0 ? 1 : -1) + n) % n);
          }
        }}
      >
        {aktif.jenis === "video" ? (
          <VideoOtomatis url={aktif.url} poster={aktif.poster ?? l.gambar} label={l.judul} onBuka={onBuka} tanpaMt kredit={aktif.keterangan ?? "anonim"} bahasa={bahasa} />
        ) : aktif.url ? (
          <span className="lk-media-statis">
            {mediaLokal(aktif.url) ? (
              <Image src={aktif.url} alt={l.alt} width={0} height={0} sizes="100vw" className="lk-postingan-foto" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- URL media remote warisan, host dinamis di luar remotePatterns
              <img src={aktif.url} alt={l.alt} className="lk-postingan-foto" />
            )}
            <span aria-hidden="true" className="lk-kredit">
              ©&nbsp;{aktif.keterangan ?? "anonim"}
            </span>
          </span>
        ) : null}
        {onPrev && (
          <button
            type="button"
            aria-label="Postingan sebelumnya"
            onClick={onPrev}
            className="rincian__slider-tombol rincian__slider-tombol--kiri cursor-pointer"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18 9 12l6-6" />
            </svg>
          </button>
        )}
        {onNext && (
          <button
            type="button"
            aria-label="Postingan berikutnya"
            onClick={onNext}
            className="rincian__slider-tombol rincian__slider-tombol--kanan cursor-pointer"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        )}
        {n > 1 && (
          <div className="lk-postingan-titik" role="group" aria-label={`${idx + 1} / ${n}`}>
            {items.map((m, i) => (
              <button
                key={`${m.url}-${i}`}
                type="button"
                onClick={() => setIdx(i)}
                aria-label={`${i + 1} / ${n}`}
                aria-current={i === idx}
                className="lk-postingan-titik-tombol cursor-pointer"
              >
                <span aria-hidden="true" data-aktif={i === idx} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="lk-postingan-aksi">
        <button type="button" onClick={onKomentar} aria-label={t.komentar} className="lk-postingan-ikon lk-postingan-komentar cursor-pointer text-tinta transition hover:bg-black/10 dark:text-[#f5f5f5] dark:hover:bg-white/10">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9"
               strokeLinecap="round" strokeLinejoin="round" className="size-7">
            <path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z" />
          </svg>
          {jumlahKomentar !== null && (
            <span aria-hidden="true">{jumlahKomentar.toLocaleString("id-ID")}</span>
          )}
        </button>
        <button type="button" onClick={bagikan} aria-label={tersalin ? t.lembarTersalin : t.lembarBagikan} className="lk-postingan-ikon cursor-pointer text-tinta transition hover:bg-black/10 dark:text-[#f5f5f5] dark:hover:bg-white/10">
          <IkonBagikan />
        </button>
      </div>

      <div className="lk-postingan-caption">
        <p className="lk-postingan-caption-judul text-tinta dark:text-[#f5f5f5]">{l.judul}</p>
        {l.deskripsi && (
          <p className="lk-postingan-caption-isi text-tinta dark:text-[#f5f5f5]">
            <span ref={descRef} className={descPenuh ? "" : "lk-postingan-caption-pendek"}>{l.deskripsi}</span>{" "}
            {descTerpotong && (
              <button type="button" onClick={() => setDescPenuh((v) => !v)} className="lk-postingan-selengkapnya cursor-pointer text-black/60 dark:text-[#a0a0a0]">
                {descPenuh ? t.lebihSedikit : t.selengkapnya}
              </button>
            )}
          </p>
        )}
        <p className="lk-postingan-tanggal text-black/50 dark:text-[#a0a0a0]">{l.tanggal}</p>
      </div>
    </div>
  );
}