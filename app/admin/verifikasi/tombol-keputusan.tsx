"use client";

import { useState } from "react";
import { Pemuat } from "../pemuat";
import { TombolKonfirmasi } from "../tombol-konfirmasi";
import { useAksi } from "../use-aksi";
import { aksiSetujuiKtp, aksiTolakKtp } from "./aksi";

/** Sama dengan BATAS_ALASAN di lib/verifikasi-ktp.ts — tidak diimpor: modul itu
 *  menyeret node:fs dan Prisma ke bundel peramban. Server tetap memotongnya. */
const BATAS_ALASAN = 500;

/** Alasan yang paling sering — satu ketuk mengisi kotaknya, tetap bisa disunting. */
const ALASAN_CEPAT = [
  "Foto KTP buram, terpotong, atau tidak terbaca.",
  "NIK yang diketik tidak sama dengan NIK di KTP.",
  "Foto bukan KTP asli (fotokopi, layar, atau hasil sunting).",
  "NIK di foto tertutup jari atau silau.",
];

/**
 * Keputusan atas satu pengajuan verifikasi KTP. Setujui butuh dua tekan
 * (TombolKonfirmasi); Tolak membuka kotak alasan — wajib, karena alasan itulah
 * yang dibaca warga di aplikasi untuk mengirim ulang dengan benar. Setelah
 * diputuskan, daftar disegarkan dan pengajuan ini hilang dari antrean.
 */
export function TombolKeputusanKtp({ id, bolehSetuju }: { id: string; bolehSetuju: boolean }) {
  const [sibuk, jalankan] = useAksi();
  const [pastikan, setPastikan] = useState(false);
  const [tolak, setTolak] = useState(false);
  const [alasan, setAlasan] = useState("");
  const kecil = "cms-tombol cms-tombol--kecil";

  if (tolak) {
    return (
      <form className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              jalankan(() => aksiTolakKtp(id, alasan), "Pengajuan ditolak — foto dan NIK-nya dihapus.");
            }}>
        <label htmlFor={`alasan-${id}`} className="cms-label-isian">
          Alasan penolakan<span aria-hidden="true" className="text-[var(--api)]"> *</span>
        </label>
        <textarea id={`alasan-${id}`} required autoFocus rows={3} maxLength={BATAS_ALASAN}
                  value={alasan} onChange={(e) => setAlasan(e.target.value)}
                  placeholder="Ditampilkan ke warga di aplikasi."
                  className="cms-isian w-full" />
        <div className="flex flex-wrap gap-1.5">
          {ALASAN_CEPAT.map((a) => (
            <button key={a} type="button" onClick={() => setAlasan(a)} className={`${kecil} cms-tombol--hantu h-auto py-1 text-left`}>
              {a}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={sibuk || !alasan.trim()} aria-busy={sibuk} className={`${kecil} cms-tombol--bahaya`}>
            {sibuk && <Pemuat />}
            Tolak pengajuan
          </button>
          <button type="button" disabled={sibuk} onClick={() => setTolak(false)} className={`${kecil} cms-tombol--hantu`}>
            Batal
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {bolehSetuju && (
        <TombolKonfirmasi
          label="Setujui"
          labelKonfirmasi="Ya, setujui"
          className={`${kecil} cms-tombol--utama`}
          sibuk={sibuk}
          terbuka={pastikan}
          onTerbukaChange={setPastikan}
          onKonfirmasi={() => jalankan(() => aksiSetujuiKtp(id), "Akun terverifikasi — foto dan NIK-nya dihapus.")}
          durasiDetik={5}
        />
      )}
      <button type="button" disabled={sibuk} onClick={() => setTolak(true)} className={`${kecil} cms-tombol--garis`}>
        Tolak…
      </button>
    </div>
  );
}
