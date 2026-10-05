"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Pemuat } from "./pemuat";
import { adaPerubahan } from "./penjaga";
import { Ikon } from "./menu-admin";

type Saring = Record<string, string>;

/* ── Remah roti ────────────────────────────────────────────────────────── */

/** Label segmen URL — samakan dengan menu samping (menu-admin.tsx). */
const LABEL_SEGMEN: Record<string, string> = {
  kejadian: "Kejadian", laporan: "Laporan warga", statistik: "Statistik",
  komentar: "Komentar", reaksi: "Reaksi", suka: "Suka",
  pengguna: "Pengguna", biometrik: "Biometrik",
};

/** Jejak halaman di bilah atas: `Ringkasan / Kejadian / judul halaman ini`.
 *  Judul besar (h1) ada di kepala halaman di bawahnya — di sini halaman ini
 *  cukup teks biasa bertanda aria-current. */
export function Remah({ judul }: { judul: string }) {
  const jalur = usePathname();
  const segmen = jalur.replace(/^\/admin\/?/, "").split("/").filter(Boolean);

  // Hanya leluhur yang dikenal yang jadi tautan; segmen terakhir = halaman ini.
  const leluhur = segmen.slice(0, -1).flatMap((s, i) =>
    LABEL_SEGMEN[s] ? [{ href: `/admin/${segmen.slice(0, i + 1).join("/")}`, label: LABEL_SEGMEN[s] }] : []);
  const remah = segmen.length ? [{ href: "/admin", label: "Ringkasan" }, ...leluhur] : [];

  return (
    <nav aria-label="Remah roti" className="cms-remah -ml-1">
      {remah.map((r) => (
        <Fragment key={r.href}>
          <Link href={r.href} className="max-sm:hidden">{r.label}</Link>
          <span data-pemisah aria-hidden="true" className="max-sm:hidden">/</span>
        </Fragment>
      ))}
      <span aria-current="page">{judul}</span>
    </nav>
  );
}

/* ── Saringan tabel (cookie) ───────────────────────────────────────────── */

/** Pasangan bacaSaring() di saring.ts — nama cookie harus sama. Saringan
 *  hidup di cookie, bukan URL: kembali dari form ke tabel (tautan ←, Esc,
 *  sesudah simpan/hapus) selalu mendarat di saringan, urutan, dan halaman
 *  yang sama tanpa tiap tautan harus menyeret query. */
export function tulisSaring(bagian: string, nilai: Saring) {
  const bersih = Object.fromEntries(Object.entries(nilai).filter(([, v]) => v));
  document.cookie = `cms-saring-${bagian}=${encodeURIComponent(JSON.stringify(bersih))}; path=/admin; max-age=2592000; samesite=lax`;
}

function useSaring(bagian: string, nilai: Saring) {
  const router = useRouter();
  const [sibuk, mulai] = useTransition();
  // Ganti saringan apa pun = kembali ke halaman 1, kecuali halaman itu sendiri yang diganti.
  const atur = (ubah: Saring) => {
    tulisSaring(bagian, { ...nilai, halaman: "", ...ubah });
    mulai(() => router.refresh());
  };
  return [sibuk, atur] as const;
}

/** Tautan dari tempat lain yang membuka tabel dengan saringan tertentu,
 *  mis. "komentar pada kejadian ini". */
export function TautanSaring({ bagian, nilai, className, children }: {
  bagian: string; nilai: Saring; className?: string; children: React.ReactNode;
}) {
  const router = useRouter();
  const tujuan = `/admin/${bagian}`;
  return (
    <a href={tujuan} className={className}
       onClick={(e) => {
         if (e.metaKey || e.ctrlKey || e.shiftKey) return;
         e.preventDefault();
         if (adaPerubahan()) return;
         tulisSaring(bagian, nilai);
         router.push(tujuan);
         router.refresh();
       }}>
      {children}
    </a>
  );
}

