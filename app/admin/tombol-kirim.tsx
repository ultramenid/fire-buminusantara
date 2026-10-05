"use client";

import { useFormStatus } from "react-dom";
import { Pemuat } from "./pemuat";

/**
 * Tombol submit untuk form server-action di halaman server (login, tambah
 * pengguna). Terkunci + pemuat selama kiriman berjalan: bcrypt dan perjalanan
 * pulang-pergi cukup lama untuk memancing tekan dua kali.
 * Harus komponen klien tersendiri — useFormStatus membaca <form> di atasnya.
 */
export function TombolKirim({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending}
            className={`cms-tombol cms-tombol--utama ${className}`}>
      {pending && <Pemuat />}
      {children}
    </button>
  );
}
