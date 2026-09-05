"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BATAS_BERKAS, BATAS_TOTAL_BYTE } from "@/lib/batas-laporan";
import { TEKS_LAPOR, type Bahasa } from "@/lib/bahasa";
import { BilahUnggah } from "@/components/bilah-unggah";
import { kirimLaporan, type KeadaanLapor } from "./aksi";

/** Site key Turnstile. Tanpa ini (pengembangan) widget tidak dirender dan
 *  verifikasi di server pun dilewati — sama seperti kolom komentar. */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

/**
 * Jenis berkas ditulis satu per satu, BUKAN "image/*,video/*".
 *
 * Dengan daftar eksplisit, iOS mengubah foto HEIC-nya jadi JPEG saat dipilih —
 * lengkap dengan EXIF-nya — sehingga berkasnya lolos pemeriksaan MIME di
 * simpanBerkas() dan tetap bisa dibuka petugas. Dengan "image/*" ia mengirim
 * HEIC apa adanya, dan laporan dari iPhone selalu ditolak.
 */
const DITERIMA = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm";

type TurnstileInstance = {
  render: (wadah: HTMLElement, opsi: Record<string, unknown>) => number;
  reset: (id: number) => void;
  remove: (id: number | null) => void;
};

function turnstile(): TurnstileInstance | null {
  return (window as Window & { turnstile?: TurnstileInstance }).turnstile ?? null;
}

function ukuranTeks(byte: number): string {
  if (byte >= 1024 * 1024) return `${(byte / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(byte / 1024))} KB`;
}

/** Dua berkas dianggap sama kalau nama, ukuran, dan waktu ubahnya sama —
 *  cukup untuk mencegah kiriman ganda saat pemilih berkas dibuka dua kali. */
function kunciBerkas(b: File): string {
  return `${b.name}|${b.size}|${b.lastModified}`;
}

