import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { bacaSesi } from "@/lib/sesi";
import { TIPE } from "@/lib/moderasi-komentar";

const pendek = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Pencarian palet ⌘K: lima teratas per jenis. */
export async function GET(req: NextRequest) {
  const sesi = await bacaSesi();
  if (!sesi) return Response.json({ hasil: [] }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return Response.json({ hasil: [] });
  const angka = /^\d+$/.test(q) ? Number(q) : undefined;

  const [kejadian, laporan, komentar, pengguna] = await Promise.all([
    prisma.events.findMany({
      where: { OR: [{ title_id: { contains: q } }, { location: { contains: q } }, ...(angka ? [{ id: angka }] : [])] },
      orderBy: { event_date: "desc" }, take: 5, select: { id: true, title_id: true, location: true },
    }),
    prisma.public_reports.findMany({
      where: { OR: [{ title: { contains: q } }, { reporter_name: { contains: q } }, ...(angka ? [{ id: angka }] : [])] },
      orderBy: { created_at: "desc" }, take: 5, select: { id: true, title: true, status: true },
    }),
    prisma.comments.findMany({
      where: { commentable_type: TIPE, OR: [{ body: { contains: q } }, { name: { contains: q } }] },
      orderBy: { created_at: "desc" }, take: 5, select: { id: true, name: true, body: true },
    }),
    sesi.peran === "admin"
      ? prisma.users.findMany({
          where: { role: { in: ["admin", "editor"] }, OR: [{ name: { contains: q } }, { email: { contains: q } }] },
          take: 5, select: { id: true, name: true, email: true },
        })
      : [],
  ]);

  return Response.json({
    hasil: [
      ...kejadian.map((e) => ({ kelompok: "Kejadian", label: e.title_id, ket: e.location, href: `/admin/kejadian/${e.id}` })),
      ...laporan.map((l) => ({ kelompok: "Laporan warga", label: l.title, ket: l.status, href: `/admin/laporan/${l.id}` })),
      ...komentar.map((k) => ({ kelompok: "Komentar", label: pendek(k.body), ket: k.name ?? "", href: `/admin/komentar/${k.id}` })),
      ...pengguna.map((u) => ({ kelompok: "Pengguna", label: u.name, ket: u.email, href: `/admin/pengguna/${u.id}` })),
    ],
  });
}
