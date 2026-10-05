"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Ikon, kelompokUntuk } from "./menu-admin";
import { adaPerubahan } from "./penjaga";

type Item = { id: string; label: string; ket?: string; kelompok: string; href?: string; jalankan?: () => void };
type HasilCari = { kelompok: string; label: string; ket?: string; href: string }[];

/** Buka palet dari tombol mana pun. */
export const bukaPalet = () => window.dispatchEvent(new Event("cms-palet"));

/**
 * Palet perintah ⌘K: lompat ke bagian, aksi cepat, dan cari kejadian /
 * laporan / komentar / pengguna (GET /admin/cari).
 */
export function Palet({ peran }: { peran: string }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const dialog = useRef<HTMLDialogElement>(null);
  const masukan = useRef<HTMLInputElement>(null);
  const [q, aturQ] = useState("");
  const [hasil, aturHasil] = useState<HasilCari>([]);
  const [pilih, aturPilih] = useState(0);
  // Isinya hanya digambar saat terbuka: label tema bergantung pada peramban,
  // dan dialog tertutup tidak perlu ikut hidrasi.
  const [terbuka, aturTerbuka] = useState(false);

  useEffect(() => {
    const buka = () => {
      if (dialog.current?.open) return;
      aturQ(""); aturHasil([]); aturPilih(0); aturTerbuka(true);
      dialog.current?.showModal();
    };
    const tekan = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); buka(); }
    };
    window.addEventListener("keydown", tekan);
    window.addEventListener("cms-palet", buka);
    return () => { window.removeEventListener("keydown", tekan); window.removeEventListener("cms-palet", buka); };
  }, []);

  // showModal() memindah fokus sebelum isinya tergambar — fokuskan sesudahnya.
  useEffect(() => { if (terbuka) masukan.current?.focus(); }, [terbuka]);

  // Cari di server, diredam; jawaban yang datang terlambat dibuang.
  useEffect(() => {
    const kata = q.trim();
    if (kata.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/admin/cari?q=${encodeURIComponent(kata)}`, { signal: ctrl.signal });
        if (r.ok) aturHasil((await r.json()).hasil);
      } catch {}
    }, 180);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const kata = q.trim().toLowerCase();
  const statis: Item[] = [
    ...kelompokUntuk(peran).flatMap((k) =>
      k.tautan.map((t) => ({ id: t.href, label: t.label, kelompok: "Buka", href: t.href }))),
    { id: "+kejadian", label: "Tambah kejadian", kelompok: "Aksi", href: "/admin/kejadian/baru" },
    ...(peran === "admin" ? [{ id: "+pengguna", label: "Tambah pengguna", kelompok: "Aksi", href: "/admin/pengguna/baru" }] : []),
    { id: "tema", label: resolvedTheme === "dark" ? "Tema terang" : "Tema gelap", kelompok: "Aksi",
      jalankan: () => setTheme(resolvedTheme === "dark" ? "light" : "dark") },
    { id: "situs", label: "Lihat situs", kelompok: "Aksi", jalankan: () => window.open("/", "_blank") },
  ].filter((i) => !kata || i.label.toLowerCase().includes(kata));
  const item: Item[] = [
    ...statis,
    ...(kata.length >= 2 ? hasil : []).map((h) => ({ ...h, id: h.href })),
  ];
  const aktif = Math.min(pilih, item.length - 1);

  const jalankan = (i: Item | undefined) => {
    if (!i) return;
    if (i.href && adaPerubahan()) return;
    dialog.current?.close();
    if (i.href) router.push(i.href);
    else i.jalankan?.();
  };

  let kelompokSebelum = "";
  return (
    <dialog ref={dialog} aria-label="Perintah" data-tanpa-jaga className="cms-palet"
            onClose={() => aturTerbuka(false)}
            onClick={(e) => { if (e.target === dialog.current) dialog.current.close(); }}>
      {terbuka && <>
      <div className="flex items-center gap-2 border-b border-[var(--garis)] px-4">
        <Ikon nama="cari" className="size-4 text-[var(--lirih)]" />
        <input ref={masukan} value={q} placeholder="Cari kejadian, laporan, komentar, atau perintah…"
               aria-label="Cari perintah" role="combobox" aria-expanded aria-controls="palet-daftar"
               aria-activedescendant={item[aktif] ? `palet-${aktif}` : undefined}
               onChange={(e) => { aturQ(e.target.value); aturPilih(0); }}
               onKeyDown={(e) => {
                 if (e.key === "ArrowDown") { e.preventDefault(); aturPilih((aktif + 1) % item.length); }
                 if (e.key === "ArrowUp") { e.preventDefault(); aturPilih((aktif - 1 + item.length) % item.length); }
                 if (e.key === "Enter") { e.preventDefault(); jalankan(item[aktif]); }
               }}
               className="h-12 min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
        <kbd className="cms-kbd">esc</kbd>
      </div>
      <ul id="palet-daftar" role="listbox" className="max-h-[50vh] overflow-y-auto p-1.5">
        {item.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-[var(--lirih)]">Tidak ada yang cocok.</li>}
        {item.map((i, n) => {
          const kepala = i.kelompok !== kelompokSebelum;
          kelompokSebelum = i.kelompok;
          return (
            <li key={i.id} role="presentation">
              {kepala && <p className="cms-mata px-2.5 pt-2 pb-1">{i.kelompok}</p>}
              <div id={`palet-${n}`} role="option" aria-selected={n === aktif}
                   onMouseMove={() => aturPilih(n)} onClick={() => jalankan(i)}
                   className="flex cursor-pointer items-baseline gap-2 rounded-[var(--jari)] px-2.5 py-2 text-[13.5px]">
                <span className="min-w-0 truncate">{i.label}</span>
                {i.ket && <span className="ml-auto max-w-[45%] shrink-0 truncate text-[12px] text-[var(--lirih)]">{i.ket}</span>}
              </div>
            </li>
          );
        })}
      </ul>
      </>}
    </dialog>
  );
}
