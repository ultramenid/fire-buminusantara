"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { hapusPasskey, masukPasskey, opsiDaftarPasskey, opsiMasukPasskey, simpanPasskey } from "./aksi-passkey";
import { TombolKonfirmasi } from "./tombol-konfirmasi";
import { Pemuat } from "./pemuat";
import { kabari } from "./toko";
import { useMounted } from "@/hooks/use-mounted";

import { Ikon } from "./menu-admin";

/** Dialog perangkat yang dibatalkan/ditutup melempar NotAllowedError — itu
 *  pilihan pengguna, bukan galat yang perlu diumumkan. */
const dibatalkan = (e: unknown) => (e as { name?: string } | null)?.name === "NotAllowedError";

/** Tombol "Masuk dengan sidik jari / wajah" di halaman masuk. Tidak dirender
 *  di peramban tanpa WebAuthn. */
export function TombolMasukPasskey() {
  const terpasang = useMounted();
  const [galat, aturGalat] = useState("");
  const [sibuk, mulai] = useTransition();
  const router = useRouter();

  // Dibaca setelah hidrasi: server tidak tahu peramban mendukung WebAuthn.
  if (!terpasang || !browserSupportsWebAuthn()) return null;

  const masuk = () => mulai(async () => {
    aturGalat("");
    try {
      const opsi = await opsiMasukPasskey();
      if (!opsi.ok) return aturGalat(opsi.galat);
      const hasil = await masukPasskey(await startAuthentication({ optionsJSON: opsi.opsi }));
      if (!hasil.ok) return aturGalat(hasil.galat);
      router.push("/admin/kejadian");
    } catch (e) {
      if (!dibatalkan(e)) aturGalat("Verifikasi perangkat gagal. Coba lagi atau masuk dengan sandi.");
    }
  });

  return (
    <>
      <div className="my-5 flex items-center gap-3 text-[12px] text-[var(--lirih)]">
        <span className="h-px flex-1 bg-[var(--garis)]" />atau<span className="h-px flex-1 bg-[var(--garis)]" />
      </div>
      {galat && <p role="alert" className="cms-galat mb-3">{galat}</p>}
      <button type="button" onClick={masuk} disabled={sibuk} aria-busy={sibuk} className="cms-tombol w-full justify-center">
        {sibuk ? <Pemuat /> : <Ikon nama="kunci" className="size-3.5" />}
        Masuk dengan sidik jari / wajah
      </button>
    </>
  );
}

/** Daftarkan perangkat ini (atau ponsel lewat QR) sebagai passkey akun. */
export function TombolTambahPasskey() {
  const [sibuk, mulai] = useTransition();
  const router = useRouter();

  const tambah = () => mulai(async () => {
    try {
      const opsi = await opsiDaftarPasskey();
      if (!opsi.ok) return kabari(opsi.galat, "galat");
      const hasil = await simpanPasskey(await startRegistration({ optionsJSON: opsi.opsi }));
      if (!hasil.ok) return kabari(hasil.galat, "galat");
      kabari("Passkey terdaftar.");
      router.refresh();
    } catch (e) {
      if (!dibatalkan(e)) kabari("Perangkat ini tidak bisa didaftarkan.", "galat");
    }
  });

  return (
    <button type="button" onClick={tambah} disabled={sibuk} aria-busy={sibuk} className="cms-tombol cms-tombol--utama">
      {sibuk ? <Pemuat /> : <Ikon nama="kunci" className="size-3.5" />}
      Tambah passkey
    </button>
  );
}

export function TombolHapusPasskey({ id }: { id: string }) {
  const [sibuk, mulai] = useTransition();
  const router = useRouter();

  return (
    <TombolKonfirmasi
      label="Cabut"
      labelKonfirmasi="Ya, cabut"
      className="cms-tombol cms-tombol--bahaya cms-tombol--kecil"
      classNameKonfirmasi="cms-tombol cms-tombol--bahaya-isi cms-tombol--kecil"
      sibuk={sibuk}
      onKonfirmasi={() => mulai(async () => {
        const hasil = await hapusPasskey(id);
        if (!hasil.ok) return kabari(hasil.galat, "galat");
        kabari("Passkey dicabut.");
        router.refresh();
      })}
    />
  );
}
