"use client";

import { aksiTayang } from "./aksi";
import { Pemuat } from "../pemuat";
import { useAksi } from "../use-aksi";

/**
 * Alih draft ↔ publish langsung dari daftar, tanpa membuka form.
 *
 * Satu tekan, tanpa konfirmasi kedua — beda dengan tombol hapus. Menurunkan
 * kejadian ke draft tidak membuang apa pun: isinya utuh, hanya berhenti tampil
 * di situs publik, dan menekan sekali lagi mengembalikannya. Konfirmasi untuk
 * tindakan yang bisa dibatalkan semudah itu cuma menambah gesekan.
 *
 * Labelnya menyebut AKIBATNYA, bukan keadaan sekarang: "Publish" pada baris
 * draft, "Jadikan draft" pada yang tayang. Keadaan sekarang sudah dibaca dari
 * cap "Draft" di sebelah judulnya, jadi tombol yang mengulanginya justru
 * membuat orang ragu apakah ini penanda atau tombol.
 */
export function TombolTayang({ id, status }: { id: number; status: string }) {
  const [sibuk, jalankan] = useAksi();
  const draft = status === "draft";

  return (
    <button
      type="button"
      disabled={sibuk}
      aria-busy={sibuk}
      title={draft
        ? "Tayangkan di situs publik"
        : "Sembunyikan dari situs publik — isinya tetap tersimpan"}
      onClick={() => jalankan(
        () => aksiTayang(id, draft ? "published" : "draft"),
        draft ? "Kejadian tayang di situs." : "Kejadian dijadikan draft.",
      )}
      className="cms-tombol cms-tombol--kecil cms-tombol--hantu shrink-0"
    >
      {sibuk && <Pemuat />}
      {draft ? "Publish" : "Jadikan draft"}
    </button>
  );
}
