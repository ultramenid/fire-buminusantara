import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { wajibSesi } from "@/lib/sesi";
import { TIPE, whereKomentar } from "@/lib/moderasi-komentar";
import { bacaSaring } from "../../saring";
import { BilahAksi, ISI, Kartu, KopPanel } from "../../ruang";
import { TautanSaring } from "../../ruang-klien";
import { Ikon } from "../../menu-admin";
import { AksiKomentar, IsiKomentar } from "../tombol-aksi";

const waktu = new Intl.DateTimeFormat("id-ID", {
  weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const waktuPendek = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function RincianKomentar({ params }: { params: Promise<{ id: string }> }) {
  const sesi = await wajibSesi();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const k = await prisma.comments.findFirst({
    where: { id, commentable_type: TIPE },
    select: {
      id: true, name: true, email: true, body: true, is_approved: true, ip_address: true,
      created_at: true, updated_at: true, commentable_id: true,
      users: { select: { name: true } },
      comments: { select: { id: true, name: true, body: true } },
      other_comments: { orderBy: { created_at: "asc" }, select: { id: true, name: true, body: true, is_approved: true } },
      _count: { select: { comment_reactions: true } },
    },
  });
  if (!k) notFound();
  // Komentar berikutnya dalam saringan tabel yang sama (lebih lama) — dibuka
  // sesudah memutuskan, supaya antrean dikerjakan tanpa bolak-balik ke tabel.
  const saring = await bacaSaring("komentar");
  const lanjut = k.created_at && await prisma.comments.findFirst({
    where: {
      ...whereKomentar({
        cari: saring.cari?.trim() || undefined,
        status: saring.status === "belum" || saring.status === "disetujui" ? saring.status : undefined,
        kejadian: Number(saring.kejadian) || undefined,
      }),
      id: { not: id },
      created_at: { lte: k.created_at },
      NOT: { created_at: k.created_at, id: { gt: id } },
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  const berikutnya = lanjut ? `/admin/komentar/${lanjut.id}` : null;

  const kejadian = k.commentable_id
    ? await prisma.events.findUnique({ where: { id: k.commentable_id }, select: { id: true, title_id: true } })
    : null;
  const nama = k.name ?? "Tanpa nama";

  return (
    <>
      <KopPanel mata={`Komentar #${k.id}`} judul={nama} kembali="/admin/komentar"
                sisi={<span className={`cms-cap cms-cap--titik ${k.is_approved ? "cms-cap--aman" : "cms-cap--perhatian"}`}>
                  {k.is_approved ? "Tampil di situs" : "Belum ditinjau"}
                </span>}>
        {berikutnya && (
          <Link href={berikutnya} className="cms-tombol cms-tombol--hantu cms-tombol--kecil">
            Berikutnya <Ikon nama="kanan" className="size-3.5" />
          </Link>
        )}
      </KopPanel>

      <BilahAksi>
        <AksiKomentar id={id} disetujui={k.is_approved} bolehHapus={sesi.peran === "admin"} berikutnya={berikutnya} />
        <p className="ml-auto hidden text-[12.5px] text-[var(--lirih)] md:block">
          {berikutnya ? "Sesudah memutuskan, komentar berikutnya terbuka otomatis." : "Ini komentar terakhir dalam saringan."}
        </p>
      </BilahAksi>

      <div className={`${ISI} grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_260px]`}>
        <div className="grid min-w-0 gap-5">
          {k.comments && (
            <Link href={`/admin/komentar/${k.comments.id}`}
                  className="block rounded-[var(--jari-kartu)] border border-dashed border-[var(--garis-tegas)] px-4 py-3 transition-colors hover:bg-[var(--rona)]">
              <span className="cms-mata">Membalas {k.comments.name ?? "tanpa nama"}</span>
              <span className="mt-0.5 line-clamp-2 text-[13px] text-[var(--redup)]">{k.comments.body}</span>
            </Link>
          )}

          <Kartu
            judul={
              <span className="flex items-center gap-2.5">
                <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--rona-kuat)] text-[12.5px] font-semibold">
                  {nama.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{nama}</span>
                  <span className="block text-[12px] font-normal text-[var(--lirih)] tabular-nums">
                    {k.created_at ? waktuPendek.format(k.created_at) : "—"}
                  </span>
                </span>
              </span>
            }
          >
            <IsiKomentar id={id} isi={k.body} penuh />
          </Kartu>

          {k.other_comments.length > 0 && (
            <Kartu judul={`Balasan (${k.other_comments.length})`} isi="">
              <ul className="divide-y divide-[var(--garis)]">
                {k.other_comments.map((b) => (
                  <li key={String(b.id)}>
                    <Link href={`/admin/komentar/${b.id}`} className="block px-5 py-3 transition-colors hover:bg-[var(--rona)]">
                      <span className="flex items-center gap-2 text-[12.5px]">
                        <span className="font-medium">{b.name ?? "Tanpa nama"}</span>
                        {!b.is_approved && <span className="cms-cap cms-cap--perhatian cms-cap--titik">Belum ditinjau</span>}
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-[13px] text-[var(--redup)]">{b.body}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Kartu>
          )}
        </div>

        <Kartu judul="Keterangan">
          <dl className="cms-dl">
            <div>
              <dt>Kejadian</dt>
              <dd>
                {kejadian ? (
                  <>
                    <Link href={`/admin/kejadian/${kejadian.id}`} className="font-medium hover:underline">{kejadian.title_id}</Link>
                    <TautanSaring bagian="komentar" nilai={{ kejadian: String(kejadian.id) }}
                                  className="mt-1 block text-[12px] text-[var(--lirih)] hover:text-[var(--jelaga)] hover:underline">
                      Semua komentar kejadian ini →
                    </TautanSaring>
                  </>
                ) : <span className="text-[var(--lirih)]">Sudah dihapus</span>}
              </dd>
            </div>
            <div><dt>Dikirim</dt><dd className="tabular-nums">{k.created_at ? waktu.format(k.created_at) : "—"}</dd></div>
            {k.users && <div><dt>Akun</dt><dd>{k.users.name}</dd></div>}
            <div><dt>Email</dt><dd className="cms-angka break-all">{k.email ?? "—"}</dd></div>
            <div><dt>Alamat IP</dt><dd className="cms-angka">{k.ip_address ?? "—"}</dd></div>
            <div><dt>Reaksi</dt><dd className="tabular-nums">{k._count.comment_reactions}</dd></div>
          </dl>
        </Kartu>
      </div>
    </>
  );
}
