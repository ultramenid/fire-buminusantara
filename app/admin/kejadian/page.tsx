import Link from "next/link";
import type { events_status } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { wajibSesi } from "@/lib/sesi";
import { rapikanLokasi, inferProvinsi } from "@/lib/wilayah";
import { bacaBerkasMedia } from "@/lib/media";
import { bacaSaring, halamanDari, urutDari } from "../saring";
import { KopPanel, LEBAR, Tabel, TombolTambah } from "../ruang";
import { KendaliSaring, KepalaUrut, PagerDaftar } from "../ruang-klien";
import { Pratinjau } from "../pratinjau";
import { Ikon } from "../menu-admin";
import { TombolTayang } from "./tombol-tayang";

const PER = 20;
const BAWAAN = "-event_date";
const tanggal = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" });

export default async function DaftarKejadian() {
  await wajibSesi();
  const saring = await bacaSaring("kejadian");
  const cari = saring.cari?.trim();
  const status = saring.status === "draft" || saring.status === "published" ? (saring.status as events_status) : undefined;
  const urut = urutDari(saring, ["event_date", "title_id", "location", "status"] as const, BAWAAN);
  const where = {
    ...(cari ? { OR: [{ title_id: { contains: cari } }, { location: { contains: cari } }] } : {}),
    ...(status ? { status } : {}),
  };

  const total = await prisma.events.count({ where });
  const halaman = halamanDari(saring, total, PER);
  const daftar = await prisma.events.findMany({
    where, orderBy: [{ [urut.kolom]: urut.arah }, { id: "desc" }], skip: (halaman - 1) * PER, take: PER,
    select: { id: true, title_id: true, event_date: true, location: true, image_id: true, video: true, media: true, status: true },
  });
  const k = { bagian: "kejadian", nilai: saring, bawaan: BAWAAN };

  return (
    <>
      <KopPanel lebar mata="Konten" judul="Kejadian"
                deskripsi="Catatan kebakaran yang tampil di korsel, peta, dan arsip situs. Draft hanya terlihat di CMS.">
        <TombolTambah href="/admin/kejadian/baru" label="Tambah kejadian" />
      </KopPanel>
      <div className={LEBAR}>
        <KendaliSaring bagian="kejadian" nilai={saring} cari="Cari judul atau lokasi…"
                       tab={{ kunci: "status", bawaan: "", pilihan: [
                         { nilai: "", label: "Semua" }, { nilai: "published", label: "Tayang" }, { nilai: "draft", label: "Draft" },
                       ] }} />
        <Tabel
          kepala={<>
            <th className="w-[76px]"><span className="sr-only">Media</span></th>
            <KepalaUrut {...k} kolom="title_id">Judul</KepalaUrut>
            <KepalaUrut {...k} kolom="location" className="hidden lg:table-cell">Lokasi</KepalaUrut>
            <KepalaUrut {...k} kolom="event_date" turunDulu className="hidden sm:table-cell">Tanggal</KepalaUrut>
            <KepalaUrut {...k} kolom="status">Status</KepalaUrut>
            <th className="cms-sel-aksi"><span className="sr-only">Aksi</span></th>
          </>}
          kosong={daftar.length === 0 && (cari || status ? "Tidak ada kejadian yang cocok." : "Belum ada kejadian. Tekan Tambah kejadian untuk mencatat yang pertama.")}
          kaki={<PagerDaftar bagian="kejadian" nilai={saring} halaman={halaman} total={total} per={PER} />}
        >
          {daftar.map((e) => {
            const galeri = bacaBerkasMedia(e.media).length;
            const provinsi = inferProvinsi(e.location);
            const draft = e.status === "draft";
            return (
              <tr key={String(e.id)}>
                <td><Pratinjau imageId={e.image_id} video={e.video} media={e.media} kelas="h-10 w-14 rounded-[6px]" /></td>
                <td className="max-w-[420px]">
                  <Link href={`/admin/kejadian/${e.id}`} className="line-clamp-2 font-medium hover:underline">{e.title_id}</Link>
                  <span className="mt-0.5 flex items-center gap-2 text-[12px] text-[var(--lirih)]">
                    <span className="sm:hidden">{tanggal.format(e.event_date)}</span>
                    {galeri > 0 && (
                      <span className="inline-flex items-center gap-1"><Ikon nama="gambar" className="size-3" />{galeri} media</span>
                    )}
                  </span>
                </td>
                <td className="hidden max-w-[260px] text-[var(--redup)] lg:table-cell">
                  <span className="line-clamp-1">{rapikanLokasi(e.location) ?? "—"}</span>
                  {provinsi && <span className="block text-[12px] text-[var(--lirih)]">{provinsi}</span>}
                </td>
                <td className="hidden whitespace-nowrap text-[var(--redup)] tabular-nums sm:table-cell">{tanggal.format(e.event_date)}</td>
                <td>
                  <span className={`cms-cap cms-cap--titik ${draft ? "cms-cap--diam" : "cms-cap--aman"}`}>
                    {draft ? "Draft" : "Tayang"}
                  </span>
                </td>
                <td className="cms-sel-aksi">
                  <span className="inline-flex items-center gap-0.5">
                    <span className="hidden sm:contents"><TombolTayang id={Number(e.id)} status={e.status} /></span>
                    <Link href={`/admin/kejadian/${e.id}`} aria-label={`Ubah ${e.title_id}`} title="Ubah"
                          className="cms-ikon-tombol size-7"><Ikon nama="kanan" className="size-3.5" /></Link>
                  </span>
                </td>
              </tr>
            );
          })}
        </Tabel>
      </div>
    </>
  );
}
