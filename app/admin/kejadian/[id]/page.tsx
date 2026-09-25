import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { galeriTersimpan } from "@/lib/media";
import { wajibSesi } from "@/lib/sesi";
import { HALAMAN, KopHalaman } from "../../kop-halaman";
import { FormKejadian } from "../form";
import { TombolHapus } from "./tombol-hapus";
import { aksiUbahKejadian, aksiHapusKejadian } from "../aksi";

const tanggalId = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" });

export default async function Ubah({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ galat?: string }>;
}) {
  const sesi = await wajibSesi();

  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const e = await prisma.events.findUnique({ where: { id } });
  if (!e) notFound();

  const { galat } = await searchParams;

  return (
    <div className={HALAMAN}>
      <Link href="/admin/kejadian" className="cms-mata mb-4 inline-block underline-offset-4 hover:underline">
        ← Kejadian
      </Link>

      <KopHalaman mata={`Kejadian ${String(id).padStart(3, "0")}`} judul={e.title_id} asli>
        <span className="cms-angka text-[12.5px] text-[var(--lirih)]">
          {tanggalId.format(e.event_date)}
        </span>
      </KopHalaman>

      {galat && (
        <p role="alert" className="cms-galat mb-6">
          <span aria-hidden="true" className="cms-angka font-medium">!</span>
          {galat}
        </p>
      )}

      <FormKejadian sedangUbah aksi={aksiUbahKejadian.bind(null, id)}
        awal={{
          id, title_id: e.title_id, title_en: e.title_en, slug: e.slug ?? "",
          description_id: e.description_id ?? "", description_en: e.description_en ?? "",
          event_date: e.event_date.toISOString().slice(0, 10),
          location: e.location,
          location_lat: String(e.location_lat), location_lng: String(e.location_lng),
          orientation: e.orientation,
          status: e.status,
          galeri: galeriTersimpan(e.media),
        }} />

      {sesi.peran === "admin" && (
        <form action={aksiHapusKejadian.bind(null, id)} className="mt-10 rounded-[3px] border border-[var(--garis-tegas)]
                                        border-l-[3px] border-l-[var(--api)] bg-[var(--papan)] p-4">
          <p className="cms-mata text-[var(--bara)]">Hapus permanen</p>
          <p className="mt-2 mb-4 max-w-[62ch] text-[13px] leading-[1.55] text-[var(--redup)]">
            Kejadian ini hilang dari korsel, peta, dan seluruh arsip, beserta komentar yang
            menempel padanya. Berkas medianya tetap tersimpan di penyimpanan.
          </p>
          <TombolHapus />
        </form>
      )}
    </div>
  );
}
