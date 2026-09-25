import Link from "next/link";
import { wajibSesi } from "@/lib/sesi";
import { HALAMAN, KopHalaman } from "../../kop-halaman";
import { FormKejadian } from "../form";
import { aksiTambahKejadian } from "../aksi";

export default async function Tambah({
  searchParams,
}: {
  searchParams: Promise<{ galat?: string }>;
}) {
  await wajibSesi();

  const { galat } = await searchParams;

  return (
    <div className={HALAMAN}>
      <Link href="/admin/kejadian" className="cms-mata mb-4 inline-block underline-offset-4 hover:underline">
        ← Kejadian
      </Link>

      <KopHalaman
        mata="Catatan baru"
        judul="Tambah kejadian"
        catatan="Judul, tanggal, lokasi, dan koordinat wajib diisi. Sisanya bisa dilengkapi belakangan."
      />

      {galat && (
        <p role="alert" className="cms-galat mb-6">
          <span aria-hidden="true" className="cms-angka font-medium">!</span>
          {galat}
        </p>
      )}

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
  );
}
