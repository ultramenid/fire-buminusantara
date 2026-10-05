"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { kabari } from "../toko";
import { TombolKirim } from "../tombol-kirim";
import { Kartu } from "../ruang";
import { aksiSimpanPengguna, type IsianPengguna, type KeadaanPengguna } from "./aksi";

/** Satu formulir untuk tambah dan ubah akun. Galat dikembalikan aksi beserta
 *  isiannya (React mengosongkan isian tak-terkontrol setelah aksi form);
 *  kata sandi sengaja tidak pernah dibawa balik. */
export function FormPengguna({ id, awal, diriSendiri = false }: {
  id: number | null;
  awal?: IsianPengguna;
  diriSendiri?: boolean;
}) {
  const router = useRouter();
  const [keadaan, kirim] = useActionState(async (sebelum: KeadaanPengguna, data: FormData) => {
    const hasil = await aksiSimpanPengguna(id, sebelum, data);
    if (!hasil?.ok) return hasil;
    // Simpan = tetap di akun ini; tambah = buka akun barunya.
    if (id === null) {
      kabari("Pengguna ditambahkan — akunnya langsung bisa dipakai masuk.");
      router.push(`/admin/pengguna/${hasil.id}`);
      // Layout (daftar) tidak ikut dirender saat pindah halaman — segarkan.
      router.refresh();
    } else {
      kabari("Perubahan akun disimpan.");
      router.refresh();
    }
    return null;
  }, null);
  const galat = keadaan && !keadaan.ok ? keadaan : null;
  const nilai = galat?.isian ?? awal ?? { nama: "", email: "", peran: "editor" };
  const baru = id === null;

  return (
    // key: setelah galat, isian dipasang ulang dengan nilai yang dikirim.
    <form action={kirim} key={JSON.stringify(nilai)} className="grid gap-5">
      {galat && <p role="alert" className="cms-galat">{galat.galat}</p>}

      <Kartu judul="Profil" deskripsi="Nama tampil di CMS dan di komentar yang ditulis akun ini.">
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Bidang id="nama" label="Nama">
              <input id="nama" name="nama" required autoFocus={baru} defaultValue={nilai.nama}
                     className="cms-isian w-full" />
            </Bidang>
            <Bidang id="email" label="Email">
              <input id="email" name="email" type="email" required autoComplete="off" defaultValue={nilai.email}
                     className="cms-isian w-full" />
            </Bidang>
          </div>

          <Bidang id="peran" label="Peran"
                  petunjuk={diriSendiri ? "Peran akun sendiri hanya bisa diubah admin lain." : undefined}>
            <select id="peran" name="peran" defaultValue={nilai.peran} disabled={diriSendiri}
                    className="cms-isian w-full">
              <option value="editor">Editor — mencatat kejadian, meninjau komentar</option>
              <option value="admin">Admin — semuanya, termasuk mengelola pengguna</option>
              {!baru && <option value="commenter">Commenter — akses CMS dicabut</option>}
            </select>
            {/* Select nonaktif tidak ikut terkirim. */}
            {diriSendiri && <input type="hidden" name="peran" value={nilai.peran} />}
          </Bidang>
        </div>
      </Kartu>

      <Kartu judul="Kata sandi"
             deskripsi={baru ? "Minimal 8 karakter." : "Kosongkan untuk tetap. Mengganti sandi mengeluarkan sesi lama akun ini."}
             kaki={<>
               <TombolKirim>{baru ? "Tambah pengguna" : "Simpan perubahan"}</TombolKirim>
               <Link href="/admin/pengguna" className="cms-tombol cms-tombol--hantu">Batal</Link>
             </>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Bidang id="sandi" label={baru ? "Kata sandi" : "Sandi baru"} wajib={baru}>
            <input id="sandi" name="sandi" type="password" required={baru} minLength={8}
                   autoComplete="new-password" className="cms-isian w-full" />
          </Bidang>
          <Bidang id="konfirmasi" label="Konfirmasi" wajib={baru}>
            <input id="konfirmasi" name="konfirmasi" type="password" required={baru} minLength={8}
                   autoComplete="new-password" className="cms-isian w-full" />
          </Bidang>
        </div>
      </Kartu>
    </form>
  );
}

function Bidang({ id, label, wajib = true, petunjuk, children }: {
  id: string; label: string; wajib?: boolean; petunjuk?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="cms-label-isian">
        {label}{wajib && <span aria-hidden="true" className="text-[var(--api)]"> *</span>}
      </label>
      {children}
      {petunjuk && <p className="mt-1.5 text-[12px] leading-[1.5] text-[var(--lirih)]">{petunjuk}</p>}
    </div>
  );
}