export function FormLaporan({ bahasa }: { bahasa: Bahasa }) {
  const teks = TEKS_LAPOR[bahasa];

  /**
   * Semua isian TERKENDALI oleh React, bukan dibiarkan uncontrolled.
   *
   * React mengosongkan <form> setiap kali sebuah form action selesai — juga
   * ketika aksinya gagal. Dengan isian uncontrolled, satu galat koordinat
   * membuang seluruh cerita yang baru saja diketik pelapor, dan orang yang
   * kehilangan tulisannya sekali biasanya tidak mengetik ulang. Nilai yang
   * dipegang state selamat dari pengosongan itu.
   */
  const [judul, setJudul] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [nama, setNama] = useState("");
  const [berkas, setBerkas] = useState<File[]>([]);
  const [anonim, setAnonim] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [galatKlien, setGalatKlien] = useState("");
  const [mencariLokasi, setMencariLokasi] = useState(false);
  /** Dari mana lat/lng terisi terakhir: "foto" = GPS foto (caption kecil),
   *  null = ketikan/geolokasi (tanpa caption). */
  const [sumberLokasi, setSumberLokasi] = useState<"foto" | null>(null);
  /** Pratinjau per berkas: key = kunciBerkas(b), nilai = URL objek lokal. */
  const [pratinjau, setPratinjau] = useState<Record<string, string>>({});

  const berkasRef = useRef<HTMLInputElement | null>(null);
  const captchaRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<number | null>(null);
  const sedangKirimRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  /* Pengunjung menekan Kirim sebelum token Turnstile datang. Bukan galat —
     cuma perlu ditunggu, lalu kirimannya dilanjutkan sendiri. */
  const [menungguToken, setMenungguToken] = useState(false);
  /* Penunggu token, bukan useEffect: efek yang memanggil setState lalu
     requestSubmit() menimbulkan render beruntun, dan hook-nya harus duduk di
     atas semua return bersyarat di komponen ini. Janji sederhana yang
     diselesaikan callback Turnstile jauh lebih tenang. */
  const penungguToken = useRef<((tiba: boolean) => void)[]>([]);
  const lokasiAktifRef = useRef(true);
  // Nilai lat/lng terkini untuk pengecekan di dalam callback async (isi GPS
  // foto): state yang dibaca langsung bisa basi setelah await. Diselaraskan
  // di efek (bukan saat render) agar tidak melanggar aturan refs React.
  const latRef = useRef(lat);
  const lngRef = useRef(lng);
  useEffect(() => {
    latRef.current = lat;
    lngRef.current = lng;
  });
  // Semua URL objek yang pernah dibuat, dilepas saat komponen diturunkan
  // atau saat laporan sukses terkirim.
  const urlRef = useRef<string[]>([]);

  useEffect(() => {
    lokasiAktifRef.current = true;
    return () => {
      lokasiAktifRef.current = false;
      for (const url of urlRef.current) URL.revokeObjectURL(url);
      urlRef.current = [];
    };
  }, []);

  const ulangCaptcha = useCallback(() => {
    setCaptchaToken("");
    const ts = turnstile();
    if (ts && widgetRef.current !== null) {
      try {
        ts.reset(widgetRef.current);
      } catch {
        /* widget sudah lepas */
      }
    }
  }, []);

  const [keadaan, aksi, mengirim] = useActionState<KeadaanLapor, FormData>(
    async (sebelumnya: KeadaanLapor, data: FormData) => {
      try {
        const hasil = await kirimLaporan(sebelumnya, data);
        if (hasil?.ok) {
          for (const url of urlRef.current) URL.revokeObjectURL(url);
          urlRef.current = [];
          setPratinjau({});
          setBerkas([]);
        } else {
          ulangCaptcha();
        }
        return hasil;
      } finally {
        sedangKirimRef.current = false;
      }
    },
    null
  );

  const berhasil = keadaan?.ok === true;
  const totalByte = berkas.reduce((n, b) => n + b.size, 0);

  const sinkronkanKeInput = useCallback((daftar: File[]) => {
    const input = berkasRef.current;
    if (!input) return;
    try {
      if (typeof DataTransfer !== "undefined") {
        const dt = new DataTransfer();
        for (const b of daftar) dt.items.add(b);
        input.files = dt.files;
      }
    } catch {
      /* peramban tanpa dukungan DataTransfer */
    }
  }, []);

  /**
   * Sinkronisasi berkas React state ke input DOM native.
   */
  useEffect(() => {
    sinkronkanKeInput(berkas);
  }, [berkas, keadaan, sinkronkanKeInput]);


  // Widget dipasang sekali, mode explicit — sama seperti kolom komentar:
  // kotak captcha tidak ditampilkan kecuali Cloudflare memang menantang.
  useEffect(() => {
    if (!SITE_KEY) return;
    let hidup = true;

    const pasang = () => {
      const wadah = captchaRef.current;
      const ts = turnstile();
      if (!wadah || !hidup) return;
      if (!ts) {
        window.setTimeout(pasang, 100);
        return;
      }
      try {
        ts.remove(widgetRef.current);
      } catch {
        /* belum ada widget */
      }
      wadah.innerHTML = "";

      widgetRef.current = ts.render(wadah, {
        sitekey: SITE_KEY,
        appearance: "interaction-only",
        callback: (token: string) => {
          setCaptchaToken(token);
          // Bangunkan kiriman yang tertahan menunggu token ini.
          penungguToken.current.splice(0).forEach((bangun) => bangun(true));
        },
        "expired-callback": () => {
          setCaptchaToken("");
          if (widgetRef.current !== null) {
            try {
              ts.reset(widgetRef.current);
            } catch {
              /* widget sudah lepas */
            }
          }
        },
        "error-callback": () => {
          setCaptchaToken("");
          if (widgetRef.current !== null) {
            try {
              ts.reset(widgetRef.current);
            } catch {
              /* widget sudah lepas */
            }
          }
        },
      });
    };

    pasang();
    return () => {
      hidup = false;
      // Bongkar widgetnya saat komponen dilepas (termasuk remount ganda
      // StrictMode di dev), supaya tidak ada widget yatim dan pemasangan
      // berikutnya mulai dari wadah bersih.
      const ts = turnstile();
      if (ts && widgetRef.current !== null) {
        try {
          ts.remove(widgetRef.current);
        } catch {
          /* sudah lepas bersama pop-up yang ditutup */
        }
        widgetRef.current = null;
      }
    };
  }, []);


  function tambahBerkas(dipilih: FileList | null) {
    if (!dipilih || dipilih.length === 0) return;
    setGalatKlien("");

    const sudah = new Set(berkas.map(kunciBerkas));
    const gabungan = [...berkas];
    const kunciBaru: string[] = [];
    for (const b of dipilih) {
      const kunci = kunciBerkas(b);
      if (!sudah.has(kunci)) {
        sudah.add(kunci);
        gabungan.push(b);
        kunciBaru.push(kunci);
      }
    }

    if (gabungan.length > BATAS_BERKAS) {
      setGalatKlien(teks.terlaluBanyak.replace("{n}", String(BATAS_BERKAS)));
      return;
    }
    // Atap ukuran dicek di sini, bukan dibiarkan sampai server: kiriman yang
    // melebihi bodySizeLimit gagal di lapisan framework, dan galatnya tidak
    // memberi tahu apa pun kepada orang yang sedang mengunggah.
    if (gabungan.reduce((n, b) => n + b.size, 0) > BATAS_TOTAL_BYTE) {
      setGalatKlien(teks.terlaluBesar);
      return;
    }

    // URL pratinjau baru baru dibuat setelah validasi lolos, supaya berkas
    // yang ditolak (lewat batas) tidak meninggalkan URL yang tertahan.
    const tambahanUrl: Record<string, string> = {};
    for (const kunci of kunciBaru) {
      const b = gabungan.find((x) => kunciBerkas(x) === kunci);
      if (b) {
        const url = URL.createObjectURL(b);
        urlRef.current.push(url);
        tambahanUrl[kunci] = url;
      }
    }
    if (Object.keys(tambahanUrl).length > 0) {
      setPratinjau((lama) => ({ ...lama, ...tambahanUrl }));
    }

    setBerkas(gabungan);
    sinkronkanKeInput(gabungan);
    if (berkasRef.current) berkasRef.current.value = "";

    // GPS foto → isi lat/lng yang masih kosong (tanpa menimpa ketikan atau
    // "lokasi saya"). exifr diimpor dinamis supaya tidak memberatkan bundel
    // awal halaman. Video dilewati di sini (GPS-nya hanya dibaca server);
    // foto tanpa GPS dilewati diam-diam — server tetap mencoba saat terima.
    if (latRef.current.trim() === "" && lngRef.current.trim() === "") {
      void isiDariGpsFoto(gabungan);
    }
  }

  /** Baca GPS dari foto pertama yang punya; isi field bila masih kosong. */
  async function isiDariGpsFoto(daftar: File[]) {
    try {
      const { default: exifr } = await import("exifr");
      for (const b of daftar) {
        if (!b.type.startsWith("image/")) continue;
        const gps = (await exifr.gps(b).catch(() => null)) as {
          latitude?: unknown; longitude?: unknown;
        } | null;
        if (
          !gps || typeof gps.latitude !== "number" || typeof gps.longitude !== "number" ||
          !Number.isFinite(gps.latitude) || !Number.isFinite(gps.longitude)
        ) {
          continue;
        }
        if (!lokasiAktifRef.current) return;
        // Pengguna mungkin mengetik manual selama pembacaan berlangsung —
        // jangan timpa isian yang sudah ada saat ini.
        if (latRef.current.trim() !== "" || lngRef.current.trim() !== "") return;
        // Tujuh desimal, sama seperti "lokasi saya" dan kolom DECIMAL(10,7).
        setLat(gps.latitude.toFixed(7));
        setLng(gps.longitude.toFixed(7));
        setSumberLokasi("foto");
        return;
      }
    } catch {
      /* tanpa GPS: biarkan kosong */
    }
  }

  function hapusBerkasDipilih(kunci: string, url: string | undefined) {
    if (url) {
      URL.revokeObjectURL(url);
      urlRef.current = urlRef.current.filter((u) => u !== url);
    }
    setPratinjau((lama) => {
      const sisa = { ...lama };
      delete sisa[kunci];
      return sisa;
    });
    const sisaBerkas = berkas.filter((x) => kunciBerkas(x) !== kunci);
    setBerkas(sisaBerkas);
    sinkronkanKeInput(sisaBerkas);
  }

  function lokasiSaya() {
    if (!navigator.geolocation) {
      setGalatKlien(teks.lokasiGagal);
      return;
    }
    setMencariLokasi(true);
    setGalatKlien("");
    navigator.geolocation.getCurrentPosition(
      (posisi) => {
        if (!lokasiAktifRef.current) return;
        setMencariLokasi(false);
        // Tujuh angka di belakang koma, sama dengan DECIMAL(10,7) di kolomnya —
        // lebih dari itu hanya akan dipotong basis data.
        setLat(posisi.coords.latitude.toFixed(7));
        setLng(posisi.coords.longitude.toFixed(7));
        setSumberLokasi(null);
      },
      () => {
        if (!lokasiAktifRef.current) return;
        setMencariLokasi(false);
        setGalatKlien(teks.lokasiGagal);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  if (berhasil) {
    return (
      <div role="status" className="rounded-lg border border-hijau/20 bg-hijau/[0.04] p-8 text-center">
        <p className="text-[20px] font-semibold text-hijau">{teks.berhasilJudul}</p>
        <p className="mx-auto mt-2 max-w-[46ch] text-[14px] leading-[1.6] text-tinta/70">
          {teks.berhasilIsi}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={() => window.location.reload()} className={TOMBOL_UTAMA}>
            {teks.lagi}
          </button>
          <Link href={`/${bahasa}`} className={TOMBOL_GARIS}>
            {teks.kembali}
          </Link>
        </div>
      </div>
    );
  }

  const galat = galatKlien || (keadaan && !keadaan.ok ? keadaan.galat : "");

  return (
    <form
      ref={formRef}
      action={aksi}
      onSubmit={(e) => {
        if (sedangKirimRef.current || mengirim || menungguToken) {
          e.preventDefault();
          return;
        }
        // Bukti visual wajib: tanpa satu berkas pun laporan tidak bisa
        // diverifikasi petugas. Dicek di sini (pesan langsung di bawah form)
        // dan di server (menolak kiriman yang mengakali klien).
        if (berkas.length === 0) {
          e.preventDefault();
          setGalatKlien(teks.berkasWajib);
          document.getElementById("berkas-laporan")?.focus();
          return;
        }
        // Token belum datang: TAHAN kirimannya, jangan tolak diam-diam.
        if (Boolean(SITE_KEY) && !captchaToken) {
          e.preventDefault();
          setGalatKlien("");
          setMenungguToken(true);
          new Promise<boolean>((selesai) => {
            const jam = setTimeout(() => {
              penungguToken.current = penungguToken.current.filter((f) => f !== bangun);
              selesai(false);
            }, 20000);
            const bangun = (tiba: boolean) => { clearTimeout(jam); selesai(tiba); };
            penungguToken.current.push(bangun);
          }).then((tiba) => {
            setMenungguToken(false);
            if (!tiba) {
              setGalatKlien(
                bahasa === "en"
                  ? "Security check could not load. Check your connection and try again."
                  : "Pemeriksaan keamanan gagal dimuat. Periksa koneksi Anda lalu coba lagi.",
              );
              return;
            }
            sedangKirimRef.current = true;
            formRef.current?.requestSubmit();
          });
          return;
        }
        sedangKirimRef.current = true;
      }}
      className="grid gap-7"
    >
      {galat && (
        <p role="alert"
           className="rounded-md border border-api/25 bg-api/[0.06] px-4 py-3 text-[13.5px] text-bara">
          {galat}
        </p>
      )}

      <Bidang id="lapor-judul" label={teks.labelJudul} petunjuk={teks.petunjukJudul} wajib>
        <input id="lapor-judul" name="judul" required maxLength={255} className={ISIAN}
               value={judul} onChange={(e) => setJudul(e.target.value)}
               aria-describedby="lapor-judul-petunjuk" autoComplete="off" />
      </Bidang>

      <Bidang id="lapor-deskripsi" label={teks.labelDeskripsi} petunjuk={teks.petunjukDeskripsi} wajib>
        <textarea id="lapor-deskripsi" name="deskripsi" required maxLength={5000} rows={5}
                  value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)}
                  aria-describedby="lapor-deskripsi-petunjuk"
                  className={`${ISIAN} resize-y leading-[1.6]`} />
      </Bidang>

      <Bidang id="berkas-laporan" label={teks.labelBerkas} petunjuk={teks.petunjukBerkas} wajib>
        {/* Input aslinya disembunyikan dari mata, bukan dari pembaca layar:
            tampilan bawaannya berbeda di tiap peramban dan tidak memberi tahu
            berkas mana saja yang sudah terpilih. Daftar di bawahlah yang
            melakukan itu. */}
        <input ref={berkasRef} type="file" name="berkas" multiple accept={DITERIMA}
               onChange={(e) => tambahBerkas(e.target.files)}
               aria-describedby="berkas-laporan-petunjuk" className="sr-only" id="berkas-laporan" />

        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="berkas-laporan" className={`${TOMBOL_GARIS} cursor-pointer`}>
            {teks.pilihBerkas}
          </label>
          {berkas.length > 0 && (
            <span className="text-[12.5px] text-tinta/50">
              {berkas.length}/{BATAS_BERKAS} · {ukuranTeks(totalByte)}
            </span>
          )}
        </div>

        {berkas.length > 0 && (
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {berkas.map((b) => {
              const kunci = kunciBerkas(b);
              const url = pratinjau[kunci];
              return (
                <li key={kunci}
                    className="group relative overflow-hidden rounded-md border border-black/[0.12] bg-black/[0.02]">
                  <button type="button"
                          onClick={() => hapusBerkasDipilih(kunci, url)}
                          aria-label={`${teks.hapusBerkas} ${b.name}`}
                          className="absolute top-1 right-1 z-[3] grid size-5 cursor-pointer place-items-center rounded-full
                                     bg-black/60 text-white transition-colors hover:bg-api">
                    <svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor" className="size-3">
                      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                    </svg>
                  </button>
                  {url && b.type.startsWith("video/") ? (
                    // #t=0.5 meminta peramban melompat ke detik itu; tanpa itu
                    // <video> tanpa poster berhenti di bingkai kosong.
                    <video src={`${url}#t=0.5`} preload="metadata" muted playsInline
                           className="h-[86px] w-full object-cover" />
                  ) : url ? (
                    <img src={url} alt="" className="h-[86px] w-full object-cover" />
                  ) : (
                    <div className="flex h-[86px] w-full items-center justify-center bg-black/[0.06]">
                      <span className="text-[11px] text-tinta/40">{b.type.startsWith("video/") ? "Video" : "Foto"}</span>
                    </div>
                  )}
                  <p className="truncate px-2 py-1.5 text-[11px] text-tinta/60" title={b.name}>{b.name}</p>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-2.5 text-[12px] leading-[1.5] text-tinta/45">{teks.catatanMetadata}</p>
      </Bidang>

      <Bidang id="lapor-lat" label={teks.labelLokasi} petunjuk={teks.petunjukLokasi}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5">
            <span className="text-[12px] text-tinta/50">{teks.lat}</span>
            <input id="lapor-lat" name="lat" inputMode="decimal" placeholder="-1.2345678"
                   value={lat} onChange={(e) => { setLat(e.target.value); setSumberLokasi(null); }}
                   className={`${ISIAN} w-40`} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[12px] text-tinta/50">{teks.lng}</span>
            <input id="lapor-lng" name="lng" inputMode="decimal" placeholder="113.4567890"
                   value={lng} onChange={(e) => { setLng(e.target.value); setSumberLokasi(null); }}
                   className={`${ISIAN} w-40`} />
          </label>
          <button type="button" onClick={lokasiSaya} disabled={mencariLokasi}
                  className={`${TOMBOL_GARIS} disabled:opacity-50`}>
            {mencariLokasi ? teks.mencariLokasi : teks.pakaiLokasi}
          </button>
        </div>
        {sumberLokasi === "foto" && (
          <p className="mt-1.5 text-[12px] text-tinta/50">{teks.lokasiDariFoto}</p>
        )}
      </Bidang>

      <Bidang id="lapor-nama" label={teks.labelNama}>
        <input id="lapor-nama" name="nama" maxLength={100} disabled={anonim} autoComplete="name"
               value={nama} onChange={(e) => setNama(e.target.value)}
               className={`${ISIAN} disabled:bg-black/[0.03] disabled:text-tinta/35`} />
        <label className="mt-3 flex w-fit items-center gap-2.5 text-[13.5px]">
          <input type="checkbox" name="anonim" value="1" checked={anonim}
                 onChange={(e) => setAnonim(e.target.checked)}
                 className="size-4 accent-[var(--color-api)]" />
          {teks.anonim}
        </label>
      </Bidang>

      {/* Umpan jebakan: disembunyikan dari mata dan dari pembaca layar, dan
          tidak bisa difokus lewat Tab — hanya bot yang mengisinya. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off"
             aria-hidden="true" className="hidden" />

      {/* Wadah widget Turnstile dan input token terverifikasi */}
      <div ref={captchaRef} />
      <input type="hidden" name="captcha" value={captchaToken} />

      {mengirim && <BilahUnggah />}

      <div className="flex items-center gap-4 border-t border-black/[0.08] pt-6">
        {/* "Memverifikasi…" HANYA saat mengirim, tidak saat halaman dibuka.
            Dulu tombolnya terkunci dengan label itu sejak muat pertama sampai
            token Turnstile tiba — di jaringan lambat tampak seperti form yang
            rusak, padahal pengunjung belum melakukan apa pun. Sekarang ia
            langsung siap; labelnya baru berubah sesudah ditekan, saat
            menunggu memang masuk akal. */}
        <button
          type="submit"
          disabled={mengirim || menungguToken}
          aria-busy={mengirim || menungguToken}
          className={`${TOMBOL_UTAMA} disabled:opacity-60`}
        >
          {mengirim
            ? teks.mengirim
            : menungguToken
            ? (bahasa === "en" ? "Verifying…" : "Memverifikasi…")
            : teks.kirim}
        </button>
        <Link href={`/${bahasa}`} className="text-[13px] text-tinta/50 underline-offset-4 hover:underline">
          {teks.kembali}
        </Link>
      </div>
    </form>
  );
}

const ISIAN =
  "w-full rounded-md border border-black/[0.14] bg-white px-3 py-2.5 text-[14px] text-tinta " +
  "outline-none transition-colors placeholder:text-tinta/30 focus:border-api/60 " +
  "focus:ring-2 focus:ring-api/15";

const TOMBOL_UTAMA =
  "inline-flex items-center rounded-md bg-api px-5 py-2.5 text-[13.5px] font-semibold text-white " +
  "transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-api";

const TOMBOL_GARIS =
  "inline-flex items-center rounded-md border border-black/[0.16] bg-white px-4 py-2 text-[13px] " +
  "font-medium text-tinta transition-colors hover:border-black/30 focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-api";

/**
 * Satu bidang isian: label, satu baris petunjuk, lalu isiannya.
 *
 * Wadahnya <div> dengan <label for>, BUKAN <label> yang membungkus semuanya —
 * beberapa bidang di form ini berisi label lain di dalamnya (pemilih berkas,
 * kotak anonim, pasangan lat/lng), dan label bersarang tidak sah serta membuat
 * klik jatuh ke kendali yang salah.
 */
function Bidang({
  id, label, petunjuk, wajib = false, children,
}: {
  /** id kendali yang dituju label ini. */
  id: string;
  label: string;
  petunjuk?: string;
  wajib?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-[13.5px] font-semibold text-tinta">
        {label}
        {wajib && <span aria-hidden="true" className="ml-1 text-api">*</span>}
      </label>
      {petunjuk && (
        <p id={`${id}-petunjuk`} className="-mt-1 text-[12.5px] leading-[1.5] text-tinta/50">
          {petunjuk}
        </p>
      )}
      {children}
    </div>
  );
}
