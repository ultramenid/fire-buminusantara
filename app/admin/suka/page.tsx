import Link from "next/link";
import { wajibSesi } from "@/lib/sesi";
import { daftarSuka } from "@/lib/suka";
import { bacaSaring, halamanDari } from "../saring";
import { KopPanel, LEBAR, Tabel } from "../ruang";
import { PagerDaftar } from "../ruang-klien";
import { TombolHapusTanggapan } from "./tombol-hapus";

const PER = 25;
const waktu = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function Suka() {
  const sesi = await wajibSesi();
  const saring = await bacaSaring("suka");
  const diminta = Number(saring.halaman) || 1;
  let hasil = await daftarSuka(diminta, PER);
  const halaman = halamanDari(saring, hasil.total, PER);
  if (halaman !== diminta) hasil = await daftarSuka(halaman, PER);

  return (
    <>
      <KopPanel lebar mata="Tanggapan pengunjung" judul="Suka"
                deskripsi="Jempol pengunjung pada kejadian di umpan, beserta alamat IP dan user agent pengirimnya." />
      <div className={LEBAR}>
        <Tabel
          kepala={<>
            <th>Kejadian</th>
            <th className="hidden sm:table-cell">Waktu</th>
            <th>Alamat IP</th>
            <th className="hidden lg:table-cell">User agent</th>
            {sesi.peran === "admin" && <th className="cms-sel-aksi"><span className="sr-only">Aksi</span></th>}
          </>}
          kosong={hasil.daftar.length === 0 && "Belum ada suka yang masuk."}
          kaki={<PagerDaftar bagian="suka" nilai={saring} halaman={halaman} total={hasil.total} per={PER} />}
        >
          {hasil.daftar.map((s) => (
            <tr key={s.id}>
              <td className="max-w-[360px]">
                <Link href={`/admin/kejadian/${s.event.id}`} className="line-clamp-1 font-medium hover:underline">{s.event.title_id}</Link>
              </td>
              <td className="hidden whitespace-nowrap text-[var(--redup)] tabular-nums sm:table-cell">{s.created_at ? waktu.format(s.created_at) : "—"}</td>
              <td className="cms-angka whitespace-nowrap text-[var(--redup)]">{s.ip_address ?? "—"}</td>
              <td className="hidden max-w-[380px] lg:table-cell">
                <span className="line-clamp-1 break-all text-[12px] text-[var(--lirih)]" title={s.user_agent ?? undefined}>{s.user_agent ?? "—"}</span>
              </td>
              {sesi.peran === "admin" && <td className="cms-sel-aksi"><TombolHapusTanggapan jenis="suka" id={s.id} /></td>}
            </tr>
          ))}
        </Tabel>
      </div>
    </>
  );
}
