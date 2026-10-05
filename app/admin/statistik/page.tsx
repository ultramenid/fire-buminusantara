import { wajibSesi } from "@/lib/sesi";
import { ambilSorotan } from "@/lib/statistik-sorotan";
import { ISI, KopPanel } from "../ruang";
import { FormSorotan } from "./form-sorotan";

export default async function Statistik() {
  await wajibSesi();

  const awal = await ambilSorotan();

  return (
    <>
      <KopPanel
        mata="Konten beranda"
        judul="Angka sorotan karhutla"
        deskripsi="Empat kartu angka di strip statistik halaman depan (landing page) karhutla dalam dua bahasa. Tersimpan langsung tampil di publik."
      />
      <div className={ISI}>
        <FormSorotan awal={awal} />
      </div>
    </>
  );
}