/** Bilah alat di atas tabel: cari (diredam), tab status, satu pilihan. */
export function KendaliSaring({
  bagian, nilai, cari, tab, pilih,
}: {
  bagian: string;
  nilai: Saring;
  cari?: string;
  tab?: { kunci: string; bawaan: string; pilihan: { nilai: string; label: string }[] };
  pilih?: { kunci: string; label: string; pilihan: { nilai: string; label: string }[] };
}) {
  const [sibuk, atur] = useSaring(bagian, nilai);
  const [teks, aturTeks] = useState(nilai.cari ?? "");
  const tunda = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(tunda.current), []);

  const ketik = (v: string) => {
    aturTeks(v);
    clearTimeout(tunda.current);
    tunda.current = setTimeout(() => atur({ cari: v.trim() }), 300);
  };

  return (
    <div data-tanpa-jaga className="mb-4 flex flex-wrap items-center gap-2">
      {cari && (
        <div className="relative w-full sm:w-72">
          <Ikon nama="cari" className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[var(--lirih)]" />
          <input type="search" value={teks} onChange={(e) => ketik(e.target.value)} placeholder={cari}
                 aria-label={cari} data-cari
                 onKeyDown={(e) => { if (e.key === "Escape" && teks) { e.stopPropagation(); ketik(""); } }}
                 className="cms-isian h-8 min-h-8 w-full pr-10 pl-8 text-[13px]" />
          <kbd className="cms-kbd absolute top-1/2 right-2 -translate-y-1/2">/</kbd>
        </div>
      )}
      {tab && (
        <div role="tablist" aria-label="Saring menurut status"
             className="flex flex-wrap gap-0.5 rounded-[var(--jari)] border border-[var(--garis-tegas)] bg-[var(--rona)] p-0.5">
          {tab.pilihan.map((p) => {
            const aktif = (nilai[tab.kunci] || tab.bawaan) === p.nilai;
            return (
              <button key={p.nilai} type="button" role="tab" aria-selected={aktif}
                      onClick={() => atur({ [tab.kunci]: p.nilai === tab.bawaan ? "" : p.nilai })}
                      className={`h-[26px] rounded-[4px] px-2.5 text-[12.5px] font-medium transition-[color,background-color,box-shadow] ${
                        aktif ? "bg-[var(--papan)] text-[var(--jelaga)] shadow-[0_0_0_1px_var(--garis-tegas),0_1px_2px_rgb(0_0_0/0.06)]"
                              : "text-[var(--redup)] hover:text-[var(--jelaga)]"
                      }`}>
                {p.label}
              </button>
            );
          })}
        </div>
      )}
      {pilih && (
        <select value={nilai[pilih.kunci] ?? ""} aria-label={pilih.label}
                onChange={(e) => atur({ [pilih.kunci]: e.target.value })}
                className="cms-isian h-8 min-h-8 w-full py-0 text-[13px] sm:w-64">
          <option value="">{pilih.label}</option>
          {pilih.pilihan.map((p) => <option key={p.nilai} value={p.nilai}>{p.label}</option>)}
        </select>
      )}
      {sibuk && <Pemuat />}
    </div>
  );
}

/**
 * Kepala kolom yang bisa diurutkan. Nilai `urut` = "kolom" (naik) atau
 * "-kolom" (turun); server memvalidasinya (urutDari di saring.ts).
 */
