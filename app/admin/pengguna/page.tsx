import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { wajibSesi } from "@/lib/sesi";
import { HALAMAN, KopHalaman } from "../kop-halaman";
import { Paginasi } from "../paginasi";

import { users_role } from "@prisma/client";

const PER_HALAMAN = 15;

const tanggalId = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" });

/**
 * Daftar akun yang bisa masuk CMS ini.
 *
 * Tabel `users` dipakai bersama Pasopati — di dalamnya juga ada akun commenter
 * milik situs utama. Yang relevan di meja jaga hanya peran admin dan editor,
 * jadi itulah satu-satunya yang didaftar di sini.
 */
export default async function DaftarPengguna({
  searchParams,
}: {
  searchParams: Promise<{ halaman?: string; page?: string }>;
}) {
  const sesi = await wajibSesi();
  // Mengelola akun adalah urusan admin; editor cukup mengerjakan kejadiannya.
  if (sesi.peran !== "admin") redirect("/admin");

  const params = await searchParams;
  const halaman = Math.max(1, parseInt(params.halaman ?? params.page ?? "1", 10) || 1);

  const where = { role: { in: [users_role.admin, users_role.editor] } };

  const [totalData, daftar] = await Promise.all([
    prisma.users.count({ where }),
    prisma.users.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (halaman - 1) * PER_HALAMAN,
      take: PER_HALAMAN,
      select: {
        id: true, name: true, email: true, role: true,
        password: true, created_at: true,
      },
    }),
  ]);

  const totalHalaman = Math.ceil(totalData / PER_HALAMAN);

  return (
    <div className={HALAMAN}>
      <KopHalaman
        mata="Meja jaga"
        judul="Pengguna"
        catatan="Akun yang bisa mencatat kejadian dan meninjau komentar. Sandinya bcrypt, sama dengan akun Pasopati."
      >
        <Link href="/admin/pengguna/baru" className="cms-tombol cms-tombol--utama">
          Tambah pengguna
        </Link>
      </KopHalaman>

      <p className="cms-angka mb-5 text-right text-[12.5px] text-[var(--lirih)]">
        {totalData} akun
      </p>

      {daftar.length === 0 ? (
        <div className="cms-kosong">
          <p className="cms-judul text-[18px]">Belum ada akun CMS</p>
          <p className="mx-auto mt-2 max-w-[46ch] text-[13.5px] text-[var(--redup)]">
            Tambahkan akun pertama agar rekan redaksi bisa masuk ke meja jaga.
          </p>
          <Link href="/admin/pengguna/baru" className="cms-tombol cms-tombol--utama mt-5">
            Tambah pengguna pertama
          </Link>
        </div>
      ) : (
        <>
          <ul className="grid gap-2">
            {daftar.map((u) => (
              <li key={String(u.id)} className="cms-baris flex items-center gap-4 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {/* Sandi hash tidak pernah ikut ditampilkan — hanya keberadanya. */}
                    <span className="truncate text-[15px] font-semibold">{u.name}</span>
                    <span className={`cms-cap ${u.role === "admin" ? "cms-cap--perhatian" : "cms-cap--diam"}`}>
                      {u.role}
                    </span>
                    {!u.password && <span className="cms-cap cms-cap--diam">Tanpa sandi</span>}
                  </div>
                  <p className="mt-1 truncate text-[12.5px] text-[var(--redup)]">
                    <span className="cms-angka">{u.email}</span>
                    {u.created_at && (
                      <>
                        {" · sejak "}
                        <span className="cms-angka">{tanggalId.format(u.created_at)}</span>
                      </>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <Paginasi
            halaman={halaman}
            totalHalaman={totalHalaman}
            totalData={totalData}
            perHalaman={PER_HALAMAN}
            baseUrl="/admin/pengguna"
          />
        </>
      )}
    </div>
  );
}
