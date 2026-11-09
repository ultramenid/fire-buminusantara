import type { Prisma } from "@prisma/client";
import { revalidateTag } from "next/cache";
import { anonimkanMedia, BATAS_NAMA, cabutTokenApple, galat, penggunaDari, publik } from "@/lib/akun-mobile";
import { bacaJson } from "@/lib/batas-badan";
import { emailAkunDihapus, saring } from "@/lib/komentar";
import { bacaBerkasMedia } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { penandaAkun } from "@/lib/suka";
import { hapusFotoSemua, hapusVerifikasiAkun } from "@/lib/verifikasi-ktp";

/** GET /api/mobile/saya → { pengguna, statistik: { laporan, tayang, disukai } } */
export async function GET(req: Request) {
  const p = await penggunaDari(req);
  if (!p) return galat("Masuk dulu.", 401);
  const [laporan, tayang, disukai] = await Promise.all([
    prisma.public_reports.count({ where: { reporter_user_id: p.id } }),
    prisma.public_reports.count({ where: { reporter_user_id: p.id, status: "approved" } }),
    prisma.event_likes.count({ where: { visitor_hash: penandaAkun(p.id) } }),
  ]);
  return Response.json({ pengguna: publik(p), statistik: { laporan, tayang, disukai } });
}

/** PATCH /api/mobile/saya { nama } → { pengguna } */
export async function PATCH(req: Request) {
  const p = await penggunaDari(req);
  if (!p) return galat("Masuk dulu.", 401);
  const isi = await bacaJson(req);
  if (isi instanceof Response) return isi;
  const nama = String(isi?.nama ?? "").trim();
  if (!nama) return galat("Nama tidak boleh kosong.", 422);
  if (nama.length > BATAS_NAMA) return galat(`Nama maksimal ${BATAS_NAMA} karakter.`, 422);
  // Nama tampil publik di setiap komentar & siaran: saringannya sama dengan isi komentar.
  if (saring(nama) !== nama) return galat("Nama mengandung kata yang tidak pantas.", 422);
  const baru = await prisma.users.update({
    where: { id: p.id },
    data: { name: nama, updated_at: new Date() },
    select: { id: true, name: true, email: true, image: true },
  });
  return Response.json({ pengguna: publik(baru) });
}

/**
 * DELETE /api/mobile/saya → { ok: true } — hapus akun dari aplikasi (wajib di
 * App Store & Google Play). Komentar tetap ada demi utas percakapan, tapi nama
 * & emailnya dihapus, begitu pula @sebutan nama itu di balasan orang lain;
 * laporan yang sudah dikirim tetap jadi bukti kejadian, tanpa nama pelapor —
 * juga di keterangan lampirannya, termasuk di kejadian hasil promosinya — dan
 * tanpa pemilik. Sesi, suka, pengajuan verifikasi KTP (berikut fotonya), dan
 * akunnya dihapus; token Sign in with Apple dicabut. Akun pengelola CMS tidak
 * bisa dihapus dari sini.
 */
export async function DELETE(req: Request) {
  const p = await penggunaDari(req);
  if (!p) return galat("Masuk dulu.", 401);
  const akun = await prisma.users.findUnique({ where: { id: p.id }, select: { role: true, apple_id: true } });
  if (akun?.role !== "commenter") {
    return galat("Akun ini juga akun pengelola CMS, jadi tidak bisa dihapus dari aplikasi. Hubungi admin.", 403);
  }
  if (akun.apple_id) await cabutTokenApple(p.id);

  const [kejadianBerubah, fotoKtp] = await prisma.$transaction(async (tx) => {
    // mention_name adalah salinan nama induk saat membalas, jadi setiap balasan
    // ke komentar akun ini menyebut akun ini — termasuk nama lama sebelum diganti.
    const komentar = await tx.comments.findMany({ where: { user_id: p.id }, select: { id: true } });
    await tx.comments.updateMany({
      where: { parent_id: { in: komentar.map((k) => k.id) } },
      data: { mention_name: "Akun dihapus" },
    });
    await tx.comments.updateMany({
      where: { user_id: p.id },
      data: { name: "Akun dihapus", email: emailAkunDihapus(p.id), user_id: null },
    });

    // Keterangan lampiran laporan = nama pelapor saat mengirim (simpanLaporanPublik),
    // yang bisa berbeda dari nama akun sekarang.
    let berubah = false;
    const laporan = await tx.public_reports.findMany({
      where: { reporter_user_id: p.id },
      select: { id: true, media: true, reporter_name: true, kejadian: { select: { id: true, media: true } } },
    });
    for (const l of laporan) {
      const nama = new Set(
        [p.name, l.reporter_name ?? "", ...bacaBerkasMedia(l.media).map((b) => b.keterangan ?? "")]
          .map((n) => n.trim())
          .filter((n) => n && n !== "anonim"),
      );
      const media = anonimkanMedia(l.media, nama);
      await tx.public_reports.update({
        where: { id: l.id },
        data: {
          reporter_name: null,
          reporter_user_id: null,
          ...(media.berubah && { media: media.media as Prisma.InputJsonValue }),
        },
      });
      const diKejadian = l.kejadian ? anonimkanMedia(l.kejadian.media, nama) : null;
      if (l.kejadian && diKejadian?.berubah) {
        await tx.events.update({ where: { id: l.kejadian.id }, data: { media: diKejadian.media as Prisma.InputJsonValue } });
        berubah = true;
      }
    }

    await tx.event_likes.deleteMany({ where: { visitor_hash: penandaAkun(p.id) } });
    // Barisnya di sini; fotonya baru dihapus setelah transaksi berhasil.
    const foto = await hapusVerifikasiAkun(tx, p.id);
    await tx.users.delete({ where: { id: p.id } });
    return [berubah, foto] as const;
  });
  await hapusFotoSemua(fotoKtp);

  // Data pribadi harus hilang sekarang, bukan setelah satu sajian basi lagi.
  revalidateTag("komentar", { expire: 0 });
  if (kejadianBerubah) revalidateTag("kejadian", { expire: 0 });
  return Response.json({ ok: true });
}
