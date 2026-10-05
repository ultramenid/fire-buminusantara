"use client";

import { useRef, useState } from "react";
import { Wajib, Bantuan } from "./isian";

/** Satu hasil pencarian tempat dari /api/lokasi. */
export type Lokasi = { id: string; nama: string; lat: number; lng: number };

/** Sebanyak ini per permintaan; gulir ke dasar daftar memuat sebanyak lagi. */
const BAGI = 10;

/** Teks hasil pencarian dengan bagian yang sama dengan ketikan pengguna
 *  ditebalkan — semua kemunculannya, tidak hanya yang pertama. */
function Sorot({ teks, kata }: { teks: string; kata: string }) {
  const k = kata.trim().toLowerCase();
  if (!k) return <>{teks}</>;
  const bagian: React.ReactNode[] = [];
  let pos = 0;
  for (let n = 0; ; n++) {
    const i = teks.toLowerCase().indexOf(k, pos);
    if (i < 0) break;
    bagian.push(teks.slice(pos, i), <strong key={n}>{teks.slice(i, i + k.length)}</strong>);
    pos = i + k.length;
  }
  bagian.push(teks.slice(pos));
  return <>{bagian}</>;
}

/**
 * Pencarian nama tempat, dengan koordinat ikut dari baris yang dipilih.
 *
 * Diangkat dari form kejadian saat form perapian laporan membutuhkannya juga.
 * Seluruh state pencarian — hasil, penanda memuat, nomor permintaan, debounce —
 * dipegang di sini; pemanggilnya cukup tahu dua hal: teks yang tampil, dan apa
 * yang harus terjadi saat sebuah tempat dipilih.
 *
 * Koordinat SELALU ikut dari baris yang sama. Kalau nama diambil dari hasil
 * pencarian tapi koordinatnya diketik sendiri, titik di peta bisa tidak cocok
 * dengan nama lokasinya — dan itu yang menentukan provinsi di peta publik.
 */
export function CariLokasi({
  label,
  nama,
  nilai,
  onUbah,
  onPilih,
  wajib,
  mati,
  bantuan,
  penunjuk = "Ketik nama tempat, mis. Kubu Raya",
  ref,
}: {
  label: string;
  nama: string;
  nilai: string;
  onUbah: (v: string) => void;
  onPilih: (nama: string, lat: number, lng: number) => void;
  wajib?: boolean;
  mati?: boolean;
  bantuan?: React.ReactNode;
  penunjuk?: string;
  ref?: React.Ref<HTMLInputElement>;
}) {
  const [hasil, setHasil] = useState<Lokasi[]>([]);
  const [mencari, setMencari] = useState(false);
  const [memuatLagi, setMemuatLagi] = useState(false);
  const [habis, setHabis] = useState(false);
  // Dulu "tidak ada hasil" dan "pencarian gagal" sama-sama berarti daftar
  // tidak muncul — editor tak tahu harus mengetik lain atau mencoba lagi.
  const [kabar, setKabar] = useState<"" | "kosong" | "gagal">("");

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Nomor permintaan membuang jawaban yang sudah ketinggalan: mengetik cepat
  // melahirkan beberapa permintaan, dan yang datang belakangan belum tentu
  // milik ketikan terakhir.
  const permintaan = useRef(0);

  async function ambil(kata: string, geser: number) {
    const id = ++permintaan.current;
    if (geser === 0) setMencari(true); else setMemuatLagi(true);
    try {
      const r = await fetch(`/api/lokasi?q=${encodeURIComponent(kata)}&offset=${geser}`);
      const baru: Lokasi[] = r.ok ? (await r.json()).hasil ?? [] : [];
      if (id !== permintaan.current) return;
      if (geser === 0) setKabar(!r.ok ? "gagal" : baru.length === 0 ? "kosong" : "");
      setHasil((lama) => (geser === 0 ? baru : [...lama, ...baru]));
      setHabis(baru.length < BAGI);
    } catch {
      if (id === permintaan.current) {
        setHasil(geser === 0 ? [] : (lama) => lama);
        setHabis(true);
        if (geser === 0) setKabar("gagal");
      }
    } finally {
      if (id === permintaan.current) { setMencari(false); setMemuatLagi(false); }
    }
  }

  function cari(kata: string) {
    clearTimeout(timer.current);
    const t = kata.trim();
    setKabar("");
    if (t.length < 2) { setHasil([]); setHabis(false); return; }
    // Ditunda sedikit supaya setiap ketikan tidak menembak database jauh.
    timer.current = setTimeout(() => ambil(t, 0), 300);
  }

  return (
    <div>
      <label htmlFor={nama} className="cms-mata mb-1.5 block">
        {label}{wajib && <Wajib />}
      </label>
      <input
        id={nama} name={nama} ref={ref}
        required={wajib} disabled={mati}
        value={nilai}
        onChange={(e) => { onUbah(e.target.value); cari(e.target.value); }}
        placeholder={penunjuk}
        autoComplete="off"
        className="cms-isian w-full"
      />
      {bantuan && <Bantuan>{bantuan}</Bantuan>}

      <p role="status" className="cms-mata mt-2 empty:hidden">
        {mencari
          ? "Mencari…"
          : kabar === "kosong"
          ? "Tidak ada tempat yang cocok. Coba nama desa, kecamatan, atau kabupaten."
          : kabar === "gagal"
          ? "Pencarian gagal. Ketik ulang untuk mencoba lagi, atau isi koordinat manual."
          : ""}
      </p>

      {hasil.length > 0 && (
        <ul
          onScroll={(e) => {
            const el = e.currentTarget;
            if (!habis && !memuatLagi &&
                el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
              ambil(nilai.trim(), hasil.length);
            }
          }}
          className="mt-2 max-h-56 overflow-y-auto rounded-[var(--jari)] border border-[var(--garis-tegas)]
                     bg-[var(--papan)]"
        >
          {hasil.map((h) => (
            <li key={h.id} className="border-b border-[var(--garis)] last:border-b-0">
              <button
                type="button"
                onClick={() => { onPilih(h.nama, h.lat, h.lng); setHasil([]); }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left
                           text-[13.5px] hover:bg-[var(--rona)]"
              >
                <span className="min-w-0 truncate"><Sorot teks={h.nama} kata={nilai} /></span>
                <span className="cms-angka shrink-0 text-[11.5px] text-[var(--lirih)]">
                  {h.lat.toFixed(3)}, {h.lng.toFixed(3)}
                </span>
              </button>
            </li>
          ))}
          {memuatLagi && <li className="cms-mata px-3 py-2 text-[12px]">Memuat…</li>}
          {!habis && !memuatLagi && (
            <li className="cms-mata px-3 py-2 text-[11.5px] text-[var(--lirih)]">
              Gulir ke bawah untuk memuat lagi
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
