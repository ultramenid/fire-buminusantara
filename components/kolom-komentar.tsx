"use client";

import { useEffect, useRef, useState } from "react";
import { usePonsel } from "@/hooks/use-media-query";
import type { gunakanKomentar } from "@/hooks/gunakan-komentar";

type Kendali = ReturnType<typeof gunakanKomentar>;

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

type UlasanProps = {
  daftar: Kendali["daftar"];
  memuat: Kendali["memuat"];
  galat: Kendali["galat"];
  tampilkanBalasan: Kendali["tampilkanBalasan"];
  alihkanBalasan: Kendali["alihkanBalasan"];
  mulaiBalas: Kendali["mulaiBalas"];
  sebutanDari: Kendali["sebutanDari"];
  isiTanpaSebutan: Kendali["isiTanpaSebutan"];
};

/**
 * Blok nama + isi sebuah komentar — satu tempat untuk daftar utama maupun
 * balasan. Isi yang panjang dipangkas empat baris; tombol pembukanya hanya
 * muncul kalau memang ada yang tersembunyi, dibaca dari selisih tinggi gulir
 * elemen yang SUDAH terpangkas (bukan ditebak dari jumlah karakter — 180 huruf
 * bisa jadi dua baris di rel lebar dan lima baris di lembar ponsel).
 */
function TeksKomentar({ nama, sebutan, isi }: { nama: string; sebutan?: string | null; isi: string }) {
  const teksRef = useRef<HTMLParagraphElement>(null);
  const [terbuka, setTerbuka] = useState(false);
  const [adaSisa, setAdaSisa] = useState(false);

  useEffect(() => {
    // Selagi terbuka, patokannya tak ada lagi — mengukur di sini justru
    // menyimpulkan "tidak ada sisa" dan tombol penutupnya ikut hilang.
    if (terbuka) return;
    const n = teksRef.current;
    if (!n) return;
    const ukur = () => setAdaSisa(n.scrollHeight - n.clientHeight > 1);
    ukur();
    // Balasan yang terlipat di-render dengan display:none, jadi pengukuran
    // pertama membaca nol. ResizeObserver menagih ulang begitu kotaknya
    // sungguh berukuran — sekaligus saat layar berputar.
    const pengamat = new ResizeObserver(ukur);
    pengamat.observe(n);
    return () => pengamat.disconnect();
  }, [isi, terbuka]);

  return (
    <>
      <p ref={teksRef} className={`rincian__komen-teks${terbuka ? "" : " rincian__komen-teks--pangkas"}`}>
        {/* Spasi eksplisit antar span: JSX menghilangkan jeda baris di
            antara elemen, dan CSS sengaja tanpa margin — tanpa ini nama
            dan teksnya menempel. */}
        <span className="rincian__komen-nama">{nama}</span>
        {sebutan && <> <span className="rincian__sebutan">{sebutan}</span></>}{" "}
        {isi}
      </p>

      {adaSisa && (
        <button
          type="button"
          className="rincian__selengkapnya cursor-pointer"
          aria-expanded={terbuka}
          onClick={() => setTerbuka((t) => !t)}
        >
          {terbuka ? "Lebih sedikit" : "Selengkapnya"}
        </button>
      )}
    </>
  );
}

/** Daftar komentar pada pop-up rincian — padanan markup kolom komentar di
 *  beranda.blade.php proyek Pasopati (x-for → .map). */
