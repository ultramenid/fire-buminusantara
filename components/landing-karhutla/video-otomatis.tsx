"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { mediaLokal } from "@/lib/media";
import type { Bahasa } from "@/lib/bahasa";
import { IkonPutarBadge } from "./ikon";

/* Lebar kartu umpan untuk srcset next/image: 2 kolom di bawah 1100px (1 kolom
   di layar sangat sempit), 3-4 kolom di panggung — 33vw batas atasnya. */
export const UKURAN_FOTO_UMPAN = "(max-width: 359px) 100vw, (max-width: 1099px) 50vw, 33vw";

/* Video kartu umpan — tidak autoplay otomatis; pratinjau putar bisu hanya saat kursor melayang (hover).
   Klik membuka modal rincian yang memuat pemutar video lengkap dengan kendali.
   preload="none" mencegah unduhan data video sebelum interaksi, demi performa PageSpeed Insights. */
export function VideoOtomatis({ url, poster, label, onBuka, tanpaMt = false, kredit = null }: {
  url: string; poster: string | null; label: string; onBuka: () => void;
  /** true di dalam carousel — margin atas milik wadah, bukan tombol. */
  tanpaMt?: boolean;
  /** Nama kredit untuk pil © — null = tanpa pil. */
  kredit?: string | null;
  bahasa?: Bahasa;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [siap, setSiap] = useState(false);
  const [posterGagal, setPosterGagal] = useState(false);
  const [sedangHover, setSedangHover] = useState(false);

  const mulaiHover = useCallback(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;
    el.muted = true;
    setSedangHover(true);
    el.play().catch(() => {});
  }, []);

  const hentiHover = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setSedangHover(false);
    el.pause();
    if (el.readyState >= 1 && el.currentTime) el.currentTime = 0;
  }, []);

  // Pastikan video berhenti saat unmount
  useEffect(() => {
    const el = ref.current;
    return () => {
      if (el) el.pause();
    };
  }, []);

  return (
    <div
      className={`lk-foto block w-full${tanpaMt ? "" : " mt-3"}`}
      onMouseEnter={mulaiHover}
      onMouseLeave={hentiHover}
    >
      <span className="relative block">
        <button
          type="button"
          onClick={onBuka}
          aria-label={label}
          className="group block w-full cursor-pointer transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5a26] hover:brightness-95"
        >
          {poster && !posterGagal ? (
            <>
              {mediaLokal(poster) ? (
                /* Poster unggahan lokal lewat optimizer (AVIF/WebP, srcset
                   selebar kartu); rasio alaminya tetap dari CSS h-auto. */
                <Image
                  src={poster} alt="" aria-hidden="true" loading="lazy"
                  width={0} height={0} sizes={tanpaMt ? "100vw" : UKURAN_FOTO_UMPAN}
                  onError={() => setPosterGagal(true)}
                  className="lk-foto h-auto w-full"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- URL media remote warisan, host dinamis di luar remotePatterns
                <img
                  src={poster} alt="" aria-hidden="true" loading="lazy"
                  onError={() => setPosterGagal(true)}
                  className="lk-foto h-auto w-full"
                />
              )}
              <video
                ref={ref}
                src={url}
                muted
                playsInline
                loop
                preload="none"
                aria-hidden="true"
                tabIndex={-1}
                onCanPlay={() => setSiap(true)}
                onPlaying={() => setSiap(true)}
                className={`lk-video absolute inset-0 h-full w-full object-cover transition duration-300 ${sedangHover && siap ? "opacity-100" : "opacity-0"}`}
              />
            </>
          ) : (
            <video
              ref={ref}
              src={url}
              muted
              playsInline
              loop
              preload="none"
              aria-hidden="true"
              tabIndex={-1}
              onCanPlay={() => setSiap(true)}
              onPlaying={() => setSiap(true)}
              className="lk-foto h-auto w-full"
            />
          )}

          {/* Lencana indikator video: ikon putar putih di kanan bawah yang memudar saat sedang diputar */}
          <span
            aria-hidden="true"
            className={`absolute bottom-2.5 right-2.5 z-2 flex size-7 items-center justify-center rounded-full bg-black/65 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.7)] transition-all duration-200 pointer-events-none ${sedangHover && siap ? "opacity-0 scale-90" : "opacity-100 scale-100"}`}
          >
            <IkonPutarBadge className="size-4" />
          </span>
        </button>

        {kredit !== null && (
          <span aria-hidden="true" className="lk-kredit">
            ©&nbsp;{kredit || "anonim"}
          </span>
        )}
      </span>
    </div>
  );
}