import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { wajibSesi } from "@/lib/sesi";
import { ISI, Kartu, KopPanel } from "../../ruang";
import { FormPengguna } from "../form-pengguna";
import { TombolHapusPengguna } from "../tombol-hapus";

export default async function UbahPengguna({ params }: { params: Promise<{ id: string }> }) {
  const sesi = await wajibSesi("admin");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const akun = await prisma.users.findUnique({
    where: { id },
    select: { name: true, email: true, role: true },
  });
  if (!akun) notFound();
  const diriSendiri = id === sesi.id;

  return (
    <>
      <KopPanel mata={diriSendiri ? "Akun Anda" : "Pengguna"} judul={akun.name} kembali="/admin/pengguna"
                deskripsi={<span className="cms-angka">{akun.email}</span>}
                sisi={<span className="cms-cap capitalize">{akun.role}</span>} />
      <div className={ISI}>
        <div className="grid max-w-[760px] gap-5">
          <FormPengguna key={id} id={id} diriSendiri={diriSendiri}
                        awal={{ nama: akun.name, email: akun.email, peran: akun.role }} />

          {!diriSendiri && (
            <Kartu bahaya judul="Hapus akun"
                   deskripsi="Akun ini dipakai bersama situs Pasopati — menghapusnya juga menghapus akun di sana. Komentar dan tinjauannya tetap ada, tanpa nama. Untuk sekadar mencabut akses CMS, ubah perannya ke Commenter."
                   kaki={<TombolHapusPengguna id={id} />} />
          )}
        </div>
      </div>
    </>
  );
}