export function UlasanKomentar({
  daftar, memuat,
  tampilkanBalasan, alihkanBalasan, mulaiBalas,
  sebutanDari, isiTanpaSebutan,
}: UlasanProps) {
  return (
    <section aria-label="Komentar laporan">
      <p className="rincian__kosong" hidden={memuat || daftar.length > 0}>
        Belum ada komentar. Jadi yang pertama.
      </p>

      <ul className="rincian__utas">
        {daftar.map((k) => (
          <li key={k.id} className="rincian__komen">
            <span className="rincian__inisial" aria-hidden="true">
              {k.nama ? k.nama.charAt(0).toUpperCase() : "?"}
            </span>

            <div className="rincian__komen-isi">
              <TeksKomentar nama={k.nama} isi={k.isi} />

              <p className="rincian__komen-kaki">
                <span>{k.waktu}</span>
                <button type="button" className="rincian__balas cursor-pointer" onClick={() => mulaiBalas(k)}>
                  Balas
                </button>
              </p>

              {k.balasan && k.balasan.length > 0 && (
                <>
                  {/* Garis pendek sebelum labelnya menandai cabang yang sedang
                      dilipat, seperti pada rujukan. */}
                  <button
                    type="button"
                    className="rincian__lihat cursor-pointer"
                    aria-expanded={tampilkanBalasan(k.id)}
                    onClick={() => alihkanBalasan(k.id)}
                  >
                    <span className="rincian__lihat-garis" aria-hidden="true" />
                    {tampilkanBalasan(k.id)
                      ? "Sembunyikan balasan"
                      : `Lihat ${k.balasan.length} balasan`}
                  </button>

                  {tampilkanBalasan(k.id) && (
                    <ul className="rincian__utas rincian__utas--balasan">
                      {k.balasan.map((b) => (
                        <li key={b.id} className="rincian__komen rincian__komen--balasan">
                          <span className="rincian__inisial rincian__inisial--kecil" aria-hidden="true">
                            {b.nama ? b.nama.charAt(0).toUpperCase() : "?"}
                          </span>

                          <div className="rincian__komen-isi">
                            <TeksKomentar
                              nama={b.nama}
                              sebutan={sebutanDari(b)}
                              isi={isiTanpaSebutan(b)}
                            />

                            <p className="rincian__komen-kaki">
                              <span>{b.waktu}</span>
                              <button type="button" className="rincian__balas cursor-pointer" onClick={() => mulaiBalas(b)}>
                                Balas
                              </button>
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

type FormProps = {
  mengirim: Kendali["mengirim"];
  galat: Kendali["galat"];
  nama: Kendali["nama"];
  setNama: Kendali["setNama"];
  email: Kendali["email"];
  setEmail: Kendali["setEmail"];
  anonim: Kendali["anonim"];
  setAnonim: Kendali["setAnonim"];
  isi: Kendali["isi"];
  setIsi: Kendali["setIsi"];
  website: Kendali["website"];
  setWebsite: Kendali["setWebsite"];
  balasKe: Kendali["balasKe"];
  balasNama: Kendali["balasNama"];
  batalBalas: Kendali["batalBalas"];
  kirim: Kendali["kirim"];
  ketikRef: Kendali["ketikRef"];
  captchaRef: Kendali["captchaRef"];
  /** true = selalu inline ringkas (tanpa baris pemicu + sheet), untuk
   *  dipasang di dalam lembar bawah lain yang ruangnya sudah sempit. */
  tanpaSheet?: boolean;
  tutup?: () => void;
};

/** Kolom kirim, dipatok di dasar rel. Cukup isi nama dan email, tidak perlu
 *  login — sama seperti pada proyek Pasopati.
 *
 *  Di ponsel (≤ 860px — breakpoint yang sama dengan CSS pop-up) formulir
 *  lengkap tidak muat menempel di dasar rel: yang tampil hanya baris pemicu
 *  "Tambahkan komentar…", dan menekannya membuka sheet berisi seluruh isian
 *  (teks, nama, email, anonim, captcha). Di desktop semuanya inline seperti
 *  semula. */
export function FormulirKomentar({
  mengirim, galat, nama, setNama, email, setEmail, anonim, setAnonim, isi, setIsi,
  website, setWebsite, balasKe, balasNama, batalBalas,
  kirim, ketikRef, captchaRef,
  tanpaSheet = false,
  tutup,
}: FormProps) {
  const belumLengkap = mengirim || !isi.trim() || (!anonim && (!nama.trim() || !email.trim()));

  const ponsel = usePonsel();
  const [sheetBukaManual, setSheetBukaManual] = useState(false);
  // Sheet terbuka jika dibuka manual atau saat membalas komentar di ponsel
  const sheet = sheetBukaManual || (ponsel && balasKe !== null);

  const tutupSheet = () => {
    setSheetBukaManual(false);
    if (balasKe !== null) batalBalas();
    if (tutup) tutup();
  };

  const tanganiKirim = async () => {
    if (!belumLengkap && !mengirim) {
      await kirim();
      setSheetBukaManual(false);
    }
  };

  // Fokus ke kotak ketik begitu sheet terbuka.
  useEffect(() => {
    if (ponsel && sheet) ketikRef.current?.focus();
  }, [ponsel, sheet, ketikRef]);

  // Isian yang sama untuk versi inline dan versi sheet — satu sumber markup.
  const bidang = (
    <>
      {/* Umpan jebakan (honeypot): hanya bot yang mengisinya. */}
      <div className="rincian__jebakan" aria-hidden="true">
        <label>
          Website
          <input type="text" tabIndex={-1} autoComplete="off" value={website}
                 onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      {balasKe !== null && (
        <p className="rincian__membalas">
          <span>
            Membalas <strong className="rincian__balas">{balasNama}</strong>
          </span>
          <button type="button" className="rincian__batal cursor-pointer" onClick={batalBalas}>
            Batal
          </button>
        </p>
      )}

      {SITE_KEY && <div className="rincian__captcha empty:hidden" ref={captchaRef} />}

      <div className="rincian__identitas">
        <label className="sr-only" htmlFor="komentar-nama">Nama</label>
        <input
          id="komentar-nama"
          className="rincian__input"
          type="text"
          maxLength={100}
          placeholder="Nama"
          required={!anonim}
          disabled={anonim}
          value={nama}
          onChange={(e) => setNama(e.target.value)}
        />
        <label className="sr-only" htmlFor="komentar-email">Email</label>
        <input
          id="komentar-email"
          className="rincian__input"
          type="email"
          maxLength={100}
          placeholder="Email"
          required={!anonim}
          disabled={anonim}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
    </>
  );

  const barisKetik = (
    <div className="rincian__baris">
      <span className="rincian__inisial rincian__inisial--kecil" aria-hidden="true">
        {anonim ? "A" : nama ? nama.charAt(0).toUpperCase() : "?"}
      </span>

      <label className="rincian__ketik-bungkus">
        <span className="sr-only">Komentar</span>
        <textarea
          ref={ketikRef}
          className="rincian__ketik"
          rows={sheet ? 3 : 1}
          maxLength={2000}
          placeholder="Tambahkan komentar…"
          value={isi}
          onChange={(e) => setIsi(e.target.value)}
          onKeyDown={(e) => {
            // Shift+Enter diperbolehkan membuat baris baru di sheet.
            if (e.key === "Enter" && (!sheet || !e.shiftKey)) {
              e.preventDefault();
              tanganiKirim();
            }
          }}
        />
      </label>
    </div>
  );

  /* Anonim dan Kirim sebaris di kaki formulir: pilihan identitas di kiri,
     keputusan mengirim di kanan. Dulu Kirim menempel di ujung kotak ketik dan
     anonim terdampar sendirian di barisnya — dua keputusan akhir yang
     terpencar di dua baris. Kotak ketik kini mendapat lebar penuh. */
  const barisAksi = (
    <div className="rincian__aksi-kirim">
      {/* Pilihan anonim, sama polanya dengan form laporan: isian identitas
          dimatikan dan kiriman tampil sebagai "Anonim". */}
      <label className="rincian__anonim cursor-pointer">
        <input
          type="checkbox"
          className="cursor-pointer"
          checked={anonim}
          onChange={(e) => setAnonim(e.target.checked)}
        />
        Kirim sebagai anonim
      </label>

      {tutup && (
        <button
          type="button"
          className="rincian__batal cursor-pointer"
          onClick={tutup}
        >
          Batal
        </button>
      )}

      <button
        type="submit"
        className="rincian__tombol-kirim cursor-pointer disabled:cursor-not-allowed"
        disabled={belumLengkap}
      >
        {mengirim ? "Mengirim…" : "Kirim"}
      </button>
    </div>
  );

  // ── Desktop (dan mode tanpaSheet): formulir lengkap inline di dasar rel,
  //  seperti sebelumnya. ──
  if (!ponsel || tanpaSheet) {
    return (
      <form
        className="rincian__kirim"
        onSubmit={(e) => {
          e.preventDefault();
          tanganiKirim();
        }}
      >
        {bidang}
        {barisKetik}
        {barisAksi}
      </form>
    );
  }

  // ── Ponsel: baris pemicu + sheet formulir. ──
  return (
    <>
      {!sheet && (
        <button
          type="button"
          className="rincian__kirim rincian__pemicu cursor-pointer"
          onClick={() => setSheetBukaManual(true)}
        >
          <span className="rincian__inisial rincian__inisial--kecil" aria-hidden="true">
            {anonim ? "A" : nama ? nama.charAt(0).toUpperCase() : "?"}
          </span>
          <span className="rincian__pemicu-teks">
            {balasKe !== null ? `Membalas ${balasNama}…` : "Tambahkan komentar…"}
          </span>
        </button>
      )}

      {sheet && (
        <div
          className="rincian__sheet cursor-pointer"
          role="dialog"
          aria-modal="true"
          aria-label="Tulis komentar"
          onClick={(e) => { if (e.target === e.currentTarget) tutupSheet(); }}
        >
          <form
            className="rincian__sheet-panel cursor-default"
            onSubmit={(e) => {
              e.preventDefault();
              tanganiKirim();
            }}
          >
            <div className="rincian__sheet-kepala">
              <p className="rincian__sheet-judul">Tulis komentar</p>
              <button
                type="button"
                className="rincian__sheet-tutup cursor-pointer"
                aria-label="Tutup formulir komentar"
                onClick={tutupSheet}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            {galat && <p className="rincian__galat" role="alert">{galat}</p>}

            {bidang}
            {barisKetik}
            {barisAksi}
          </form>
        </div>
      )}
    </>
  );
}