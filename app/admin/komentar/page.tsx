import Link from "next/link";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { wajibSesi } from "@/lib/sesi";
import { daftarKomentarModerasi } from "@/lib/moderasi-komentar";
import { bacaSaring, halamanDari, urutDari } from "../saring";
import { KopPanel, LEBAR, Tabel } from "../ruang";
import { KendaliSaring, KepalaUrut, PagerDaftar, TautanSaring } from "../ruang-klien";
import { AksiKomentar } from "./tombol-aksi";

const PER = 20;
const BAWAAN = "-created_at";
const waktu = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const pilihanKejadian = unstable_cache(
  async () => {
    const baris = await prisma.events.findMany({
      orderBy: { event_date: "desc" }, take: 100, select: { id: true, title_id: true },
    });
    return baris.map((e) => ({ nilai: String(e.id), label: e.title_id }));
  },
  ["admin-pilihan-kejadian"],
  { revalidate: 60, tags: ["events"] },
);

export default async function Komentar() {
  const sesi = await wajibSesi();
  const saring = await bacaSaring("komentar");
  const syarat = {
    cari: saring.cari?.trim() || undefined,
    status: saring.status === "belum" || saring.status === "disetujui" ? saring.status : undefined,
    kejadian: Number(saring.kejadian) || undefined,
  } as const;
  const urut = urutDari(saring, ["created_at", "name"] as const, BAWAAN);

  const diminta = Number(saring.halaman) || 1;
  let hasil = await daftarKomentarModerasi(syarat, diminta, PER, urut);
  const halaman = halamanDari(saring, hasil.total, PER);
  if (halaman !== diminta) hasil = await daftarKomentarModerasi(syarat, halaman, PER, urut);

  // Pilihan hanya 100 kejadian terbaru; yang sedang disaring (dari tautan di
  // tempat lain) bisa lebih tua — selipkan supaya select-nya tidak berbohong.
  let pilihan = await pilihanKejadian();
  if (syarat.kejadian && !pilihan.some((p) => p.nilai === String(syarat.kejadian))) {
    const e = await prisma.events.findUnique({ where: { id: syarat.kejadian }, select: { id: true, title_id: true } });
    if (e) pilihan = [{ nilai: String(e.id), label: e.title_id }, ...pilihan];
  }
  const k = { bagian: "komentar", nilai: saring, bawaan: BAWAAN };

  return (
    <>
      <KopPanel lebar mata="Moderasi" judul="Komentar"
                deskripsi="Komentar pengunjung pada kejadian. Yang belum ditinjau ditandai merah dan belum tampil di situs." />
      <div className={LEBAR}>
        <KendaliSaring bagian="komentar" nilai={saring} cari="Cari nama atau isi…"
                       tab={{ kunci: "status", bawaan: "", pilihan: [
                         { nilai: "", label: "Semua" }, { nilai: "belum", label: "Belum ditinjau" }, { nilai: "disetujui", label: "Disetujui" },
                       ] }}
                       pilih={{ kunci: "kejadian", label: "Semua kejadian", pilihan }} />
        <Tabel
          kepala={<>
            <KepalaUrut {...k} kolom="name">Pengirim</KepalaUrut>
            <th>Komentar</th>
            <th className="hidden xl:table-cell">Kejadian</th>
            <KepalaUrut {...k} kolom="created_at" turunDulu className="hidden sm:table-cell">Dikirim</KepalaUrut>
            {/* Di ponsel aksi ada di halaman rincian — kolom ini akan terdorong keluar layar. */}
            <th className="cms-sel-aksi hidden sm:table-cell"><span className="sr-only">Aksi</span></th>
          </>}
          kosong={hasil.daftar.length === 0 && (syarat.cari || syarat.status || syarat.kejadian
            ? "Tidak ada komentar yang cocok." : "Belum ada komentar.")}
          kaki={<PagerDaftar bagian="komentar" nilai={saring} halaman={halaman} total={hasil.total} per={PER} />}
        >
          {hasil.daftar.map((c) => (
            <tr key={c.id} data-perhatian={!c.is_approved || undefined}>
              <td className="whitespace-nowrap">
                <span className="flex items-center gap-2.5">
                  <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--rona-kuat)] text-[11.5px] font-semibold">
                    {(c.nama ?? "?").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <Link href={`/admin/komentar/${c.id}`} className="block font-medium hover:underline">{c.nama ?? "Tanpa nama"}</Link>
                    {c.parent_id != null && <span className="block text-[12px] text-[var(--lirih)]">Balasan</span>}
                  </span>
                </span>
              </td>
              <td className="min-w-[180px] [overflow-wrap:anywhere]">
                <Link href={`/admin/komentar/${c.id}`} className="line-clamp-2 text-[var(--redup)] hover:text-[var(--jelaga)]">{c.body}</Link>
                {!c.is_approved && <span className="cms-cap cms-cap--perhatian cms-cap--titik mt-1">Belum ditinjau</span>}
              </td>
              <td className="hidden max-w-[220px] xl:table-cell">
                {c.event && (
                  <TautanSaring bagian="komentar" nilai={{ kejadian: String(c.event.id) }}
                                className="line-clamp-1 text-[var(--redup)] hover:underline">
                    {c.event.title_id}
                  </TautanSaring>
                )}
              </td>
              <td className="hidden whitespace-nowrap text-[var(--redup)] tabular-nums sm:table-cell">{c.created_at ? waktu.format(c.created_at) : "—"}</td>
              <td className="cms-sel-aksi hidden sm:table-cell">
                <AksiKomentar id={c.id} disetujui={c.is_approved} bolehHapus={sesi.peran === "admin"} ringkas />
              </td>
            </tr>
          ))}
        </Tabel>
      </div>
    </>
  );
}
