"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pemuat } from "../pemuat";
import { TombolKonfirmasi } from "../tombol-konfirmasi";
import { useAksi } from "../use-aksi";
import { aksiSetujui, aksiHapus, aksiUbahIsi } from "./aksi";
import { Ikon } from "../menu-admin";

/** Tombol moderasi satu komentar. Menghapus butuh dua tekan (TombolKonfirmasi). */
export function AksiKomentar({
  id, disetujui, bolehHapus, berikutnya, ringkas = false,
}: {
  id: number;
  disetujui: boolean;
  /** Membuang komentar hanya untuk admin — editor boleh meninjau, tidak membuang. */
  bolehHapus: boolean;
  /** Di halaman rincian: jalur komentar berikutnya (saringan yang sama), dibuka
   *  sesudah memutuskan. `null` = tidak ada lagi → kembali ke tabel. Tidak
   *  diisi (baris tabel) = cukup segarkan di tempat. */
  berikutnya?: string | null;
  /** Baris tabel: aksi sekunder berupa tombol hantu supaya tabel tetap tenang. */
  ringkas?: boolean;
}) {
  const [sibuk, jalankanAksi] = useAksi();
  const router = useRouter();
  const jalankan = (kerja: Parameters<typeof jalankanAksi>[0], kabar: string, hapus = false) => {
    const ke = berikutnya === undefined ? null : berikutnya ?? (hapus ? "/admin/komentar" : null);
    jalankanAksi(kerja, kabar, ke ? () => router.push(ke) : undefined);
  };
  const kecil = ringkas ? "cms-tombol cms-tombol--kecil" : "cms-tombol";

  return (
    <div className={`flex shrink-0 flex-nowrap items-center ${ringkas ? "justify-end gap-0.5" : "gap-2"}`}>
      {disetujui ? (
        <button type="button" disabled={sibuk} aria-busy={sibuk}
                onClick={() => jalankan(() => aksiSetujui(id, false), "Komentar disembunyikan.")}
                className={`${kecil} ${ringkas ? "cms-tombol--hantu" : "cms-tombol--garis"}`}>
          {sibuk ? <Pemuat /> : <Ikon nama="mata" className="size-3.5" />}
          Sembunyikan
        </button>
      ) : (
        <button type="button" disabled={sibuk} aria-busy={sibuk}
                onClick={() => jalankan(() => aksiSetujui(id, true), "Komentar disetujui dan tampil di situs.")}
                className={`${kecil} ${ringkas ? "cms-tombol--garis" : "cms-tombol--utama"}`}>
          {sibuk ? <Pemuat /> : <Ikon nama="centang" className="size-3.5" />}
          Setujui
        </button>
      )}

      {bolehHapus && (
        <TombolKonfirmasi
          label="Hapus"
          labelKonfirmasi="Ya, hapus"
          className={`${kecil} ${ringkas ? "cms-tombol--hantu-bahaya" : "cms-tombol--bahaya"}`}
          classNameKonfirmasi={`${kecil} cms-tombol--bahaya-isi`}
          sibuk={sibuk}
          durasiDetik={5}
          onKonfirmasi={() => jalankan(() => aksiHapus(id), "Komentar dihapus.", true)}
        />
      )}
    </div>
  );
}

/** Isi komentar + sunting di tempat (menyamarkan nomor HP, alamat, kata kasar). */
export function IsiKomentar({ id, isi, penuh = false }: { id: number; isi: string; penuh?: boolean }) {
  const [sunting, aturSunting] = useState(false);
  const [sibuk, jalankan] = useAksi();

  if (!sunting) {
    return (
      <div className="group/isi relative">
        <p className={`${penuh ? "text-[15px] leading-[1.65]" : "line-clamp-3 text-[13.5px] leading-[1.55]"} whitespace-pre-line [overflow-wrap:anywhere]`}>{isi}</p>
        <button type="button" onClick={() => aturSunting(true)}
                className="cms-tombol cms-tombol--hantu cms-tombol--kecil mt-3 -ml-2.5">
          Sunting isi
        </button>
      </div>
    );
  }

  return (
    <form className="mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            const baru = String(new FormData(e.currentTarget).get("isi") ?? "");
            jalankan(() => aksiUbahIsi(id, baru), "Isi komentar disimpan.", () => aturSunting(false));
          }}
          onKeyDown={(e) => { if (e.key === "Escape") aturSunting(false); }}>
      <label htmlFor={`isi-${id}`} className="sr-only">Isi komentar</label>
      <textarea id={`isi-${id}`} name="isi" defaultValue={isi} rows={penuh ? 8 : 4} maxLength={2000} autoFocus required
                className="cms-isian w-full" />
      <div className="mt-2 flex items-center gap-2">
        <button type="submit" disabled={sibuk} aria-busy={sibuk} className="cms-tombol cms-tombol--utama cms-tombol--kecil">
          {sibuk && <Pemuat />}
          Simpan
        </button>
        <button type="button" onClick={() => aturSunting(false)} className="cms-tombol cms-tombol--redup cms-tombol--kecil">
          Batal
        </button>
      </div>
    </form>
  );
}

export { AksiKomentar as TombolAksi };
