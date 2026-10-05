import Link from "next/link";
import { users_role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { wajibSesi } from "@/lib/sesi";
import { bacaSaring, halamanDari, urutDari } from "../saring";
import { KopPanel, LEBAR, Tabel, TombolTambah } from "../ruang";
import { KendaliSaring, KepalaUrut, PagerDaftar } from "../ruang-klien";
import { Ikon } from "../menu-admin";

const PER = 20;
const BAWAAN = "name";
const tanggal = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" });

/**
 * Akun yang bisa masuk CMS. Tabel `users` dipakai bersama Pasopati — akun
 * commenter situs utama tidak didaftar di sini.
 */
export default async function DaftarPengguna() {
  // Mengelola akun adalah urusan admin; editor cukup mengerjakan kejadiannya.
  const sesi = await wajibSesi("admin");
  const saring = await bacaSaring("pengguna");
  const cari = saring.cari?.trim();
  const peran = saring.peran === "admin" || saring.peran === "editor" ? [saring.peran as users_role] : [users_role.admin, users_role.editor];
  const urut = urutDari(saring, ["name", "email", "role", "created_at"] as const, BAWAAN);
  const where = {
    role: { in: peran },
    ...(cari ? { OR: [{ name: { contains: cari } }, { email: { contains: cari } }] } : {}),
  };

  const total = await prisma.users.count({ where });
  const halaman = halamanDari(saring, total, PER);
  const daftar = await prisma.users.findMany({
    where, orderBy: [{ [urut.kolom]: urut.arah }, { id: "asc" }], skip: (halaman - 1) * PER, take: PER,
    select: { id: true, name: true, email: true, role: true, password: true, created_at: true },
  });
  const k = { bagian: "pengguna", nilai: saring, bawaan: BAWAAN };

  return (
    <>
      <KopPanel lebar mata="Pengaturan" judul="Pengguna"
                deskripsi="Akun yang bisa masuk CMS. Editor mencatat kejadian dan meninjau komentar; admin juga mengelola pengguna.">
        <TombolTambah href="/admin/pengguna/baru" label="Tambah pengguna" />
      </KopPanel>
      <div className={LEBAR}>
        <KendaliSaring bagian="pengguna" nilai={saring} cari="Cari nama atau email…"
                       tab={{ kunci: "peran", bawaan: "", pilihan: [
                         { nilai: "", label: "Semua" }, { nilai: "admin", label: "Admin" }, { nilai: "editor", label: "Editor" },
                       ] }} />
        <Tabel
          kepala={<>
            <KepalaUrut {...k} kolom="name">Nama</KepalaUrut>
            <KepalaUrut {...k} kolom="email" className="hidden md:table-cell">Email</KepalaUrut>
            <KepalaUrut {...k} kolom="role">Peran</KepalaUrut>
            <KepalaUrut {...k} kolom="created_at" turunDulu className="hidden sm:table-cell">Sejak</KepalaUrut>
            <th className="cms-sel-aksi"><span className="sr-only">Aksi</span></th>
          </>}
          kosong={daftar.length === 0 && (cari ? "Tidak ada akun yang cocok." : "Belum ada akun CMS.")}
          kaki={<PagerDaftar bagian="pengguna" nilai={saring} halaman={halaman} total={total} per={PER} />}
        >
          {daftar.map((u) => (
            <tr key={String(u.id)}>
              <td>
                <span className="flex items-center gap-2.5">
                  <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--rona-kuat)] text-[11.5px] font-semibold">
                    {u.name.slice(0, 1).toUpperCase()}
                  </span>
                  <Link href={`/admin/pengguna/${u.id}`} className="font-medium hover:underline">{u.name}</Link>
                  {Number(u.id) === sesi.id && <span className="cms-cap">Anda</span>}
                  {!u.password && <span className="cms-cap cms-cap--diam">Tanpa sandi</span>}
                </span>
              </td>
              <td className="cms-angka hidden text-[var(--redup)] md:table-cell">{u.email}</td>
              <td>
                <span className={`cms-cap capitalize ${u.role === "admin" ? "bg-[color-mix(in_srgb,var(--limau)_14%,transparent)] text-[var(--limau)]" : ""}`}>
                  {u.role}
                </span>
              </td>
              <td className="hidden whitespace-nowrap text-[var(--redup)] tabular-nums sm:table-cell">{u.created_at ? tanggal.format(u.created_at) : "—"}</td>
              <td className="cms-sel-aksi">
                <Link href={`/admin/pengguna/${u.id}`} aria-label={`Ubah ${u.name}`} title="Ubah"
                      className="cms-ikon-tombol size-7"><Ikon nama="kanan" className="size-3.5" /></Link>
              </td>
            </tr>
          ))}
        </Tabel>
      </div>
    </>
  );
}
