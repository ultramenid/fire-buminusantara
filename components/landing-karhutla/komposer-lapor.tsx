"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { BATAS_BERKAS, BATAS_TOTAL_BYTE } from "@/lib/batas-laporan";
import type { Bahasa } from "@/lib/bahasa";
import { kirimLaporan, type KeadaanLapor } from "@/app/[locale]/lapor/aksi";
import { bacaDraf, simpanDraf } from "@/lib/draf-lapor";
import { IkonFoto, IkonVideo, IkonPin, IkonOrang } from "./ikon";
import { TEKS } from "./teks";

/** Site key Turnstile — sama seperti form /lapor. */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

/* Jenis berkas ditulis satu per satu, BUKAN "image/*,video/*" — sama seperti
   form /lapor: dengan daftar eksplisit, iOS mengubah foto HEIC-nya jadi JPEG
   saat dipilih sehingga lolas pemeriksaan MIME di server. */
const DITERIMA = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm";

type TurnstileInstance = {
  render: (wadah: HTMLElement, opsi: Record<string, unknown>) => number;
  reset: (id: number) => void;
  remove: (id: number | null) => void;
};

function turnstile(): TurnstileInstance | null {
  return (window as Window & { turnstile?: TurnstileInstance }).turnstile ?? null;
}

/** Dua berkas dianggap sama kalau nama, ukuran, dan waktu ubahnya sama. */
function kunciBerkas(b: File): string {
  return `${b.name}|${b.size}|${b.lastModified}`;
}

/* Komposer laporan inline ala X: tampilan menciut (avatar + ajakan + ikon +
   pil Kirim), mengembang jadi mini-form saat disentuh, dan mengirim lewat
   server action YANG SAMA dengan form /lapor — tanpa pindah halaman.

   Syarat server yang wajib dipenuhi di sini juga: judul, deskripsi, minimal
   satu berkas, dan token Turnstile (bila site key dipasang). Lokasi opsional;
   tanpa lat/lng server mencoba EXIF foto. Nama opsional + centang anonim
   seperti form /lapor. */
