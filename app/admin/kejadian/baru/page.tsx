import { wajibSesi } from "@/lib/sesi";
import { ISI, KopPanel } from "../../ruang";
import { FormKejadian } from "../form";
import { aksiTambahKejadian } from "../aksi";

export default async function Tambah() {
  await wajibSesi();

  return (
    <>
      <KopPanel
        mata="Catatan baru"
        judul="Tambah kejadian"
        deskripsi="Judul, tanggal, lokasi, dan koordinat wajib diisi. Sisanya bisa dilengkapi belakangan."
        kembali="/admin/kejadian"
      />
      <div className={ISI}>
        <FormKejadian sedangUbah={false} aksi={aksiTambahKejadian}
          awal={{
            title_id: "", title_en: "", slug: "",
            description_id: "", description_en: "",
            event_date: new Date().toISOString().slice(0, 10),
            location: "", location_lat: "", location_lng: "",
            orientation: "landscape",
            // Kejadian yang ditulis manual dimulai sebagai draft: kurator
            // merapikannya dulu, baru memutuskan menayangkannya.
            status: "draft",
            galeri: [],
          }} />
      </div>
    </>
  );
}
