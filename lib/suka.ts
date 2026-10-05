import { createHash } from "node:crypto";
import { prisma } from "./prisma.ts";

/**
 * Suka (jempol) pengunjung pada kejadian umpan. Tanpa akun: satu suka per
 * perangkat per kejadian, perangkat = sha256(ip|user agent). IP & user agent
 * disimpan mentah untuk dipantau di /admin/suka.
 */

const BATAS_UA = 512;

export function penandaPengunjung(ip: string | null, ua: string | null): string {
  return createHash("sha256").update(`${ip ?? ""}|${ua ?? ""}`).digest("hex");
}

/** Suka — idempoten: suka kedua dari perangkat yang sama diabaikan. */
export async function sukai(eventId: number, ip: string | null, ua: string | null) {
  const visitor_hash = penandaPengunjung(ip, ua);
  await prisma.event_likes.upsert({
    where: { event_id_visitor_hash: { event_id: eventId, visitor_hash } },
    create: {
      event_id: eventId,
      visitor_hash,
      ip_address: ip,
      user_agent: ua?.slice(0, BATAS_UA) ?? null,
      created_at: new Date(),
    },
    update: {},
  });
}

export async function batalSuka(eventId: number, ip: string | null, ua: string | null) {
  await prisma.event_likes.deleteMany({
    where: { event_id: eventId, visitor_hash: penandaPengunjung(ip, ua) },
  });
}

export function jumlahSuka(eventId: number) {
  return prisma.event_likes.count({ where: { event_id: eventId } });
}

export type BarisSuka = {
  id: number;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date | null;
  event: { id: number; title_id: string };
};

/** Suka terbaru untuk CMS, disertai kejadiannya. */
export async function daftarSuka(halaman = 1, batas = 20): Promise<{ daftar: BarisSuka[]; total: number }> {
  const [total, baris] = await Promise.all([
    prisma.event_likes.count(),
    prisma.event_likes.findMany({
      orderBy: { id: "desc" },
      skip: (halaman - 1) * batas,
      take: batas,
      select: {
        id: true, ip_address: true, user_agent: true, created_at: true,
        events: { select: { id: true, title_id: true } },
      },
    }),
  ]);
  return {
    total,
    daftar: baris.map((r) => ({
      id: Number(r.id),
      ip_address: r.ip_address,
      user_agent: r.user_agent,
      created_at: r.created_at,
      event: { id: Number(r.events.id), title_id: r.events.title_id },
    })),
  };
}

/** Jumlah suka & komentar tersetujui terkini untuk sekumpulan kejadian —
 *  tanpa cache, untuk angka hidup di kartu umpan. */
export async function hitungLangsung(ids: number[]): Promise<Record<number, { suka: number; komentar: number }>> {
  const [suka, komentar] = await Promise.all([
    prisma.event_likes.groupBy({ by: ["event_id"], where: { event_id: { in: ids } }, _count: true }),
    prisma.comments.groupBy({
      by: ["commentable_id"],
      where: { commentable_type: "App\\Models\\Event", is_approved: true, commentable_id: { in: ids } },
      _count: true,
    }),
  ]);
  const hasil: Record<number, { suka: number; komentar: number }> = {};
  for (const id of ids) hasil[id] = { suka: 0, komentar: 0 };
  for (const s of suka) hasil[Number(s.event_id)].suka = s._count;
  for (const k of komentar) if (k.commentable_id != null) hasil[Number(k.commentable_id)].komentar = k._count;
  return hasil;
}