export function KomposerLapor({ bahasa }: { bahasa: Bahasa }) {
  const t = TEKS[bahasa];
  const router = useRouter();
  /* Isian teks lahir dari draf yang tersimpan, bukan dari string kosong.

     Sebabnya: tab peta seluler menunjuk ke /karhutla/panel dan tombol "+" di
     sana menunjuk balik ke /karhutla — dua rute, jadi App Router me-mount
     ulang komposer ini dan seluruh state di bawah lahir kosong lagi. Gejala
     yang terlihat: mengetik di beranda, mampir ke peta, tekan "+", isian
     sudah bersih. Komponennya memang satu dan sama; yang hilang state-nya.

     Aman dari ketidakcocokan hidrasi meski inisialisasi lazy ikut berjalan di
     klien: selama `buka` masih false — dan ia SELALU false pada render
     pertama, di server maupun klien — tak satu pun nilai di bawah ini sampai
     ke DOM. Barulah setelah komposer dibuka isinya dirender, dan saat itu
     hidrasi sudah lewat.

     `berkas` TIDAK ikut: objek File tak bisa ditaruh di localStorage, jadi
     lampiran tetap harus dipilih ulang setelah pindah halaman. */
  const [drafAwal] = useState(bacaDraf);
  const [buka, setBuka] = useState(false);
  const [judul, setJudul] = useState(drafAwal.judul);
  const [deskripsi, setDeskripsi] = useState(drafAwal.deskripsi);
  const [berkas, setBerkas] = useState<File[]>([]);
  const [pratinjau, setPratinjau] = useState<Record<string, string>>({});
  const [lat, setLat] = useState(drafAwal.lat);
  const [lng, setLng] = useState(drafAwal.lng);
  const [nama, setNama] = useState(drafAwal.nama);
  const [anonim, setAnonim] = useState(drafAwal.anonim);
  const [mencariLokasi, setMencariLokasi] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [galatKlien, setGalatKlien] = useState("");
  const [terkirim, setTerkirim] = useState(false);
  const [menungguToken, setMenungguToken] = useState(false);

  /* Draf disimpan tiap kali isinya berubah. Kiriman yang berhasil
     mengosongkan semua isian di atas, jadi pembersihan draf ikut lewat
     simpanDraf — tak perlu penghapusan terpisah. */
  useEffect(() => {
    simpanDraf({ judul, deskripsi, nama, lat, lng, anonim });
  }, [judul, deskripsi, nama, lat, lng, anonim]);

  const berkasRef = useRef<HTMLInputElement | null>(null);
  const captchaRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<number | null>(null);
  const sedangKirimRef = useRef(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const penungguToken = useRef<((tiba: boolean) => void)[]>([]);
  const urlRef = useRef<string[]>([]);
  const lokasiAktifRef = useRef(true);
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
          setJudul("");
          setDeskripsi("");
          setLat("");
          setLng("");
          setNama("");
          setAnonim(false);
          setTerkirim(true);
          router.refresh();
        } else {
          ulangCaptcha();
        }
        return hasil;
      } finally {
        sedangKirimRef.current = false;
      }
    },
    null,
  );

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

  useEffect(() => {
    // `buka` ikut disinkronkan: input berkas di mode menciut dan di form adalah
    // dua elemen berbeda — berkas yang dipilih sebelum mengembang harus pindah
    // ke input form, kalau tidak kiriman berangkat tanpa lampiran.
    sinkronkanKeInput(berkas);
  }, [berkas, keadaan, buka, sinkronkanKeInput]);

  // Pesan sukses hanya mampir 5 detik: laporan masih antre kurasi sebelum
  // tampil di publik, lalu komposer kembali ke tampilan awal yang menciut.
  useEffect(() => {
    if (!terkirim) return;
    const jam = window.setTimeout(() => {
      setTerkirim(false);
      setBuka(false);
    }, 5000);
    return () => window.clearTimeout(jam);
  }, [terkirim]);

  // Widget Turnstile dipasang saat komposer mengembang — sama seperti form
  // /lapor: appearance interaction-only, tak terlihat kecuali ditantang.
  useEffect(() => {
    if (!buka || !SITE_KEY) return;
    let hidup = true;
    const pasang = () => {
      const wadah = captchaRef.current;
      const ts = turnstile();
      if (!wadah || !hidup) return;
      if (!ts) {
        window.setTimeout(pasang, 100);
        return;
      }
      if (widgetRef.current !== null) {
        try {
          ts.remove(widgetRef.current);
        } catch {
          /* belum ada widget */
        }
        widgetRef.current = null;
      }
      wadah.innerHTML = "";
      widgetRef.current = ts.render(wadah, {
        sitekey: SITE_KEY,
        appearance: "interaction-only",
        callback: (token: string) => {
          setCaptchaToken(token);
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
      const ts = turnstile();
      if (ts && widgetRef.current !== null) {
        try {
          ts.remove(widgetRef.current);
        } catch {
          /* sudah lepas */
        }
        widgetRef.current = null;
      }
    };
  }, [buka]);

  function tambahBerkas(dipilih: FileList | null) {
    if (!dipilih || dipilih.length === 0) return;
    setBuka(true);
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
      setGalatKlien(t.terlaluBanyak);
      return;
    }
    if (gabungan.reduce((n, b) => n + b.size, 0) > BATAS_TOTAL_BYTE) {
      setGalatKlien(t.terlaluBesar);
      return;
    }
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
  }

  function hapusBerkas(kunci: string, url: string | undefined) {
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
    setBuka(true);
    if (!navigator.geolocation) {
      setGalatKlien(t.lokasiGagal);
      return;
    }
    setMencariLokasi(true);
    setGalatKlien("");
    navigator.geolocation.getCurrentPosition(
      (posisi) => {
        if (!lokasiAktifRef.current) return;
        setMencariLokasi(false);
        setLat(posisi.coords.latitude.toFixed(7));
        setLng(posisi.coords.longitude.toFixed(7));
      },
      () => {
        if (!lokasiAktifRef.current) return;
        setMencariLokasi(false);
        setGalatKlien(t.lokasiGagal);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function hapusLokasi() {
    setLat("");
    setLng("");
  }

  if (terkirim) {
    return (
      <div role="status" className="rounded-xl bg-white border border-black/[0.06] text-tinta shadow-sm dark:bg-black dark:border-white/5 dark:text-[#f5f5f5] p-5 text-center">
        <p className="text-[15px] font-bold text-tinta dark:text-[#f5f5f5]">{t.terkirim}</p>
        <p className="mx-auto mt-1 max-w-[46ch] text-[13px] leading-relaxed text-black/60 dark:text-[#a0a0a0]">
          {t.terkirimIsi}
        </p>
        <button
          type="button"
          onClick={() => setTerkirim(false)}
          className="mt-3 cursor-pointer rounded-full bg-black text-white dark:bg-[#e7e9ea] dark:text-black px-5 py-1.5 text-[14px] font-bold transition
                     hover:opacity-90 dark:hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5a26]"
        >
          {t.tulisLagi}
        </button>
    </div>
  );
}

  const galat = galatKlien || (keadaan && !keadaan.ok ? keadaan.galat : "");
  /* "Ada lokasi" DITURUNKAN dari isi koordinatnya, bukan bendera tersendiri:
     dengan kotak Lat/Lng yang kini sebaris dan terlihat, bendera yang bilang
     "belum ada titik" sementara dua kotak di sebelahnya jelas berisi angka
     adalah pil yang berbohong. */
  const adaLokasi = lat.trim() !== "" || lng.trim() !== "";
  const ikonAksi = "lk-ikon-aksi cursor-pointer rounded-full p-2 text-[#ff5a26] transition hover:bg-[#ff5a26]/10 focus-visible:outline-2 focus-visible:outline-[#ff5a26]";

  return (
    <div className="rounded-xl bg-white border border-black/[0.06] text-tinta shadow-sm dark:bg-black dark:border-white/5 dark:text-[#f5f5f5] p-4">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="lk-avatar flex size-11 shrink-0 items-center justify-center rounded-full bg-[#ff5a26] text-white">
          <IkonOrang className="size-6 text-white stroke-white" />
        </span>
        {!buka ? (
          <button
            type="button"
            id="lk-tulis"
            onClick={() => setBuka(true)}
            className="flex-1 cursor-pointer truncate rounded-lg bg-black/[0.03] px-4 py-2.5 text-left text-[15px] text-black/80 transition-all hover:bg-black/[0.06] hover:text-black dark:bg-white/[0.06] dark:text-[#f0f0f0] dark:hover:bg-white/[0.1] dark:hover:text-white
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5a26]"
          >
            {t.tulis}
          </button>
        ) : (
          <>
            <label htmlFor="lk-judul" className="sr-only">{t.judulPh}</label>
            {/* Di luar <form> tapi ikut terkirim lewat form="lk-form" — supaya
                ia bisa duduk sejajar avatar seperti komposer X. */}
            <input
              id="lk-judul"
              name="judul"
              form="lk-form"
              value={judul}
              onChange={(e) => setJudul(e.target.value)}
              placeholder={t.judulPh}
              maxLength={255}
              autoComplete="off"
              className="lk-tulis-isi min-w-0 flex-1 rounded-lg border border-black/[0.12] bg-white px-4 py-2.5 text-[15px] font-semibold text-tinta placeholder:font-normal placeholder:text-black/40 transition-all focus:border-[#ff5a26] focus:outline-none focus:ring-1 focus:ring-[#ff5a26] dark:border-white/15 dark:bg-white/[0.04] dark:text-[#f5f5f5] dark:placeholder:text-[#a0a0a0]/70 dark:focus:border-[#ff5a26]"
            />
          </>
        )}
      </div>

      {!buka ? (
        <div className="mt-2 flex items-center gap-1 panggung:pl-14">
          <button type="button" title={t.lampirFoto} aria-label={t.lampirFoto}
                  onClick={() => berkasRef.current?.click()} className={ikonAksi}>
            <IkonFoto />
          </button>
          <button type="button" title={t.lampirVideo} aria-label={t.lampirVideo}
                  onClick={() => berkasRef.current?.click()} className={ikonAksi}>
            <IkonVideo />
          </button>
          <button type="button" title={t.tandaiLokasi} aria-label={t.tandaiLokasi}
                  onClick={lokasiSaya} className={ikonAksi}>
            <IkonPin />
          </button>
          <button
            type="button"
            onClick={() => setBuka(true)}
            className="lk-kirim ml-auto cursor-pointer rounded-full bg-black text-white dark:bg-[#e7e9ea] dark:text-black px-5 py-1.5 text-[15px] font-bold transition
                       hover:opacity-90 dark:hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5a26]"
          >
            {t.kirim}
          </button>
        </div>
      ) : (
        <form
          ref={formRef}
          id="lk-form"
          action={aksi}
          onSubmit={(e) => {
            if (sedangKirimRef.current || mengirim || menungguToken) {
              e.preventDefault();
              return;
            }
            if (judul.trim() === "") {
              e.preventDefault();
              setGalatKlien(t.judulWajib);
              document.getElementById("lk-judul")?.focus();
              return;
            }
            if (deskripsi.trim() === "") {
              e.preventDefault();
              setGalatKlien(t.ceritaWajib);
              document.getElementById("lk-cerita")?.focus();
              return;
            }
            if (berkas.length === 0) {
              e.preventDefault();
              setGalatKlien(t.berkasWajib);
              return;
            }
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
                  setGalatKlien(t.keamananGagal);
                  return;
                }
                sedangKirimRef.current = true;
                formRef.current?.requestSubmit();
              });
              return;
            }
            sedangKirimRef.current = true;
          }}
          /* Indentasi sejajar-avatar ala X hanya di panggung. Di ponsel pl-14
             (56px) ditambah p-4 panel membuat kiri tersisip 72px sementara
             kanan cuma 16px — asimetris, dan sisa lebarnya tinggal ~286px
             sehingga baris Lat/Lng/Nama/Anonim mentok ke tepi. */
          className="mt-2.5 panggung:pl-14"
        >
          {/* Tumbuh mengikuti isi. Dengan rows tetap, kotak yang baru berisi
              placeholder menyisakan rongga menganga di atas baris berikutnya —
              dan rongga itulah yang pertama menarik mata, bukan isinya.
              Atapnya 200px supaya cerita panjang tak mendorong tombol kirim
              keluar layar. */}
          <textarea
            id="lk-cerita"
            name="deskripsi"
            value={deskripsi}
            onChange={(e) => {
              setDeskripsi(e.target.value);
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
            }}
            placeholder={t.ceritaPh}
            maxLength={5000}
            rows={2}
            className="lk-tulis-isi w-full resize-none rounded-lg border border-black/[0.12] bg-white p-3.5 text-[15px] leading-relaxed text-tinta placeholder:text-black/40 transition-all focus:border-[#ff5a26] focus:outline-none focus:ring-1 focus:ring-[#ff5a26] dark:border-white/15 dark:bg-white/[0.04] dark:text-[#f5f5f5] dark:placeholder:text-[#a0a0a0]/70 dark:focus:border-[#ff5a26]"
          />

          {galat && (
            <p role="alert" className="mt-2 text-[13px] leading-relaxed text-[#e60012] dark:text-[#ff7a59]">
              {galat}
            </p>
          )}

          <div ref={captchaRef} />
          <input ref={berkasRef} type="file" name="berkas" multiple accept={DITERIMA}
                 aria-label={t.lampirFoto}
                 onChange={(e) => tambahBerkas(e.target.files)} className="sr-only" tabIndex={-1} />
          <input type="hidden" name="captcha" value={captchaToken} />
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

          {/* Satu baris identitas: pil lokasi, nama, anonim — tiga benda, bukan
              lima. Titiknya ditandai lewat pil (sekali sentuh), bukan dengan
              mengetik dua bilangan desimal; keadaan "ditandai" dibaca dari pil
              itu sendiri, jadi tak perlu baris keterangan di bawahnya. Nama
              memanjang mengisi sisa baris supaya tak ada rongga. */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={adaLokasi ? hapusLokasi : lokasiSaya}
              disabled={mencariLokasi}
              title={adaLokasi ? t.lokasiHapus : t.tandaiLokasi}
              aria-label={adaLokasi ? t.lokasiHapus : t.tandaiLokasi}
              className={`lk-isian flex h-9 cursor-pointer items-center gap-1.5 rounded-full pr-3 pl-2.5 text-[13px]
                          whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-50
                          focus-visible:outline-2 focus-visible:outline-[#ff5a26] ${
                adaLokasi
                  ? "bg-[#ff5a26]/20 text-[#ff5a26] hover:bg-[#ff5a26]/25"
                  : "bg-[#ff5a26]/10 text-[#ff5a26] hover:bg-[#ff5a26]/15"
              }`}
            >
              <IkonPin className="size-[18px]" />
              <span>{mencariLokasi ? t.mencariLokasi : adaLokasi ? t.lokasiOk : t.tandaiLokasi}</span>
              {adaLokasi && (
                <svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor" className="size-3.5 opacity-70">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              )}
            </button>

            {/* Koordinatnya selalu terpampang, tepat di sebelah pil lokasi.
                Ia bukan kontrol yang perlu dibuka: begitu titiknya ditandai
                GPS, dua bilangan itulah buktinya — dan pelapor berhak melihat
                serta membetulkannya. Sekaligus jalan masuk lat/lng custom. */}
            <span className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
              <label className="sr-only" htmlFor="lk-lat">{t.latPh}</label>
              <input id="lk-lat" name="lat" inputMode="decimal" placeholder={t.latPh}
                     value={lat} onChange={(e) => setLat(e.target.value)}
                     className="lk-isian lk-koord h-9 w-0 min-w-0 flex-1 sm:w-[86px] sm:flex-none rounded-lg bg-white px-3 font-mono placeholder:font-sans text-[13px] text-tinta border border-black/[0.12] placeholder:text-black/40 transition-all focus:border-[#ff5a26] focus:outline-none focus:ring-1 focus:ring-[#ff5a26] dark:bg-white/[0.04] dark:text-[#f5f5f5] dark:border-white/15 dark:placeholder:text-[#a0a0a0]/60 dark:focus:border-[#ff5a26]" />
              <label className="sr-only" htmlFor="lk-lng">{t.lngPh}</label>
              <input id="lk-lng" name="lng" inputMode="decimal" placeholder={t.lngPh}
                     value={lng} onChange={(e) => setLng(e.target.value)}
                     className="lk-isian lk-koord h-9 w-0 min-w-0 flex-1 sm:w-[86px] sm:flex-none rounded-lg bg-white px-3 font-mono placeholder:font-sans text-[13px] text-tinta border border-black/[0.12] placeholder:text-black/40 transition-all focus:border-[#ff5a26] focus:outline-none focus:ring-1 focus:ring-[#ff5a26] dark:bg-white/[0.04] dark:text-[#f5f5f5] dark:border-white/15 dark:placeholder:text-[#a0a0a0]/60 dark:focus:border-[#ff5a26]" />
            </span>

            {/* Anonim menyembunyikan kolom nama, bukan meredupkannya: kolom mati
                yang tetap terpampang cuma mengundang orang mengetik ke dalamnya. */}
            {/* Nama + anonim satu kelompok: di ponsel mereka turun ke baris
                kedua bersama-sama, bukan nama terpotong di ujung baris lokasi
                dan saklarnya terdampar sendirian di baris ketiga. */}
            <span className="flex basis-full items-center gap-3 sm:basis-0 sm:flex-1">
            {!anonim && (
              <>
                <label className="sr-only" htmlFor="lk-nama">{t.namaPh}</label>
                <input id="lk-nama" name="nama" maxLength={100} autoComplete="name"
                       value={nama} onChange={(e) => setNama(e.target.value)} placeholder={t.namaPh}
                       className="lk-isian h-9 min-w-0 flex-1 rounded-lg bg-white px-3.5 text-[13px] text-tinta border border-black/[0.12] placeholder:text-black/40 transition-all focus:border-[#ff5a26] focus:outline-none focus:ring-1 focus:ring-[#ff5a26] dark:bg-white/[0.04] dark:text-[#f5f5f5] dark:border-white/15 dark:placeholder:text-[#a0a0a0]/60 dark:focus:border-[#ff5a26]" />
              </>
            )}

            <label className="lk-anonim ml-auto flex cursor-pointer items-center gap-2 text-[13px] whitespace-nowrap text-black/60 dark:text-[#a0a0a0]">
              <Switch
                name="anonim"
                value="1"
                checked={anonim}
                onCheckedChange={setAnonim}
                size="sm"
                aksen="bara"
              />
              <span>{t.anonim}</span>
            </label>
            </span>
          </div>


          {/* Pratinjau di bawah baris lokasi+nama: kotak mengikuti ukuran
              gambar (kecil, utuh) berderet rapat ala X (flex-wrap). */}
          {berkas.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-4">
              {berkas.map((b) => {
                const kunci = kunciBerkas(b);
                const url = pratinjau[kunci];
                return (
                  <li key={kunci} className="min-w-0">
                    <span className="relative inline-block min-w-0">
                      <button type="button"
                              onClick={() => hapusBerkas(kunci, url)}
                              aria-label={`${b.name}`}
                              className="absolute -top-2.5 -right-2.5 z-[3] grid size-7 cursor-pointer place-items-center rounded-full
                                         bg-neutral-800 text-white ring-1 ring-black/20 dark:bg-[#1e1e1e] dark:ring-white/20 transition-colors hover:bg-[#e60012]">
                        <svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor" className="size-3.5">
                          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                        </svg>
                      </button>
                      {url && b.type.startsWith("video/") ? (
                        <video src={`${url}#t=0.5`} preload="metadata" muted playsInline
                               className="h-14 w-auto min-w-14 max-w-full rounded-xl bg-black/5 object-contain ring-1 ring-black/10 dark:bg-black dark:ring-white/15" />
                      ) : url ? (
                        /* eslint-disable-next-line @next/next/no-img-element -- pratinjau blob lokal */
                        <img src={url} alt="" className="h-14 w-auto max-w-full rounded-xl bg-black/5 object-contain ring-1 ring-black/10 dark:bg-black dark:ring-white/15" />
                      ) : (
                        <span className="flex h-14 items-center justify-center rounded-xl bg-black/[0.04] px-3 text-[11px] text-black/60 ring-1 ring-black/10 dark:bg-white/5 dark:text-[#a0a0a0] dark:ring-white/15">
                          {b.type.startsWith("video/") ? "Video" : "Foto"}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-3 flex items-center gap-1 border-t border-black/[0.08] dark:border-white/10 pt-2">
            <button type="button" title={t.lampirFoto} aria-label={t.lampirFoto}
                    onClick={() => berkasRef.current?.click()} className={ikonAksi}>
              <IkonFoto />
            </button>
            <button type="button" title={t.lampirVideo} aria-label={t.lampirVideo}
                    onClick={() => berkasRef.current?.click()} className={ikonAksi}>
              <IkonVideo />
            </button>
            {/* Syarat wajibnya berdiri di sebelah tombolnya, bukan muncul
                sebagai galat setelah tombol Kirim ditekan. Di ponsel ia
                disembunyikan, bukan dipotong: baris ini sudah penuh oleh dua
                ikon + Batal + Kirim, dan "Foto/vid…" bukan keterangan. */}
            <span className="lk-isian hidden min-w-0 truncate pl-1 text-[12px] whitespace-nowrap text-black/60 dark:text-[#a0a0a0] sm:inline">
              {berkas.length > 0 ? `${berkas.length}/${BATAS_BERKAS}` : t.wajibMedia}
            </span>
            <button type="button" onClick={() => setBuka(false)}
                    className="lk-batal ml-auto h-9 cursor-pointer rounded-full px-3.5 text-[14px] text-black/60 transition hover:bg-black/[0.05] hover:text-black dark:text-[#a0a0a0] dark:hover:bg-white/10 dark:hover:text-white
                               focus-visible:outline-2 focus-visible:outline-[#ff5a26]">
              {t.batal}
            </button>
            <button
              type="submit"
              disabled={mengirim || menungguToken}
              aria-busy={mengirim || menungguToken}
              /* Redup selama syaratnya belum lengkap — isyarat, bukan kunci:
                 tombolnya tetap bisa ditekan supaya galat di atas bisa
                 menyebut apa yang kurang. */
              className={`lk-kirim h-9 cursor-pointer rounded-full bg-black text-white dark:bg-[#e7e9ea] dark:text-black px-5 text-[15px] font-semibold transition
                         hover:opacity-90 dark:hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5a26]
                         disabled:opacity-60 disabled:cursor-not-allowed ${
                           judul.trim() && deskripsi.trim() && berkas.length > 0 ? "" : "opacity-45"
                         }`}
            >
              {mengirim ? t.mengirim : menungguToken ? t.memverifikasi : t.kirim}
            </button>
          </div>
        </form>
      )}

      {/* Input berkas untuk mode menciut — tambahBerkas() membuka komposernya. */}
      {!buka && (
        <input ref={berkasRef} type="file" name="berkas" multiple accept={DITERIMA}
               aria-label={t.lampirFoto}
               onChange={(e) => tambahBerkas(e.target.files)} className="sr-only" tabIndex={-1} />
      )}
    </div>
  );
}