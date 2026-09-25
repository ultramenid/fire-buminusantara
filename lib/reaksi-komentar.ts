import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";

/** Jenis konten yang dikomentari di /fire. */
export const TIPE = "App\\Models\\Event";

export type ReaksiKomentar = {
  id: number;
  jenis: string;
  ip_address: string | null;
  created_at: Date | null;
  user: { id: number; name: string } | null;
  komentar: { id: number; body: string } | null;
  event: { id: number; title_id: string } | null;
};

export type HasilDaftarReaksi = {
  daftar: ReaksiKomentar[];
  total: number;
};

/** Reaksi terbaru, disertai komentar dan kejadian yang menampungnya. */
export async function daftarReaksi(halaman = 1, batas = 15): Promise<HasilDaftarReaksi> {
  const [total, baris] = await Promise.all([
    prisma.comment_reactions.count(),
    prisma.comment_reactions.findMany({
      orderBy: { created_at: "desc" },
      skip: (halaman - 1) * batas,
      take: batas,
      select: {
        id: true,
        type: true,
        ip_address: true,
        created_at: true,
        users: { select: { id: true, name: true } },
        comments: {
          select: { id: true, body: true, commentable_id: true },
        },
      },
    }),
  ]);

  const idKejadian = [...new Set(
    baris.map((r) => Number(r.comments?.commentable_id)).filter((id) => id > 0),
  )];

  const kejadian = idKejadian.length
    ? await prisma.events.findMany({
        where: { id: { in: idKejadian } },
        select: { id: true, title_id: true },
      })
    : [];

  const petaE = new Map(kejadian.map((e) => [Number(e.id), e]));

  const daftar = baris.map((r) => {
    const k = r.comments;
    const e = k ? petaE.get(Number(k.commentable_id)) : undefined;
    return {
      id: Number(r.id),
      jenis: r.type,
      ip_address: r.ip_address,
      created_at: r.created_at,
      user: r.users ? { id: Number(r.users.id), name: r.users.name } : null,
      komentar: k ? { id: Number(k.id), body: k.body } : null,
      event: e ? { id: Number(e.id), title_id: e.title_id } : null,
    };
  });

  return { daftar, total };
}

/** Hitung reaksi per kejadian: berapa like & dislike pada semua komentarnya. */
export const reaksiPerKejadian = unstable_cache(
  async () => {
    const baris = await prisma.comment_reactions.findMany({
      where: {
        comments: {
          commentable_type: TIPE,
          commentable_id: { not: null },
        },
      },
      select: {
        comments: {
          select: { commentable_id: true },
        },
      },
    });

    const hitungan = new Map<number, number>();
    for (const r of baris) {
      const id = Number(r.comments?.commentable_id);
      if (Number.isFinite(id) && id > 0) {
        hitungan.set(id, (hitungan.get(id) ?? 0) + 1);
      }
    }

    const idKejadian = [...hitungan.keys()];

    const kejadian = idKejadian.length
      ? await prisma.events.findMany({
          where: { id: { in: idKejadian } },
          select: { id: true, title_id: true },
        })
      : [];

    const petaE = new Map(kejadian.map((e) => [Number(e.id), e]));

    return idKejadian
      .map((id) => ({
        kejadianId: id,
        jumlahReaksi: hitungan.get(id) ?? 0,
        judul: petaE.get(id)?.title_id ?? "Kejadian terhapus",
      }))
      .filter((x) => x.kejadianId > 0 && x.jumlahReaksi > 0)
      .sort((a, b) => b.jumlahReaksi - a.jumlahReaksi);
  },
  ["admin-reaksi-per-kejadian"],
  { revalidate: 30, tags: ["reactions", "comments"] }
);
