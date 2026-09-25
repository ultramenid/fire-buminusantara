import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { wajibSesi } from "@/lib/sesi";
import { HALAMAN, KopHalaman } from "../kop-halaman";
import { Paginasi } from "../paginasi";
import { DaftarTampilan, type ItemKejadian } from "./daftar-tampilan";

const PER_HALAMAN = 12;

export default async function DaftarKejadian({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; page?: string }>;
}) {
  await wajibSesi();

  const params = await searchParams;
  const kata = (params.cari ?? "").trim();
  const halaman = Math.max(1, parseInt(params.halaman ?? params.page ?? "1", 10) || 1);

  const where = kata ? { title_id: { contains: kata } } : undefined;

  const [totalData, daftar] = await Promise.all([
    prisma.events.count({ where }),
    prisma.events.findMany({
      where,
      orderBy: { event_date: "desc" },
      skip: (halaman - 1) * PER_HALAMAN,
      take: PER_HALAMAN,
      select: {
        id: true, title_id: true, slug: true, event_date: true,
        location: true, image_id: true, video: true, media: true, orientation: true,
        status: true,
      },
    }),
  ]);

  const totalHalaman = Math.ceil(totalData / PER_HALAMAN);

  const itemDaftar: ItemKejadian[] = daftar.map((e) => ({
    id: Number(e.id),
    title_id: e.title_id,
    slug: e.slug,
    event_date: e.event_date.toISOString(),
    location: e.location,
    image_id: e.image_id,
    video: e.video,
    media: e.media,
    status: e.status,
    orientation: e.orientation,
  }));

  return (
    <div className={HALAMAN}>
      <KopHalaman
        mata="Catatan lapangan"
        judul="Kejadian"
        catatan="Setiap baris tampil sebagai satu kartu di halaman depan dan satu angka di peta sebaran."
      >
        <Link href="/admin/kejadian/baru" className="cms-tombol cms-tombol--utama">
          Tambah kejadian
        </Link>
      </KopHalaman>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <form className="flex flex-wrap items-center gap-2">
          <input name="cari" defaultValue={kata} placeholder="Cari judul…"
                 aria-label="Cari kejadian menurut judul"
                 className="cms-isian w-60 max-w-full" />
          <button type="submit" className="cms-tombol cms-tombol--garis">Cari</button>
        </form>
        {kata && (
          <Link href="/admin/kejadian" className="cms-mata px-1 underline-offset-4 hover:underline">
            Bersihkan
          </Link>
        )}
        <p className="cms-angka ml-auto text-[12.5px] text-[var(--lirih)]">
          {totalData} kejadian
        </p>
      </div>

      {itemDaftar.length === 0 ? (
        <div className="cms-kosong">
          <p className="cms-judul text-[18px]">
            {kata ? "Tidak ada yang cocok" : "Belum ada kejadian"}
          </p>
          <p className="mx-auto mt-2 max-w-[46ch] text-[13.5px] text-[var(--redup)]">
            {kata
              ? `Tidak ada kejadian yang judulnya memuat "${kata}". Coba kata lain, atau bersihkan pencarian.`
              : "Kejadian yang ditambahkan di sini langsung muncul di korsel dan peta halaman depan."}
          </p>
          {!kata && (
            <Link href="/admin/kejadian/baru" className="cms-tombol cms-tombol--utama mt-5">
              Tambah kejadian pertama
            </Link>
          )}
        </div>
      ) : (
        <>
          <DaftarTampilan daftar={itemDaftar} />
          <Paginasi
            halaman={halaman}
            totalHalaman={totalHalaman}
            totalData={totalData}
            perHalaman={PER_HALAMAN}
            baseUrl="/admin/kejadian"
            searchParams={{ cari: kata }}
          />
        </>
      )}
    </div>
  );
}
