import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { wajibSesi } from "@/lib/sesi";
import { HALAMAN, KopHalaman } from "./kop-halaman";
import { Pratinjau } from "./pratinjau";

const TIPE = "App\\Models\\Event";

const tanggalPanjang = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" });
const tanggalPendek = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const waktu = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function Ringkasan() {
  const sesi = await wajibSesi();

  const [jumlahKejadian, jumlahKomentar, belumDisetujui, kejadianTerbaru, komentarTerbaru] =
    await Promise.all([
      prisma.events.count(),
      prisma.comments.count({ where: { commentable_type: TIPE } }),
      prisma.comments.count({ where: { commentable_type: TIPE, is_approved: false } }),
      prisma.events.findMany({ orderBy: { event_date: "desc" }, take: 5 }),
      prisma.comments.findMany({
        where: { commentable_type: TIPE },
        orderBy: { created_at: "desc" },
        take: 5,
        select: { id: true, name: true, body: true, commentable_id: true, is_approved: true, created_at: true },
      }),
    ]);

  return (
    <div className={HALAMAN}>
      <KopHalaman
        mata={tanggalPanjang.format(new Date())}
        judul={`Selamat datang, ${sesi.nama.split(" ")[0]}`}
        catatan="Keadaan pantauan hari ini. Angka yang perlu dikerjakan ditandai merah."
      >
        <Link href="/admin/kejadian/baru" className="cms-tombol cms-tombol--utama">
          Tambah kejadian
        </Link>
      </KopHalaman>

      {/* Angka besar berjajar, dipisah garis — bukan kartu. Yang dibaca sekilas
          adalah angkanya, jadi label duduk di atas dan tetap kecil. */}
      <div className="grid divide-y divide-[var(--garis)] border-y border-[var(--garis)]
                      sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Angka label="Kejadian tercatat" nilai={jumlahKejadian} tautan="/admin/kejadian"
               catatan="tampil di korsel & peta" />
        <Angka label="Komentar masuk" nilai={jumlahKomentar} tautan="/admin/komentar"
               catatan="seluruh laporan" />
        <Angka label="Menunggu ditinjau" nilai={belumDisetujui} tautan="/admin/komentar?status=belum"
               catatan={belumDisetujui > 0 ? "belum tampil di situs" : "tidak ada antrean"}
               sorot={belumDisetujui > 0} />
      </div>

      <div className="mt-9 grid gap-8 lg:grid-cols-2">
        <section>
          <Kepala judul="Kejadian terbaru" tautan="/admin/kejadian" />
          {kejadianTerbaru.length === 0 ? (
            <p className="cms-kosong text-[13.5px] text-[var(--redup)]">
              Belum ada kejadian yang tercatat.
            </p>
          ) : (
            <ul className="grid gap-2">
              {kejadianTerbaru.map((e) => (
                <li key={String(e.id)} className="cms-baris flex items-center gap-3 p-2.5">
                  <Pratinjau imageId={e.image_id} video={e.video} media={e.media}
                             kelas="h-10 w-16 shrink-0 rounded-[3px]" />
                  <Link href={`/admin/kejadian/${e.id}`}
                        className="min-w-0 flex-1 truncate text-[14px] font-medium underline-offset-4 hover:underline">
                    {e.title_id}
                  </Link>
                  <span className="cms-angka shrink-0 text-[12px] text-[var(--lirih)]">
                    {tanggalPendek.format(e.event_date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <Kepala judul="Komentar terbaru" tautan="/admin/komentar" />
          {komentarTerbaru.length === 0 ? (
            <p className="cms-kosong text-[13.5px] text-[var(--redup)]">
              Belum ada komentar dari pengunjung.
            </p>
          ) : (
            <ul className="grid gap-2">
              {komentarTerbaru.map((k) => (
                <li key={String(k.id)}
                    className={`cms-baris p-3 ${k.is_approved ? "cms-baris--aman" : "cms-baris--perhatian"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/admin/komentar?kejadian=${k.commentable_id}`}
                          className="truncate text-[14px] font-semibold underline-offset-4 hover:underline">
                      {k.name ?? "Tanpa nama"}
                    </Link>
                    <span className="cms-angka shrink-0 text-[12px] text-[var(--lirih)]">
                      {k.created_at ? waktu.format(k.created_at) : "—"}
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[13px] leading-[1.5] text-[var(--redup)]">
                    {k.body}
                  </p>
                  {!k.is_approved && (
                    <span className="cms-cap cms-cap--perhatian mt-2">Belum ditinjau</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Angka({
  label, nilai, catatan, tautan, sorot = false,
}: {
  label: string; nilai: number; catatan: string; tautan: string; sorot?: boolean;
}) {
  return (
    <Link href={tautan}
          className="group px-1 py-5 transition-colors hover:bg-[var(--papan)] sm:px-6 sm:first:pl-0">
      <p className="cms-mata">{label}</p>
      <p className={`cms-angka mt-2 text-[44px] leading-none font-medium ${
        sorot ? "text-[var(--api)]" : "text-[var(--jelaga)]"
      }`}>
        {nilai}
      </p>
      <p className="mt-2 text-[12.5px] text-[var(--lirih)] group-hover:text-[var(--redup)]">
        {catatan}
      </p>
    </Link>
  );
}

function Kepala({ judul, tautan }: { judul: string; tautan: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-[var(--garis)] pb-2">
      <h2 className="cms-judul text-[15px]">{judul}</h2>
      <Link href={tautan} className="cms-mata underline-offset-4 hover:underline">Semua</Link>
    </div>
  );
}
