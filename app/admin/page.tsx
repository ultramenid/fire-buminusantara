import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { wajibSesi } from "@/lib/sesi";
import { ISI, KopPanel, Kartu, Hampa } from "./ruang";
import { Pratinjau } from "./pratinjau";
import { TautanSaring } from "./ruang-klien";
import { Ikon } from "./menu-admin";

const TIPE = "App\\Models\\Event";

const tanggalPanjang = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" });
const tanggalPendek = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const waktu = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function inisial(nama: string | null): string {
  if (!nama) return "?";
  const bagian = nama.trim().split(/\s+/);
  if (bagian.length === 1) return bagian[0].slice(0, 2).toUpperCase();
  return (bagian[0][0] + bagian[bagian.length - 1][0]).toUpperCase();
}

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
    <>
      <KopPanel
        mata={tanggalPanjang.format(new Date())}
        judul={`Selamat datang, ${sesi.nama.split(" ")[0]}`}
        deskripsi="Ringkasan operasional dan keadaan pantauan karhutla hari ini."
      >
        <Link href="/admin/kejadian/baru" className="cms-tombol cms-tombol--utama">
          <Ikon nama="tambah" className="size-3.5" />
          Tambah kejadian
        </Link>
      </KopPanel>

      <div className={ISI}>
        {/* Metrik angka sorotan */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KartuAngka
            label="Kejadian tercatat"
            nilai={jumlahKejadian}
            tautan="/admin/kejadian"
            catatan="Tampil di korsel & peta"
            ikon="api"
          />
          <KartuAngka
            label="Komentar masuk"
            nilai={jumlahKomentar}
            tautan="/admin/komentar"
            saring={{}}
            catatan="Dari seluruh laporan masyarakat"
            ikon="balon"
          />
          <KartuAngka
            label="Menunggu ditinjau"
            nilai={belumDisetujui}
            tautan="/admin/komentar"
            saring={{ status: "belum" }}
            catatan={belumDisetujui > 0 ? "Belum tampil di situs publik" : "Semua komentar sudah ditinjau"}
            sorot={belumDisetujui > 0}
            ikon="kotak"
          />
        </div>

        {/* Kolom kejadian & komentar terbaru */}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* Kejadian terbaru */}
          <Kartu
            judul="Kejadian terbaru"
            deskripsi="5 kejadian terakhir yang dicatat ke sistem"
            aksi={
              <Link href="/admin/kejadian" className="cms-tombol cms-tombol--hantu cms-tombol--kecil">
                Semua kejadian
                <Ikon nama="kanan" className="size-3" />
              </Link>
            }
            isi=""
          >
            {kejadianTerbaru.length === 0 ? (
              <div className="p-6">
                <Hampa judul="Belum ada kejadian">
                  Mulai catat kejadian karhutla dengan menekan tombol Tambah Kejadian.
                </Hampa>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--garis)]">
                {kejadianTerbaru.map((e) => (
                  <li key={String(e.id)} className="flex items-center gap-3.5 p-3.5 transition-colors hover:bg-[var(--papan)]">
                    <Pratinjau
                      imageId={e.image_id}
                      video={e.video}
                      media={e.media}
                      kelas="h-11 w-16 shrink-0 rounded-[var(--jari)] border border-[var(--garis)]"
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/admin/kejadian/${e.id}`}
                        className="block truncate text-[13.5px] font-medium text-[var(--jelaga)] hover:underline"
                      >
                        {e.title_id}
                      </Link>
                      <div className="mt-1 flex items-center gap-2">
                        <span className={`cms-cap cms-cap--titik ${e.status === "published" ? "cms-cap--aman" : "cms-cap--netral"}`}>
                          {e.status === "published" ? "Tayang" : "Draft"}
                        </span>
                        <span className="text-[12px] text-[var(--lirih)]">·</span>
                        <span className="cms-angka text-[12px] text-[var(--lirih)]">
                          {tanggalPendek.format(e.event_date)}
                        </span>
                      </div>
                    </div>
                    <Link
                      href={`/admin/kejadian/${e.id}`}
                      className="cms-tombol cms-tombol--hantu cms-tombol--kecil shrink-0"
                    >
                      Buka
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Kartu>

          {/* Komentar terbaru */}
          <Kartu
            judul="Komentar terbaru"
            deskripsi="5 tanggapan publik paling anyar"
            aksi={
              <Link href="/admin/komentar" className="cms-tombol cms-tombol--hantu cms-tombol--kecil">
                Semua komentar
                <Ikon nama="kanan" className="size-3" />
              </Link>
            }
            isi=""
          >
            {komentarTerbaru.length === 0 ? (
              <div className="p-6">
                <Hampa judul="Belum ada komentar">
                  Komentar dari warga atau pembaca akan muncul di sini.
                </Hampa>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--garis)]">
                {komentarTerbaru.map((k) => (
                  <li key={String(k.id)} className="p-3.5 transition-colors hover:bg-[var(--papan)]">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--garis)] text-[10.5px] font-semibold text-[var(--redup)]"
                        >
                          {inisial(k.name)}
                        </span>
                        <Link
                          href={`/admin/komentar/${k.id}`}
                          className="truncate text-[13.5px] font-semibold text-[var(--jelaga)] hover:underline"
                        >
                          {k.name ?? "Tanpa nama"}
                        </Link>
                        {!k.is_approved ? (
                          <span className="cms-cap cms-cap--perhatian shrink-0">Perlu tinjauan</span>
                        ) : (
                          <span className="cms-cap cms-cap--aman shrink-0">Disetujui</span>
                        )}
                      </div>
                      <span className="cms-angka shrink-0 text-[11.5px] text-[var(--lirih)]">
                        {k.created_at ? waktu.format(k.created_at) : "—"}
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-[1.5] text-[var(--redup)]">
                      {k.body}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Kartu>
        </div>
      </div>
    </>
  );
}

function KartuAngka({
  label,
  nilai,
  catatan,
  tautan,
  saring,
  sorot = false,
  ikon,
}: {
  label: string;
  nilai: number;
  catatan: string;
  tautan: string;
  saring?: Record<string, string>;
  sorot?: boolean;
  ikon: Parameters<typeof Ikon>[0]["nama"];
}) {
  const kelas = `group relative block rounded-[var(--jari-kartu)] border p-4 transition-all hover:bg-[var(--papan)] hover:border-[var(--redup)] ${
    sorot
      ? "border-amber-500/40 bg-amber-500/5 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10"
      : "border-[var(--garis)] bg-[var(--kertas)] shadow-[var(--bayang)]"
  }`;

  const isi = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="cms-mata">{label}</p>
        <div
          className={`flex size-7 items-center justify-center rounded-[var(--jari)] ${
            sorot
              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
              : "bg-[var(--papan)] text-[var(--redup)]"
          }`}
        >
          <Ikon nama={ikon} className="size-3.5" />
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p
          className={`cms-angka text-[36px] font-semibold leading-none tracking-tight ${
            sorot ? "text-amber-600 dark:text-amber-400" : "text-[var(--jelaga)]"
          }`}
        >
          {nilai}
        </p>
        {sorot && (
          <span className="cms-cap cms-cap--perhatian text-[11px]">
            Perhatian
          </span>
        )}
      </div>
      <p className="mt-2 text-[12px] text-[var(--lirih)] transition-colors group-hover:text-[var(--redup)]">
        {catatan}
      </p>
    </>
  );

  return saring ? (
    <TautanSaring bagian={tautan.split("/")[2]} nilai={saring} className={kelas}>
      {isi}
    </TautanSaring>
  ) : (
    <Link href={tautan} className={kelas}>
      {isi}
    </Link>
  );
}
