"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Komentar } from "@/lib/komentar";

/** Site key Turnstile. Tanpa ini (development) widget tidak dirender dan
 *  verifikasi di server pun dilewati — sama seperti di Pasopati. */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

type TurnstileInstance = {
  render: (wadah: HTMLElement, opsi: Record<string, unknown>) => number;
  execute: (wadah: HTMLElement, opsi?: Record<string, unknown>) => void;
  reset: (id: number) => void;
  remove: (id: number | null) => void;
};

type WindowTurnstile = Window & { turnstile?: TurnstileInstance };

function turnstile(): TurnstileInstance | null {
  return (window as WindowTurnstile).turnstile ?? null;
}

/** Padanan Alpine komentarLaporan() di beranda.js proyek Pasopati: kolom
 *  komentar pada pop-up rincian, digerakkan sendiri lewat endpoint JSON yang
 *  sama, tanpa Livewire. */
export function gunakanKomentar(idLaporan: number) {
  const [daftar, setDaftar] = useState<Komentar[]>([]);
  const [memuat, setMemuat] = useState(false);
  const [mengirim, setMengirim] = useState(false);
  const [nama, setNama] = useState("");
  const [email, setEmail] = useState("");
  const [anonim, setAnonim] = useState(false);
  const [isi, setIsi] = useState("");
  const [balasKe, setBalasKe] = useState<number | null>(null);
  const [balasNama, setBalasNama] = useState("");
  const [dibuka, setDibuka] = useState<number[]>([]);
  const [website, setWebsite] = useState("");
  const [galat, setGalat] = useState("");

  /**
   * Identitas pengisi komentar dipulihkan SESUDAH hidrasi, bukan di dalam
   * inisialisasi useState.
   */
  useEffect(() => {
    try {
      const namaTersimpan = localStorage.getItem("komentar_nama");
      const emailTersimpan = localStorage.getItem("komentar_email");
      if (namaTersimpan) setNama(namaTersimpan);
      if (emailTersimpan) setEmail(emailTersimpan);
    } catch {
      // localStorage bisa ditolak (mode privat, kuki diblokir) — biarkan kosong.
    }
  }, []);

  const ketikRef = useRef<HTMLTextAreaElement | null>(null);
  const wadahRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<number | null>(null);
  const sedangKirimRef = useRef(false);
  const tokenResolverRef = useRef<((token: string) => void) | null>(null);
  const currentIdRef = useRef(idLaporan);
  currentIdRef.current = idLaporan;

  // Bersihkan widget Turnstile saat hook unmount (pop-up ditutup)
  useEffect(() => {
    return () => {
      const ts = turnstile();
      if (ts && widgetRef.current !== null) {
        try {
          ts.remove(widgetRef.current);
        } catch {}
        widgetRef.current = null;
      }
    };
  }, []);

  const alamat = `/api/laporan/${idLaporan}/komentar`;

  const batalBalas = useCallback(() => {
    setBalasKe(null);
    setBalasNama("");
  }, []);

  // Ambil komentar laporan ini & setel ulang keadaan saat idLaporan berubah
  useEffect(() => {
    let batal = false;
    setMemuat(true);
    setGalat("");
    setBalasKe(null);
    setBalasNama("");
    setDibuka([]);
    setDaftar([]);

    fetch(alamat, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: { komentar?: Komentar[] }) => {
        if (batal) return;
        setDaftar(data.komentar ?? []);
        setMemuat(false);
      })
      .catch(() => {
        if (batal) return;
        setMemuat(false);
        setGalat("Komentar gagal dimuat. Coba muat ulang halaman.");
      });

    return () => {
      batal = true;
    };
  }, [alamat]);

  // Reset widget Turnstile saat ganti laporan
  useEffect(() => {
    const ts = turnstile();
    if (ts && widgetRef.current !== null) {
      try {
        ts.reset(widgetRef.current);
      } catch {
        /* widget sudah lepas bersama pop-up yang ditutup */
      }
    }
  }, [idLaporan]);

  /** Buang widget yang sedang menempel, apa pun keadaannya. */
  const lepasWidget = useCallback(() => {
    const ts = turnstile();
    if (ts && widgetRef.current !== null) {
      try {
        ts.remove(widgetRef.current);
      } catch {
        /* sudah lepas bersama wadahnya */
      }
    }
    widgetRef.current = null;
  }, []);

  const captchaRef = useCallback(
    (wadah: HTMLDivElement | null) => {
      wadahRef.current = wadah;
      lepasWidget();
      if (!wadah || !SITE_KEY) return;

      const pasang = () => {
        if (wadahRef.current !== wadah) return;
        const ts = turnstile();
        if (!ts) {
          window.setTimeout(pasang, 100);
          return;
        }
        widgetRef.current = ts.render(wadah, {
          sitekey: SITE_KEY,
          appearance: "interaction-only",
          execution: "execute",
          callback: (token: string) => {
            if (tokenResolverRef.current) {
              tokenResolverRef.current(token);
              tokenResolverRef.current = null;
            }
          },
          "expired-callback": () => {
            const t = turnstile();
            if (t && widgetRef.current !== null) {
              try {
                t.reset(widgetRef.current);
              } catch {}
            }
          },
          "error-callback": () => {
            if (tokenResolverRef.current) {
              tokenResolverRef.current("");
              tokenResolverRef.current = null;
            }
            const t = turnstile();
            if (t && widgetRef.current !== null) {
              try {
                t.reset(widgetRef.current);
              } catch {}
            }
          },
        });
      };

      pasang();
    },
    [lepasWidget],
  );

  const ulangCaptcha = useCallback(() => {
    const ts = turnstile();
    if (ts && widgetRef.current !== null) {
      try {
        ts.reset(widgetRef.current);
      } catch {}
    }
  }, []);

  /** Jalankan tantangan Turnstile dan tunggu tokennya. */
  const ambilToken = useCallback(async (): Promise<string> => {
    if (!SITE_KEY) return "";
    for (let i = 0; widgetRef.current === null && i < 50; i++) {
      await new Promise((lanjut) => window.setTimeout(lanjut, 100));
    }
    const ts = turnstile();
    const wadah = wadahRef.current;
    if (!ts || !wadah || widgetRef.current === null) return "";

    return new Promise<string>((selesai) => {
      tokenResolverRef.current = selesai;
      const jam = window.setTimeout(() => {
        if (tokenResolverRef.current === selesai) {
          tokenResolverRef.current = null;
          selesai("");
        }
      }, 10_000);

      try {
        ts.execute(wadah);
      } catch {
        window.clearTimeout(jam);
        if (tokenResolverRef.current === selesai) {
          tokenResolverRef.current = null;
          selesai("");
        }
      }
    });
  }, []);

  // Saat mulai membalas, fokus dipindah ke kolom ketik
  useEffect(() => {
    if (balasKe === null) return;
    const kolom = ketikRef.current;
    if (!kolom) return;
    kolom.focus();
    kolom.setSelectionRange(kolom.value.length, kolom.value.length);
  }, [balasKe]);

  // Akar dari sebuah komentar
  const akarDari = useCallback(
    (id: number | null): number | null => {
      if (!id) return null;
      for (const k of daftar) {
        if (k.id === id) return k.id;
        if ((k.balasan ?? []).some((b) => b.id === id)) return k.id;
      }
      return null;
    },
    [daftar],
  );

  const tampilkanBalasan = useCallback(
    (akarId: number) => dibuka.includes(akarId),
    [dibuka],
  );

  const alihkanBalasan = useCallback((akarId: number) => {
    setDibuka((d) => (d.includes(akarId) ? d.filter((x) => x !== akarId) : [...d, akarId]));
  }, []);

  const mulaiBalas = useCallback((k: Komentar) => {
    setBalasKe(k.id);
    setBalasNama(k.nama);
  }, []);

  const sebutanDari = useCallback(
    (k: Komentar) => (k.sebutan ? `@${k.sebutan}` : null),
    [],
  );

  const isiTanpaSebutan = useCallback((k: Komentar) => {
    const awalan = k.sebutan ? `@${k.sebutan}` : null;
    if (!awalan || !k.isi.startsWith(awalan)) return k.isi;
    return k.isi.slice(awalan.length).replace(/^\s+/, "");
  }, []);

  const kirim = useCallback(async () => {
    if (sedangKirimRef.current || !isi.trim()) return;
    sedangKirimRef.current = true;
    setMengirim(true);
    setGalat("");

    const targetId = idLaporan;

    try {
      const captchaToken = await ambilToken();
      if (SITE_KEY && !captchaToken) {
        setGalat("Verifikasi keamanan gagal. Coba kirim lagi.");
        return;
      }

      const r = await fetch(alamat, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          nama: anonim ? "" : nama,
          email: anonim ? "" : email,
          anonim,
          isi,
          balas_ke: balasKe,
          website,
          captcha: captchaToken,
        }),
      });

      const respon = (await r.json().catch(() => null)) as {
        komentar?: Komentar[];
        message?: string;
        errors?: Record<string, string>;
      } | null;

      if (!r.ok) {
        const pesan = (respon?.errors && Object.values(respon.errors)[0]) ?? respon?.message;
        setGalat(pesan ?? "Komentar gagal dikirim. Coba lagi.");
        return;
      }

      // Cegah kontaminasi komentar jika pengguna berpindah laporan sebelum respons tiba
      if (currentIdRef.current !== targetId) return;

      const akar = akarDari(balasKe);
      setDaftar(respon?.komentar ?? []);
      setIsi("");
      batalBalas();
      if (akar !== null) {
        setDibuka((d) => (d.includes(akar) ? d : [...d, akar]));
      }

      try {
        if (!anonim) {
          localStorage.setItem("komentar_nama", nama);
          localStorage.setItem("komentar_email", email);
        }
      } catch {}
    } catch {
      setGalat("Komentar gagal dikirim. Coba lagi.");
    } finally {
      sedangKirimRef.current = false;
      setMengirim(false);
      ulangCaptcha();
    }
  }, [
    alamat, akarDari, ambilToken, anonim, batalBalas, balasKe,
    email, idLaporan, isi, nama, ulangCaptcha, website,
  ]);

  return {
    daftar, memuat, mengirim, galat,
    nama, setNama,
    email, setEmail,
    anonim, setAnonim,
    isi, setIsi,
    website, setWebsite,
    balasKe, balasNama,
    batalBalas, mulaiBalas,
    tampilkanBalasan, alihkanBalasan,
    sebutanDari, isiTanpaSebutan,
    kirim,
    ketikRef, captchaRef,
  };
}