export function KepalaUrut({ bagian, nilai, kolom, bawaan, turunDulu = false, className, children }: {
  bagian: string; nilai: Saring; kolom: string;
  /** Urutan tabel bila belum dipilih, mis. "-created_at". */
  bawaan: string;
  /** Kolom tanggal: tekan pertama = terbaru dulu. */
  turunDulu?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [sibuk, atur] = useSaring(bagian, nilai);
  const kini = nilai.urut || bawaan;
  const aktif = kini.replace(/^-/, "") === kolom;
  const turun = kini.startsWith("-");
  const berikut = aktif ? (turun ? kolom : `-${kolom}`) : turunDulu ? `-${kolom}` : kolom;
  return (
    <th aria-sort={aktif ? (turun ? "descending" : "ascending") : undefined} className={className}>
      <button type="button" onClick={() => atur({ urut: berikut === bawaan ? "" : berikut })}
              className={`group/urut -mx-1.5 inline-flex h-7 items-center gap-1 rounded-[4px] px-1.5 hover:bg-[var(--rona)] hover:text-[var(--jelaga)] ${
                aktif ? "text-[var(--jelaga)]" : ""}`}>
        {children}
        <Ikon nama={aktif && !turun ? "atas" : "bawah"}
              className={`size-3 ${aktif ? "" : "opacity-0 group-hover/urut:opacity-50"}`} />
        {sibuk && <Pemuat />}
      </button>
    </th>
  );
}

/** Kaki tabel: rentang + halaman. Dipasang lewat `kaki` di <Tabel>. */
export function PagerDaftar({ bagian, nilai, halaman, total, per }: {
  bagian: string; nilai: Saring; halaman: number; total: number; per: number;
}) {
  const [sibuk, atur] = useSaring(bagian, nilai);
  if (!total) return null;
  const terakhir = Math.max(1, Math.ceil(total / per));
  const dari = (halaman - 1) * per + 1;
  const sampai = Math.min(halaman * per, total);
  const ke = (h: number) => atur({ halaman: h > 1 ? String(h) : "" });

  // 1 … 4 5 6 … 12
  const nomor: (number | "…")[] = [];
  for (let i = 1; i <= terakhir; i++) {
    if (i === 1 || i === terakhir || Math.abs(i - halaman) <= 1) nomor.push(i);
    else if (nomor.at(-1) !== "…") nomor.push("…");
  }

  return (
    <nav aria-label="Halaman tabel" className="flex min-h-11 flex-wrap items-center gap-2 px-4 py-2 text-[12.5px] text-[var(--lirih)]">
      <span>
        <span className="font-medium text-[var(--redup)] tabular-nums">{dari}–{sampai}</span> dari{" "}
        <span className="font-medium text-[var(--redup)] tabular-nums">{total}</span>
      </span>
      {sibuk && <Pemuat />}
      {terakhir > 1 && (
        <span className="ml-auto flex items-center gap-1">
          <button type="button" disabled={halaman <= 1 || sibuk} onClick={() => ke(halaman - 1)} aria-label="Halaman sebelumnya"
                  className="cms-ikon-tombol size-7 disabled:pointer-events-none disabled:opacity-35">
            <Ikon nama="kiri" className="size-3.5" />
          </button>
          {nomor.map((n, i) => n === "…"
            ? <span key={`e${i}`} className="px-1">…</span>
            : <button key={n} type="button" onClick={() => ke(n)} disabled={sibuk} aria-current={n === halaman ? "page" : undefined}
                      className={`hidden h-7 min-w-7 place-items-center rounded-[var(--jari)] px-1.5 tabular-nums sm:grid ${
                        n === halaman ? "bg-[var(--rona-kuat)] font-semibold text-[var(--jelaga)]" : "hover:bg-[var(--rona)] hover:text-[var(--jelaga)]"
                      }`}>{n}</button>)}
          <button type="button" disabled={halaman >= terakhir || sibuk} onClick={() => ke(halaman + 1)} aria-label="Halaman berikutnya"
                  className="cms-ikon-tombol size-7 disabled:pointer-events-none disabled:opacity-35">
            <Ikon nama="kanan" className="size-3.5" />
          </button>
        </span>
      )}
    </nav>
  );
}

/* ── Pintasan ──────────────────────────────────────────────────────────── */

const SEDANG_MENGETIK = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/** `/` ke kotak cari tabel, Esc = tombol ← halaman form/rincian. */
export function Pintasan() {
  const router = useRouter();
  useEffect(() => {
    const tekan = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || SEDANG_MENGETIK(e.target)) return;
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "/") {
        const kotak = document.querySelector<HTMLInputElement>("[data-cari]");
        if (kotak) { e.preventDefault(); kotak.focus(); kotak.select(); }
      } else if (e.key === "Escape") {
        const kembali = document.querySelector<HTMLAnchorElement>("[data-kembali]");
        if (kembali && !adaPerubahan()) router.push(kembali.getAttribute("href")!);
      }
    };
    window.addEventListener("keydown", tekan);
    return () => window.removeEventListener("keydown", tekan);
  }, [router]);
  return null;
}
