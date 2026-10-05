"use client";

import { useActionState } from "react";
import { Isian, IsianPanjang } from "../isian";
import { Pemuat } from "../pemuat";
import { Kartu } from "../ruang";
import { Ikon } from "../menu-admin";
import type { Sorotan } from "@/lib/statistik-sorotan";
import { aksiSimpanSorotan } from "./aksi";

/** `kiriman` = isian yang baru dikirim. React 19 me-reset field tak terkendali
 *  setelah setiap aksi, termasuk yang gagal — tanpa ini 12 isian kembali ke
 *  nilai lama begitu server menolak satu di antaranya. */
type Keadaan = ({ ok: true } | { ok: false; galat: string; bidang?: string }) & { kiriman: FormData } | null;

const BAHASA_FORM = [
  { kode: "id", nama: "Indonesia", bendera: "ID" },
  { kode: "en", nama: "English", bendera: "EN" },
] as const;

export function FormSorotan({ awal }: { awal: Sorotan }) {
  const [keadaan, aksi, mengirim] = useActionState<Keadaan, FormData>(
    async (_sebelumnya: Keadaan, data: FormData) => ({ ...(await aksiSimpanSorotan(data)), kiriman: data }),
    null,
  );

  const nilai = (nama: string, cadangan: string) => {
    const v = keadaan?.kiriman.get(nama);
    return typeof v === "string" ? v : cadangan;
  };

  return (
    <form action={aksi} className="grid max-w-3xl gap-6">
      {keadaan && !keadaan.ok && (
        <p role="alert" className="cms-galat">
          {keadaan.galat}
        </p>
      )}
      {keadaan?.ok && (
        <p role="status" className="cms-kabar">
          Tersimpan — strip statistik di landing karhutla ikut diperbarui.
        </p>
      )}

      {awal.id.map((_, i) => (
        <Kartu
          key={i}
          judul={`Kartu #${i + 1}`}
          deskripsi={`Sorotan angka ke-${i + 1} di bilah statistik beranda.`}
        >
          <div className="grid gap-6 sm:grid-cols-2">
            {BAHASA_FORM.map(({ kode, nama, bendera }) => (
              <div key={kode} className="grid content-start gap-3 rounded-[var(--jari)] border border-[var(--garis)] bg-[var(--papan)] p-3.5">
                <div className="flex items-center gap-2 border-b border-[var(--garis)] pb-2">
                  <span className="cms-cap font-mono font-bold">{bendera}</span>
                  <span className="text-[12px] font-medium text-[var(--redup)]">{nama}</span>
                </div>
                <Isian
                  label="Nilai angka"
                  nama={`nilai_${kode}_${i}`}
                  nilai={nilai(`nilai_${kode}_${i}`, awal[kode][i].nilai)}
                  wajib
                  panjangMaks={40}
                  penunjuk={kode === "id" ? "cth. Rp 123,1 triliun" : "e.g. Rp 123.1 trillion"}
                />
                <IsianPanjang
                  label="Keterangan singkat"
                  nama={`keterangan_${kode}_${i}`}
                  nilai={nilai(`keterangan_${kode}_${i}`, awal[kode][i].keterangan)}
                  wajib
                  baris={3}
                  panjangMaks={300}
                />
              </div>
            ))}
          </div>
        </Kartu>
      ))}

      <div className="sticky bottom-0 -mx-4 -mb-6 flex items-center justify-between border-t border-[var(--garis)] bg-[var(--kertas)] px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <p className="text-[12px] text-[var(--lirih)]">
          Perubahan langsung muncul di halaman landing publik setelah disimpan.
        </p>
        <button
          type="submit"
          disabled={mengirim}
          aria-busy={mengirim}
          className="cms-tombol cms-tombol--utama"
        >
          {mengirim ? <Pemuat /> : <Ikon nama="centang" className="size-3.5" />}
          Simpan semua kartu
        </button>
      </div>
    </form>
  );
}
