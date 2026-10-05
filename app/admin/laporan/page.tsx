import Link from "next/link";
import { wajibSesi } from "@/lib/sesi";
import { daftarLaporan, adaStatus, NAMA_STATUS, type StatusLaporan } from "@/lib/laporan-publik";
import { peringatanLokasi } from "@/lib/provinsi-titik";
import { bacaSaring, halamanDari, urutDari } from "../saring";
import { KopPanel, LEBAR, Tabel } from "../ruang";
import { KendaliSaring, KepalaUrut, PagerDaftar } from "../ruang-klien";
import { Ikon } from "../menu-admin";

const PER = 20;
const BAWAAN = "-created_at";
const waktu = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const CAP: Record<StatusLaporan, string> = {
  pending: "cms-cap cms-cap--titik cms-cap--perhatian",
  approved: "cms-cap cms-cap--titik cms-cap--aman",
  rejected: "cms-cap cms-cap--titik cms-cap--diam",
};

export default async function Laporan() {
  await wajibSesi();
  const saring = await bacaSaring("laporan");
  // "Menunggu" jadi bawaan: tabel ini dibuka untuk mengosongkan antrean.
  const pilihan = saring.status || "pending";
  const status: StatusLaporan | undefined = adaStatus(pilihan) ? pilihan : undefined;
  const urut = urutDari(saring, ["created_at", "title", "reporter_name"] as const, BAWAAN);

  const diminta = Number(saring.halaman) || 1;
  let hasil = await daftarLaporan(status, diminta, PER, urut);
  const halaman = halamanDari(saring, hasil.total, PER);
  if (halaman !== diminta) hasil = await daftarLaporan(status, halaman, PER, urut);
  const k = { bagian: "laporan", nilai: saring, bawaan: BAWAAN };

  return (
    <>
      <KopPanel lebar mata="Verifikasi" judul="Laporan warga"
                deskripsi="Kiriman pengunjung situs. Tidak ada yang tampil di publik sampai diverifikasi — verifikasi langsung membuat kejadiannya, lalu halaman pindah ke laporan berikutnya." />
      <div className={LEBAR}>
        <KendaliSaring bagian="laporan" nilai={saring}
                       tab={{ kunci: "status", bawaan: "pending", pilihan: [
                         { nilai: "pending", label: "Menunggu" }, { nilai: "approved", label: "Terverifikasi" },
                         { nilai: "rejected", label: "Ditolak" }, { nilai: "semua", label: "Semua" },
                       ] }} />
        <Tabel
          kepala={<>
            <KepalaUrut {...k} kolom="title">Laporan</KepalaUrut>
            <KepalaUrut {...k} kolom="reporter_name" className="hidden md:table-cell">Pelapor</KepalaUrut>
            <KepalaUrut {...k} kolom="created_at" turunDulu className="hidden sm:table-cell">Dikirim</KepalaUrut>
            <th className="hidden md:table-cell">Lampiran</th>
            <th>Status</th>
            <th className="cms-sel-aksi"><span className="sr-only">Aksi</span></th>
          </>}
          kosong={hasil.daftar.length === 0 && (pilihan === "pending"
            ? "Antrean kosong — semua kiriman warga sudah ditinjau."
            : "Tidak ada laporan dengan status itu.")}
          kaki={<PagerDaftar bagian="laporan" nilai={saring} halaman={halaman} total={hasil.total} per={PER} />}
        >
          {hasil.daftar.map((l) => (
            <tr key={l.id} data-perhatian={l.status === "pending" || undefined}>
              <td className="max-w-[460px]">
                <Link href={`/admin/laporan/${l.id}`} className="line-clamp-1 font-medium hover:underline">{l.judul}</Link>
                <span className="line-clamp-1 text-[12.5px] text-[var(--lirih)]">{l.deskripsi}</span>
              </td>
              <td className={`hidden md:table-cell ${l.namaPelapor ? "" : "text-[var(--lirih)] italic"}`}>{l.namaPelapor ?? "Anonim"}</td>
              <td className="hidden whitespace-nowrap text-[var(--redup)] tabular-nums sm:table-cell">{l.dibuat ? waktu.format(l.dibuat) : "—"}</td>
              <td className="hidden text-[var(--redup)] md:table-cell">
                {l.lampiran.length
                  ? <span className="inline-flex items-center gap-1 tabular-nums"><Ikon nama="gambar" className="size-3.5" />{l.lampiran.length}</span>
                  : "—"}
              </td>
              <td>
                <span className="inline-flex flex-wrap gap-1">
                  <span className={CAP[l.status]}>{NAMA_STATUS[l.status]}</span>
                  {peringatanLokasi(l.lat, l.lng, `${l.judul}\n${l.deskripsi}`) !== null && (
                    <span className="cms-cap cms-cap--perhatian" title="Koordinat janggal — buka untuk penjelasannya">
                      <Ikon nama="peta" className="size-3" />Cek lokasi
                    </span>
                  )}
                </span>
              </td>
              <td className="cms-sel-aksi">
                {l.status === "pending" ? (
                  <Link href={`/admin/laporan/${l.id}`} className="cms-tombol cms-tombol--garis cms-tombol--kecil">Tinjau</Link>
                ) : (
                  <Link href={`/admin/laporan/${l.id}`} aria-label={`Buka ${l.judul}`} title="Buka"
                        className="cms-ikon-tombol size-7"><Ikon nama="kanan" className="size-3.5" /></Link>
                )}
              </td>
            </tr>
          ))}
        </Tabel>
      </div>
    </>
  );
}
