"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Orientasi } from "@/lib/media";
import { aksiOrientasi } from "./aksi";
import { Pemuat } from "../pemuat";

/** Pilihan orientasi satu lampiran saat diverifikasi.
 *
 *  Tombol potret/lanskap; yang aktif diberi gaya berbeda. Karena orientasi
 *  adalah metadata tambahan (bukan keputusan status), cukup satu klik langsung
 *  simpan — tidak perlu konfirmasi kedua. Umpan baliknya berupa tombol yang
 *  berubah, sekaligus segar ulang halaman agar penampil media ikut membacanya.
 */
export function PilihOrientasi({
  id, url, nilai,
}: {
  id: number;
  url: string;
  nilai?: Orientasi;
}) {
  const [sibuk, mulai] = useTransition();
  const [galat, setGalat] = useState<string | null>(null);
  const router = useRouter();

  const pilih = (orientasi: Orientasi) => {
    if (sibuk) return;
    setGalat(null);
    mulai(async () => {
      const hasil = await aksiOrientasi(id, url, orientasi);
      if (!hasil.ok) {
        setGalat(hasil.galat ?? "Gagal menyimpan orientasi.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <span className="mt-1 mb-2 inline-flex items-center gap-1">
      <button
        type="button"
        disabled={sibuk} aria-busy={sibuk}
        onClick={() => pilih("potret")}
        aria-pressed={nilai === "potret"}
        className={`cms-mata rounded-[4px] border px-1.5 py-0.5 ${
          nilai === "potret"
            ? "border-[var(--api)] bg-[var(--api)]/10 text-[var(--jelaga)]"
            : "border-[var(--garis)] text-[var(--lirih)] hover:text-[var(--jelaga)]"
        }`}
      >
        Potret
      </button>
      <button
        type="button"
        disabled={sibuk} aria-busy={sibuk}
        onClick={() => pilih("lanskap")}
        aria-pressed={nilai === "lanskap"}
        className={`cms-mata rounded-[4px] border px-1.5 py-0.5 ${
          nilai === "lanskap"
            ? "border-[var(--api)] bg-[var(--api)]/10 text-[var(--jelaga)]"
            : "border-[var(--garis)] text-[var(--lirih)] hover:text-[var(--jelaga)]"
        }`}
      >
        Lanskap
      </button>
      {sibuk && <span className="ml-1 text-[var(--lirih)]"><Pemuat /></span>}

      {galat && <span role="alert" className="cms-mata text-[var(--bara)]">{galat}</span>}
    </span>
  );
}
