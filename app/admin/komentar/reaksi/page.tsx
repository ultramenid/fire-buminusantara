import Link from "next/link";
import { wajibSesi } from "@/lib/sesi";
import { daftarReaksi, reaksiPerKejadian } from "@/lib/reaksi-komentar";
import { HALAMAN, KopHalaman } from "../../kop-halaman";
import { Paginasi } from "../../paginasi";

const PER_HALAMAN = 15;

const waktu = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
});

export default async function Reaksi({
  searchParams,
}: {
  searchParams: Promise<{ halaman?: string; page?: string }>;
}) {
  await wajibSesi();

  const params = await searchParams;
  const halaman = Math.max(1, parseInt(params.halaman ?? params.page ?? "1", 10) || 1);

  const [{ daftar: reaksi, total: totalData }, perKejadian] = await Promise.all([
    daftarReaksi(halaman, PER_HALAMAN),
    reaksiPerKejadian(),
  ]);
  const terbanyak = perKejadian[0]?.jumlahReaksi ?? 0;
  const totalHalaman = Math.ceil(totalData / PER_HALAMAN);

  return (
    <div className={HALAMAN}>
      <KopHalaman
        mata="Tanggapan pengunjung"
        judul="Reaksi"
        catatan="Suka dan tidak suka yang diberikan pengunjung pada komentar kejadian."
      />

      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <section>
          <h2 className="cms-judul mb-3 border-b border-[var(--garis)] pb-2 text-[15px]">
            Reaksi per kejadian
          </h2>

          {perKejadian.length === 0 ? (
            <p className="cms-kosong text-[13.5px] text-[var(--redup)]">
              Belum ada reaksi pada komentar mana pun.
            </p>
          ) : (
            <ul className="grid gap-2">
              {perKejadian.map((p, i) => (
                <li key={p.kejadianId} className="cms-baris flex items-center gap-3 p-3">
                  <span aria-hidden="true" className="cms-angka w-6 shrink-0 text-[13px] text-[var(--lirih)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>

                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/komentar?kejadian=${p.kejadianId}`}
                          className="block truncate text-[14px] font-medium underline-offset-4 hover:underline">
                      {p.judul}
                    </Link>
                    {/* Batang sebanding kejadian teramai: perbandingan antar baris
                        lebih cepat terbaca dari panjangnya daripada dari angkanya. */}
                    <span aria-hidden="true"
                          className="mt-1.5 block h-[3px] rounded-full bg-[var(--color-peta-3,#c84241)]"
                          style={{ width: `${terbanyak ? (p.jumlahReaksi / terbanyak) * 100 : 0}%` }} />
                  </div>

                  <span className="cms-angka shrink-0 text-[13px]">{p.jumlahReaksi}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="cms-judul mb-3 border-b border-[var(--garis)] pb-2 text-[15px]">
            Reaksi terbaru
          </h2>

          {reaksi.length === 0 ? (
            <p className="cms-kosong text-[13.5px] text-[var(--redup)]">
              Belum ada reaksi yang masuk.
            </p>
          ) : (
            <>
              <ul className="grid gap-2">
                {reaksi.map((r) => (
                  <li key={r.id}
                      className={`cms-baris p-3 ${r.jenis === "like" ? "cms-baris--aman" : "cms-baris--perhatian"}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`cms-cap ${r.jenis === "like" ? "cms-cap--aman" : "cms-cap--perhatian"}`}>
                        {r.jenis === "like" ? "Suka" : "Tidak suka"}
                      </span>
                      <span className="text-[14px] font-semibold">{r.user?.name ?? "Tamu"}</span>
                      <span className="cms-angka ml-auto text-[12px] text-[var(--lirih)]">
                        {r.created_at ? waktu.format(r.created_at) : "—"}
                      </span>
                    </div>

                    {r.komentar ? (
                      <p className="mt-2 line-clamp-2 text-[13px] leading-[1.5] text-[var(--redup)]">
                        “{r.komentar.body}”
                      </p>
                    ) : (
                      <p className="mt-2 text-[12.5px] text-[var(--lirih)]">Komentarnya sudah dihapus.</p>
                    )}

                    {r.event && (
                      <Link href={`/admin/komentar?kejadian=${r.event.id}`}
                            className="mt-1.5 inline-block max-w-full truncate text-[12px] text-[var(--lirih)]
                                       underline-offset-4 hover:underline">
                        {r.event.title_id}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>

              <Paginasi
                halaman={halaman}
                totalHalaman={totalHalaman}
                totalData={totalData}
                perHalaman={PER_HALAMAN}
                baseUrl="/admin/komentar/reaksi"
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
