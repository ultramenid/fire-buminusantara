import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { galeriTersimpan } from "@/lib/media";
import { wajibSesi } from "@/lib/sesi";
import { ISI, KopPanel, Kartu } from "../../ruang";
import { FormKejadian } from "../form";
import { TombolTayang } from "../tombol-tayang";
import { TombolHapus } from "./tombol-hapus";
import { aksiUbahKejadian } from "../aksi";

export default async function Ubah({ params }: { params: Promise<{ id: string }> }) {
  const sesi = await wajibSesi();

  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const e = await prisma.events.findUnique({ where: { id } });
  if (!e) notFound();

  return (
    <>
      <KopPanel
        mata={`Kejadian #${String(id).padStart(3, "0")}`}
        judul={e.title_id}
        deskripsi={`Dicatat tanggal ${e.event_date.toLocaleDateString("id-ID", { dateStyle: "long" })} · ${e.location}`}
        kembali="/admin/kejadian"
      >
        <TombolTayang id={id} status={e.status} />
      </KopPanel>

      <div className={ISI}>
        {/* key: setelah simpan, form dipasang ulang dari data tersimpan —
            berkas yang baru diunggah jadi galeri tersimpan, bukan diunggah lagi. */}
        <FormKejadian
          key={e.updated_at?.toISOString() ?? "awal"}
          sedangUbah
          aksi={aksiUbahKejadian.bind(null, id)}
          awal={{
            id,
            title_id: e.title_id,
            title_en: e.title_en,
            slug: e.slug ?? "",
            description_id: e.description_id ?? "",
            description_en: e.description_en ?? "",
            event_date: e.event_date.toISOString().slice(0, 10),
            location: e.location,
            location_lat: String(e.location_lat),
            location_lng: String(e.location_lng),
            orientation: e.orientation,
            status: e.status,
            galeri: galeriTersimpan(e.media),
          }}
        />

        {sesi.peran === "admin" && (
          <div className="mt-12">
            <Kartu
              bahaya
              judul="Zona Berbahaya: Hapus Kejadian"
              deskripsi="Menghapus kejadian dari korsel, peta, dan seluruh arsip publik beserta seluruh komentar terkait."
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="max-w-[50ch] text-[12.5px] leading-[1.5] text-[var(--redup)]">
                  Tindakan ini tidak dapat dibatalkan. Jika Anda hanya ingin menyembunyikan kejadian dari situs publik sementara waktu, cukup ubah status tayang menjadi <strong>Draft</strong>.
                </p>
                <TombolHapus id={id} />
              </div>
            </Kartu>
          </div>
        )}
      </div>
    </>
  );
}
