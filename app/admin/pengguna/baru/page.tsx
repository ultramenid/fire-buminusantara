import { wajibSesi } from "@/lib/sesi";
import { ISI, KopPanel } from "../../ruang";
import { FormPengguna } from "../form-pengguna";

export default async function TambahPengguna() {
  await wajibSesi("admin");

  return (
    <>
      <KopPanel mata="Pengguna" judul="Tambah pengguna" kembali="/admin/pengguna"
                deskripsi="Akun yang dibuat di sini langsung bisa dipakai masuk ke CMS dan ke situs Pasopati." />
      <div className={ISI}>
        <div className="max-w-[760px]"><FormPengguna id={null} /></div>
      </div>
    </>
  );
}
