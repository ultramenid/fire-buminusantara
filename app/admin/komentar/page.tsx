import Link from "next/link";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { wajibSesi } from "@/lib/sesi";
import { daftarKomentarModerasi } from "@/lib/moderasi-komentar";
import { HALAMAN, KopHalaman } from "../kop-halaman";
import { Paginasi } from "../paginasi";
import { AksiKomentar } from "./tombol-aksi";

const PER_HALAMAN = 15;

const waktu = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});

const ambilPilihanKejadian = unstable_cache(
  async () => {
    const baris = await prisma.events.findMany({
      orderBy: { event_date: "desc" },
      take: 100,
      select: { id: true, title_id: true },
    });
    return baris.map((e) => ({ id: Number(e.id), title_id: e.title_id }));
  },
  ["admin-pilihan-kejadian"],
  { revalidate: 60, tags: ["events"] }
);

export default async function Komentar({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; status?: string; kejadian?: string; halaman?: string; page?: string }>;
}) {
  const sesi = await wajibSesi();

  const params = await searchParams;
  const cari = params.cari;
  const status = params.status;
  const kejadian = params.kejadian;
  const idKejadian = Number(kejadian) || undefined;
  const disaring = Boolean(cari || status || kejadian);
  const halaman = Math.max(1, parseInt(params.halaman ?? params.page ?? "1", 10) || 1);

  const [{ daftar, total: totalData }, pilihanKejadian] = await Promise.all([
    daftarKomentarModerasi({
      cari: cari?.trim(),
      status: status === "belum" || status === "disetujui" ? status : undefined,
      kejadian: idKejadian,
    }, halaman, PER_HALAMAN),
    ambilPilihanKejadian(),
  ]);

  const totalHalaman = Math.ceil(totalData / PER_HALAMAN);

  return (
    <div className={HALAMAN}>
      <KopHalaman
        mata="Moderasi"
        judul="Komentar"
        catatan="Komentar pada laporan kejadian. Yang belum ditinjau tidak tampil di situs sampai disetujui."
      />

      <form className="mb-5 flex flex-wrap items-center gap-2">
        <input name="cari" defaultValue={cari ?? ""} placeholder="Cari nama atau isi…"
               aria-label="Cari komentar" className="cms-isian w-56 max-w-full" />
        <select name="status" defaultValue={status ?? ""} aria-label="Saring menurut status"
                className="cms-isian w-44 max-w-full">
          <option value="">Semua status</option>
          <option value="belum">Belum ditinjau</option>
          <option value="disetujui">Disetujui</option>
        </select>
        <select name="kejadian" defaultValue={kejadian ?? ""} aria-label="Saring menurut kejadian"
                className="cms-isian w-60 max-w-full">
          <option value="">Semua kejadian</option>
          {pilihanKejadian.map((e) => (
            <option key={String(e.id)} value={String(e.id)}>{e.title_id}</option>
          ))}
        </select>
        <button type="submit" className="cms-tombol cms-tombol--garis">Terapkan</button>
        {disaring && (
          <Link href="/admin/komentar" className="cms-mata px-1 underline-offset-4 hover:underline">
            Bersihkan
          </Link>
        )}
        <p className="cms-angka ml-auto text-[12.5px] text-[var(--lirih)]">
          {totalData} komentar
        </p>
      </form>

      {daftar.length === 0 ? (
        <div className="cms-kosong">
          <p className="cms-judul text-[18px]">
            {disaring ? "Tidak ada yang cocok" : "Belum ada komentar"}
          </p>
          <p className="mx-auto mt-2 max-w-[46ch] text-[13.5px] text-[var(--redup)]">
            {disaring
              ? "Ubah kata pencarian atau saringannya untuk melihat komentar lain."
              : "Komentar pengunjung pada laporan kejadian akan berbaris di sini."}
          </p>
          {disaring && (
            <Link href="/admin/komentar" className="cms-tombol cms-tombol--garis mt-5">
              Bersihkan saringan
            </Link>
          )}
        </div>
      ) : (
        <>
          <ul className="grid gap-2">
            {daftar.map((k) => (
              <li key={k.id}
                  className={`cms-baris p-4 ${k.is_approved ? "cms-baris--aman" : "cms-baris--perhatian"}`}>
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-semibold">{k.nama ?? "Tanpa nama"}</span>
                      {k.parent_id != null && <span className="cms-cap cms-cap--diam">Balasan</span>}
                      {/* Hanya yang menyimpang yang diberi cap. Komentar yang sudah
                          tampil adalah keadaan biasa — tepi hijau di kiri baris
                          sudah mengatakannya, dan capnya cuma akan menyalin itu di
                          setiap baris. */}
                      {!k.is_approved && <span className="cms-cap cms-cap--perhatian">Belum ditinjau</span>}
                    </div>

                    <p className="mt-1.5 line-clamp-3 text-[13.5px] leading-[1.55] text-[var(--jelaga)]">
                      {k.body}
                    </p>

                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1
                                    text-[12px] text-[var(--lirih)]">
                      <span className="cms-angka">{k.created_at ? waktu.format(k.created_at) : "—"}</span>
                      {k.event && (
                        <Link href={`/admin/komentar?kejadian=${k.event.id}`}
                              className="max-w-[32ch] truncate underline-offset-4 hover:underline">
                          {k.event.title_id}
                        </Link>
                      )}
                      {k.jumlahReaksi > 0 && (
                        <span className="cms-angka">{k.jumlahReaksi} reaksi</span>
                      )}
                      {k.email && <span className="truncate">{k.email}</span>}
                    </div>
                  </div>

                  <AksiKomentar id={k.id} disetujui={k.is_approved} bolehHapus={sesi.peran === "admin"} />
                </div>
              </li>
            ))}
          </ul>

          <Paginasi
            halaman={halaman}
            totalHalaman={totalHalaman}
            totalData={totalData}
            perHalaman={PER_HALAMAN}
            baseUrl="/admin/komentar"
            searchParams={{ cari, status, kejadian }}
          />
        </>
      )}
    </div>
  );
}
