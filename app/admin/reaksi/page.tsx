import { wajibSesi } from "@/lib/sesi";
import { daftarReaksi, reaksiPerKejadian } from "@/lib/reaksi-komentar";
import { bacaSaring, halamanDari } from "../saring";
import { Hampa, Kartu, KopPanel, LEBAR, Tabel } from "../ruang";
import { PagerDaftar, TautanSaring } from "../ruang-klien";
import { TombolHapusTanggapan } from "../suka/tombol-hapus";

const PER = 20;
const waktu = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function Reaksi() {
  const sesi = await wajibSesi();
  const saring = await bacaSaring("reaksi");
  const diminta = Number(saring.halaman) || 1;
  const [awal, perKejadian] = await Promise.all([daftarReaksi(diminta, PER), reaksiPerKejadian()]);
  const halaman = halamanDari(saring, awal.total, PER);
  const hasil = halaman === diminta ? awal : await daftarReaksi(halaman, PER);
  const terbanyak = perKejadian[0]?.jumlahReaksi ?? 0;

  return (
    <>
      <KopPanel lebar mata="Tanggapan pengunjung" judul="Reaksi"
                deskripsi="Suka dan tidak suka pada komentar. Hapus reaksi yang jelas spam." />
      <div className={`${LEBAR} grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]`}>
        <section className="min-w-0">
          <h2 className="mb-2.5 text-[13.5px] font-semibold">Reaksi terbaru</h2>
          <Tabel
            kepala={<>
              <th>Reaksi</th>
              <th>Komentar</th>
              <th className="hidden md:table-cell">Pengunjung</th>
              <th className="hidden sm:table-cell">Waktu</th>
              {sesi.peran === "admin" && <th className="cms-sel-aksi"><span className="sr-only">Aksi</span></th>}
            </>}
            kosong={hasil.daftar.length === 0 && "Belum ada reaksi yang masuk."}
            kaki={<PagerDaftar bagian="reaksi" nilai={saring} halaman={halaman} total={hasil.total} per={PER} />}
          >
            {hasil.daftar.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className={`cms-cap ${r.jenis === "like" ? "cms-cap--aman" : "cms-cap--perhatian"}`}>
                    {r.jenis === "like" ? "Suka" : "Tidak suka"}
                  </span>
                </td>
                <td className="min-w-[200px] max-w-[420px]">
                  {r.komentar
                    ? <span className="line-clamp-2">“{r.komentar.body}”</span>
                    : <span className="text-[var(--lirih)]">Komentarnya sudah dihapus.</span>}
                  {r.event && <span className="line-clamp-1 text-[12px] text-[var(--lirih)]">{r.event.title_id}</span>}
                </td>
                <td className="hidden md:table-cell">{r.user?.name ?? "Tamu"}</td>
                <td className="hidden whitespace-nowrap text-[var(--redup)] tabular-nums sm:table-cell">{r.created_at ? waktu.format(r.created_at) : "—"}</td>
                {sesi.peran === "admin" && <td className="cms-sel-aksi"><TombolHapusTanggapan jenis="reaksi" id={r.id} /></td>}
              </tr>
            ))}
          </Tabel>
        </section>

        <section className="min-w-0">
          <h2 className="mb-2.5 text-[13.5px] font-semibold">Per kejadian</h2>
          <Kartu isi="">
            {perKejadian.length === 0 ? (
              <Hampa ikon="senyum">Belum ada reaksi pada komentar mana pun.</Hampa>
            ) : (
              <ul className="divide-y divide-[var(--garis)]">
                {perKejadian.map((p) => (
                  <li key={p.kejadianId} className="px-4 py-3">
                    <div className="flex items-baseline gap-3">
                      <TautanSaring bagian="komentar" nilai={{ kejadian: String(p.kejadianId) }}
                                    className="line-clamp-1 min-w-0 flex-1 text-[13px] font-medium hover:underline">{p.judul}</TautanSaring>
                      <span className="shrink-0 text-[12.5px] text-[var(--redup)] tabular-nums">{p.jumlahReaksi}</span>
                    </div>
                    {/* Batang sebanding kejadian teramai: perbandingan antar baris
                        lebih cepat terbaca dari panjangnya daripada dari angkanya. */}
                    <span aria-hidden="true" className="mt-2 block h-1 overflow-hidden rounded-full bg-[var(--rona-kuat)]">
                      <span className="block h-full rounded-full bg-[var(--api)]"
                            style={{ width: `${terbanyak ? (p.jumlahReaksi / terbanyak) * 100 : 0}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Kartu>
        </section>
      </div>
    </>
  );
}
