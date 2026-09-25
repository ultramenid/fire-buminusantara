import bcrypt from "bcryptjs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { wajibSesi } from "@/lib/sesi";
import { HALAMAN, KopHalaman } from "../../kop-halaman";

/** Pesan galat per kode di ?galat= — dibaca editor, bukan stack trace. */
const PESAN_GALAT: Record<string, string> = {
  isi: "Nama, email, peran, dan kata sandi wajib diisi.",
  email: "Email itu sudah dipakai akun lain.",
  "sandi-pendek": "Kata sandi minimal 8 karakter.",
  "sandi-cocok": "Konfirmasi kata sandi tidak cocok.",
};

export default async function TambahPengguna({
  searchParams,
}: {
  searchParams: Promise<{ galat?: string }>;
}) {
  const sesi = await wajibSesi();
  if (sesi.peran !== "admin") redirect("/admin");

  const { galat } = await searchParams;

  async function kirim(data: FormData) {
    "use server";
    const s = await wajibSesi();
    if (s.peran !== "admin") redirect("/admin");

    const nama = String(data.get("nama") ?? "").trim();
    const email = String(data.get("email") ?? "").trim().toLowerCase();
    const peran = String(data.get("peran") ?? "");
    const sandi = String(data.get("sandi") ?? "");
    const konfirmasi = String(data.get("konfirmasi") ?? "");

    const kembali = (kode: string) =>
      redirect(`/admin/pengguna/baru?galat=${encodeURIComponent(kode)}`);

    if (!nama || !email || !sandi || !["admin", "editor"].includes(peran)) kembali("isi");
    if (sandi.length < 8) kembali("sandi-pendek");
    if (sandi !== konfirmasi) kembali("sandi-cocok");

    // Hash bcryptjs langsung terbaca oleh pengecek bcrypt Laravel, jadi akun
    // yang dibuat di sini bisa dipakai masuk ke situs utama juga.
    const hash = await bcrypt.hash(sandi, 10);
    const kini = new Date();

    try {
      // Langsung dianggap terverifikasi: akunnya dibuat oleh admin, bukan
      // mendaftar sendiri lewat email.
      await prisma.users.create({
        data: {
          name: nama,
          email,
          role: peran as "admin" | "editor",
          password: hash,
          email_verified_at: kini,
          created_at: kini,
          updated_at: kini,
        },
        select: { id: true },
      });
    } catch (e) {
      // Email unik di basis data — benturan bentuknya P2002.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        kembali("email");
      }
      throw e;
    }

    redirect("/admin/pengguna");
  }

  return (
    <div className={HALAMAN}>
      <Link href="/admin/pengguna"
            className="cms-mata mb-4 inline-block underline-offset-4 hover:underline">
        ← Pengguna
      </Link>

      <KopHalaman
        mata="Catatan baru"
        judul="Tambah pengguna"
        catatan="Akun yang dibuat di sini langsung bisa dipakai masuk ke meja jaga."
      />

      {galat && PESAN_GALAT[galat] && (
        <p role="alert" className="cms-galat mb-6">
          <span aria-hidden="true" className="cms-angka font-medium">!</span>
          {PESAN_GALAT[galat]}
        </p>
      )}

      <form action={kirim} className="max-w-[520px]">
        <div className="grid gap-5">
          <div>
            <label htmlFor="nama" className="cms-mata mb-1.5 block">
              Nama<span className="text-[var(--api)]"> *</span>
            </label>
            <input id="nama" name="nama" type="text" required autoFocus
                   className="cms-isian w-full" />
          </div>

          <div>
            <label htmlFor="email" className="cms-mata mb-1.5 block">
              Email<span className="text-[var(--api)]"> *</span>
            </label>
            <input id="email" name="email" type="email" required autoComplete="off"
                   className="cms-isian cms-angka w-full" />
          </div>

          <div>
            <label htmlFor="peran" className="cms-mata mb-1.5 block">
              Peran<span className="text-[var(--api)]"> *</span>
            </label>
            <select id="peran" name="peran" defaultValue="editor"
                    className="cms-isian w-full">
              <option value="editor">Editor — mencatat kejadian, meninjau komentar</option>
              <option value="admin">Admin — semuanya, termasuk mengelola pengguna</option>
            </select>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="sandi" className="cms-mata mb-1.5 block">
                Kata sandi<span className="text-[var(--api)]"> *</span>
              </label>
              <input id="sandi" name="sandi" type="password" required minLength={8}
                     autoComplete="new-password" className="cms-isian w-full" />
              <p className="mt-1.5 text-[12px] leading-[1.5] text-[var(--lirih)]">
                Minimal 8 karakter.
              </p>
            </div>

            <div>
              <label htmlFor="konfirmasi" className="cms-mata mb-1.5 block">
                Konfirmasi<span className="text-[var(--api)]"> *</span>
              </label>
              <input id="konfirmasi" name="konfirmasi" type="password" required
                     minLength={8} autoComplete="new-password"
                     className="cms-isian w-full" />
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-3">
          <button type="submit" className="cms-tombol cms-tombol--utama">
            Tambah pengguna
          </button>
          <Link href="/admin/pengguna"
                className="cms-mata px-1 underline-offset-4 hover:underline">
            Batal
          </Link>
        </div>
      </form>
    </div>
  );
}
