import { prisma } from "./prisma.ts";

/** Jenis konten yang dikomentari di /fire. */
export const TIPE = "App\\Models\\Event";

export type KomentarModerasi = {
  id: number;
  nama: string | null;
  email: string | null;
  body: string;
  is_approved: boolean;
  ip_address: string | null;
  created_at: Date | null;
  parent_id: number | null;
  event: { id: number; title_id: string } | null;
  jumlahReaksi: number;
};

const PILIH = {
  id: true, name: true, email: true, body: true, is_approved: true,
  ip_address: true, created_at: true, parent_id: true, commentable_id: true,
  _count: { select: { comment_reactions: true } },
} as const;

export type SyaratKomentar = {
  status?: "belum" | "disetujui";
  kejadian?: number;
  cari?: string;
};

export type HasilKomentarModerasi = {
  daftar: KomentarModerasi[];
  total: number;
};

/** Syarat saringan → where Prisma. Dipakai daftar dan "komentar berikutnya". */
export function whereKomentar(syarat: SyaratKomentar) {
  return {
    commentable_type: TIPE,
    ...(syarat.status === "belum" ? { is_approved: false } : {}),
    ...(syarat.status === "disetujui" ? { is_approved: true } : {}),
    ...(syarat.kejadian ? { commentable_id: syarat.kejadian } : {}),
    ...(syarat.cari
      ? { OR: [{ name: { contains: syarat.cari } }, { body: { contains: syarat.cari } }] }
      : {}),
  };
}

/** Daftar komentar pada kejadian, bisa difilter, diurutkan, dan dipaginasi. */
export async function daftarKomentarModerasi(
  syarat: SyaratKomentar,
  halaman = 1,
  perHalaman = 15,
  urut: { kolom: "created_at" | "name"; arah: "asc" | "desc" } = { kolom: "created_at", arah: "desc" },
): Promise<HasilKomentarModerasi> {
  const where = whereKomentar(syarat);

  const [total, baris] = await Promise.all([
    prisma.comments.count({ where }),
    prisma.comments.findMany({
      where,
      orderBy: [{ [urut.kolom]: urut.arah }, { id: "desc" }],
      skip: (halaman - 1) * perHalaman,
      take: perHalaman,
      select: PILIH,
    }),
  ]);

  const idKejadian = [
    ...new Set(baris.map((k) => Number(k.commentable_id)).filter((id) => id > 0)),
  ];

  const kejadian = idKejadian.length
    ? await prisma.events.findMany({
        where: { id: { in: idKejadian } },
        select: { id: true, title_id: true },
      })
    : [];

  const petaE = new Map(kejadian.map((e) => [Number(e.id), e]));

  const daftar = baris.map((k) => ({
    id: Number(k.id),
    nama: k.name,
    email: k.email,
    body: k.body,
    is_approved: k.is_approved,
    ip_address: k.ip_address,
    created_at: k.created_at,
    parent_id: k.parent_id !== null ? Number(k.parent_id) : null,
    event: petaE.get(Number(k.commentable_id))
      ? { id: Number(petaE.get(Number(k.commentable_id))!.id), title_id: petaE.get(Number(k.commentable_id))!.title_id }
      : null,
    jumlahReaksi: k._count.comment_reactions,
  }));

  return { daftar, total };
}

/** Ubah status persetujuan komentar. */
export async function aturPersetujuan(id: number, disetujui: boolean) {
  await prisma.comments.update({
    where: { id },
    data: { is_approved: disetujui, updated_at: new Date() },
  });
}

/** Hapus komentar beserta balasan dan reaksinya. */
export async function hapusKomentarModerasi(id: number) {
  await prisma.comments.delete({ where: { id } });
}
