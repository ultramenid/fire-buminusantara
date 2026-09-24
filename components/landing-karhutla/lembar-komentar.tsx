"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { gunakanKomentar } from "@/hooks/gunakan-komentar";
import type { Bahasa } from "@/lib/bahasa";
import { TEKS } from "./teks";

const UlasanKomentar = dynamic(() => import("@/components/kolom-komentar").then((m) => m.UlasanKomentar), { ssr: false });
const FormulirKomentar = dynamic(() => import("@/components/kolom-komentar").then((m) => m.FormulirKomentar), { ssr: false });

/* Lembar komentar seluler ala IG: gagang + judul + daftar + formulir,
   memakai sistem komentar yang sama dengan rincian (bukan tiruan).
   Lembar tulis bawaan formulir dinaikkan di atas lembar ini via CSS. */
export function LembarKomentar({ id, bahasa, onTutup }: {
  id: number; bahasa: Bahasa; onTutup: () => void;
}) {
  const t = TEKS[bahasa];
  const k = gunakanKomentar(id);

  useEffect(() => {
    const saatTombol = (e: KeyboardEvent) => {
      if (e.key === "Escape") onTutup();
    };
    window.addEventListener("keydown", saatTombol);
    const limpahan = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", saatTombol);
      document.body.style.overflow = limpahan;
    };
  }, [onTutup]);

  return (
    <div className="lk-komentar-latar cursor-pointer" onClick={onTutup}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.komentar}
        onClick={(e) => e.stopPropagation()}
        className="lk-komentar bg-white text-tinta border-t border-black/[0.08] shadow-2xl dark:bg-[#1e1e1e] dark:text-[#f5f5f5] dark:border-white/10"
      >
        <span aria-hidden="true" className="lk-komentar-gagang bg-black/20 dark:bg-white/30" />
        <h2 className="text-tinta dark:text-[#f5f5f5]">{t.komentar}</h2>
        <div className="lk-komentar-daftar">
          <UlasanKomentar
            daftar={k.daftar}
            memuat={k.memuat}
            galat={k.galat}
            tampilkanBalasan={k.tampilkanBalasan}
            alihkanBalasan={k.alihkanBalasan}
            mulaiBalas={k.mulaiBalas}
            sebutanDari={k.sebutanDari}
            isiTanpaSebutan={k.isiTanpaSebutan}
          />
        </div>
        <div className="lk-komentar-form">
          <FormulirKomentar
            mengirim={k.mengirim}
            galat={k.galat}
            nama={k.nama}
            setNama={k.setNama}
            email={k.email}
            setEmail={k.setEmail}
            anonim={k.anonim}
            setAnonim={k.setAnonim}
            isi={k.isi}
            setIsi={k.setIsi}
            website={k.website}
            setWebsite={k.setWebsite}
            balasKe={k.balasKe}
            balasNama={k.balasNama}
            batalBalas={k.batalBalas}
            kirim={k.kirim}
            ketikRef={k.ketikRef}
            captchaRef={k.captchaRef}
            tanpaSheet
          />
        </div>
      </div>
    </div>
  );
}