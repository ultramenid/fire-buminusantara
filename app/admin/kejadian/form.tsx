"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Wajib, Bantuan, Isian, IsianPanjang, IsianKoordinat } from "../isian";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { PetaLokasi } from "../peta-lokasi";
import { CariLokasi } from "../cari-lokasi";
import { BilahUnggah } from "@/components/bilah-unggah";
import { Pemuat } from "../pemuat";
import { DatePicker } from "@/components/ui/date-picker";
import type { ItemMedia } from "@/lib/media";

export type NilaiAwal = {
  id?: number;
  title_id: string; title_en: string; slug: string;
  description_id: string; description_en: string;
  event_date: string; location: string;
  location_lat: string; location_lng: string;
  orientation: string;
  /** "draft" | "published". Kejadian baru lahir sebagai draft. */
  status: string;
  /** Galeri yang sudah tersimpan, urut sama dengan indeks `keep_media`. */
  galeri: ItemMedia[];
};

/** Saran "ikuti pin": nama tempat tepat di titik koordinat saat ini. */
type SaranTitik = { nama: string; negara: string | null };

/** Kode negara yang umum muncul di sekitar sini; selebihnya tampil apa adanya. */
const NEGARA: Record<string, string> = { id: "Indonesia", my: "Malaysia" };

function buatSlug(teks: string): string {
  return teks
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 200);
}

/**
 * Form kejadian. Satu komponen untuk tambah maupun ubah — bedanya cuma nilai
 * awal dan tombolnya, jadi memisahkannya hanya akan menggandakan aturan
 * validasi dan pencarian lokasi.
 *
 * Isinya dibagi tiga bagian bernama sesuai urutan kerja seorang editor:
 * menulis laporannya, menaruh waktu & tempatnya, lalu melampirkan medianya.
 */
export function FormKejadian({
  awal, aksi, sedangUbah,
}: {
  awal: NilaiAwal;
  aksi: (data: FormData) => void;
  sedangUbah: boolean;
}) {
  const [judulId, setJudulId] = useState(awal.title_id);
  const [slug, setSlug] = useState(awal.slug);
  const [slugManual, setSlugManual] = useState(Boolean(awal.slug));
  const [lokasi, setLokasi] = useState(awal.location);
  const [lat, setLat] = useState(awal.location_lat);
  const [lng, setLng] = useState(awal.location_lng);
  const [saran, setSaran] = useState<SaranTitik | null>(null);
  const [mengenali, setMengenali] = useState(false);

  // Galeri berkas baru hidup di sini, bukan di isi <input type="file">:
  // begitu form dikirim, isi input DOM langsung diserialisasi, sedangkan
  // daftar kartunya masih bisa diedit. Berkas dilampirkan dari state ini di
  // kirimFormulir() — input pemilihnya sendiri tak bernama dan tak pernah ikut
  // diserialisasi — jadi kartu yang tampil selalu persis berkas yang terkirim.
  const [mediaBaru, setMediaBaru] = useState<ItemBaruGaleri[]>([]);

  // URL objek menahan berkasnya di memori sampai dilepas. Pencabutan hanya
  // saat unmount — cleanup yang jalan di tiap perubahan daftar akan mencabut
  // URL yang masih dipakai pratinjau (termasuk tangkapan bingkai yang sedang
  // berjalan). Berkas yang dibuang manual dicabut sendiri di hapusBaru().
  const rujukMediaBaru = useRef(mediaBaru);
  useEffect(() => {
    rujukMediaBaru.current = mediaBaru;
  }, [mediaBaru]);
  useEffect(() => {
    return () => {
      rujukMediaBaru.current.forEach((b) => URL.revokeObjectURL(b.url));
    };
  }, []);

  // Hasil dibagi 10 halaman; menggulir ke dasar daftar mengambil halaman
  // berikutnya. `permintaan` membuang jawaban yang sudah ketinggalan ketika
  // pengguna terus mengetik.
  // Saran mengikuti TITIK (pin, ketikan koordinat, hasil pencarian) — bukan
  // teks lokasi. Debounce + nomor permintaan sendiri, terpisah dari pencarian
  // teks di atas, supaya keduanya bisa berjalan tanpa saling membatalkan.
  const tundaSaran = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mintaSaran = useRef(0);
  // Kolom Lokasi duduk jauh di atas peta; sehabis Pakai, gulirkan ke sana
  // supaya editor melihat teksnya terisi (tanpa ini tombolnya tampak mati).
  const lokasiRef = useRef<HTMLInputElement | null>(null);

  // Debounce pencarian teks kini milik <CariLokasi>; yang tersisa di sini
  // hanya penunda saran "ikuti pin".
  useEffect(() => () => clearTimeout(tundaSaran.current), []);

  // Setiap titik berubah (termasuk nilai awal saat form dibuka): kenali nama
  // tempatnya dan tawarkan lewat tombol — tidak diisi otomatis, editor yang
  // memutuskan. Titik yang tidak dikenali (tengah laut) membersihkan saran.
  // Semua setState di dalam callback timer (bukan badan efek) supaya tidak
  // memicu render beruntun.
  useEffect(() => {
    clearTimeout(tundaSaran.current);
    tundaSaran.current = setTimeout(async () => {
      const id = ++mintaSaran.current;
      const a = Number(lat);
      const b = Number(lng);
      if (lat.trim() === "" || lng.trim() === "" || !Number.isFinite(a) || !Number.isFinite(b)) {
        if (id !== mintaSaran.current) return;
        setSaran(null);
        setMengenali(false);
        return;
      }
      if (id === mintaSaran.current) setMengenali(true);
      try {
        const r = await fetch(`/api/lokasi/balik?lat=${a}&lng=${b}`);
        const j = r.ok ? await r.json() : null;
        if (id !== mintaSaran.current) return;
        const s = j?.saran;
        setSaran(s?.ada ? { nama: String(s.nama), negara: s.negara ?? null } : null);
      } catch {
        if (id === mintaSaran.current) setSaran(null);
      } finally {
        if (id === mintaSaran.current) setMengenali(false);
      }
    }, 700);
    return () => clearTimeout(tundaSaran.current);
  }, [lat, lng]);

  // Lampirkan berkas galeri dari state, bukan dari input berkasnya. Ini juga
  // melepas ketergantungan pada mutasi input.files lewat DataTransfer, yang
  // tidak didukung semua peramban.
  function kirimFormulir(data: FormData) {
    for (const b of mediaBaru) data.append("media_files", b.berkas);
    return aksi(data);
  }

  return (
    <form action={kirimFormulir}>
      <Bagian nomor="01" judul="Laporan">
        <Isian
          label="Judul (ID)"
          nama="title_id"
          wajib
          value={judulId}
          onChange={(e) => {
            const v = e.target.value;
            setJudulId(v);
            if (!slugManual) {
              setSlug(buatSlug(v));
            }
          }}
        />
        <Isian label="Judul (EN)" nama="title_en" wajib nilai={awal.title_en} />
        <Isian
          label="Slug"
          nama="slug"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugManual(e.target.value.trim().length > 0);
          }}
          mono
          bantuan="Dipakai di alamat permalink. Dibuat otomatis dari judul Indonesia, atau bisa disesuaikan manual."
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <IsianPanjang label="Deskripsi (ID)" nama="description_id" nilai={awal.description_id}
                        bantuan="Ringkasan kejadian dalam Bahasa Indonesia." />
          <IsianPanjang label="Deskripsi (EN)" nama="description_en" nilai={awal.description_en}
                        bantuan="English summary of the event." />
        </div>
      </Bagian>

      <Bagian nomor="02" judul="Waktu & tempat">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="event_date" className="cms-mata mb-1.5 block">
              Tanggal kejadian<Wajib />
            </label>
            <DatePicker
              id="event_date"
              nama="event_date"
              nilai={awal.event_date}
              wajib
            />
          </div>
          <div>
            <label htmlFor="orientation" className="cms-mata mb-1.5 block">Orientasi kartu</label>
            <select id="orientation" name="orientation" defaultValue={awal.orientation} className="cms-isian w-full">
              <option value="landscape">Landscape — foto di bawah teks</option>
              <option value="horizontal">Horizontal — foto memenuhi kartu</option>
            </select>
            <Bantuan>Menentukan bentuk kartunya di korsel halaman depan.</Bantuan>
          </div>
        </div>

        {/* Keadaan tayang berdiri sendiri, bukan diselipkan di antara isian
            teks: ia bukan properti kejadian melainkan keputusan apakah publik
            sudah boleh melihatnya. */}
        <div>
          <label htmlFor="status" className="cms-mata mb-1.5 block">Keadaan tayang</label>
          <select id="status" name="status" defaultValue={awal.status} className="cms-isian w-full sm:max-w-[320px]">
            <option value="draft">Draft — hanya terlihat di CMS</option>
            <option value="published">Publish — tayang di situs publik</option>
          </select>
          <Bantuan>
            Draft tidak muncul di korsel, peta, sitemap, maupun permalink-nya —
            permalink kejadian draft menjawab 404 sampai dipublikasikan.
          </Bantuan>
        </div>

        <CariLokasi
          label="Lokasi" nama="location" nilai={lokasi} wajib
          onUbah={setLokasi}
          onPilih={(n, a, b) => { setLokasi(n); setLat(String(a)); setLng(String(b)); }}
          ref={lokasiRef}
          bantuan="Pilih dari hasil pencarian supaya provinsinya terbaca — itu yang menentukan angka di peta dan pulau pada kartu."
        />

        {/* Pemilih titik langsung di peta — jalur ketiga di samping hasil
            pencarian dan isian koordinat manual. Ketiganya menulis ke dua
            state lat/lng yang sama, jadi saling mengikuti. */}
        <div>
          <p className="cms-mata mb-1.5">Pilih lokasi di peta</p>
          <div className="overflow-hidden rounded-[3px] border border-[var(--garis-tegas)]">
            <PetaLokasi lat={lat} lng={lng}
                        onPilih={(a, b) => { setLat(a.toFixed(6)); setLng(b.toFixed(6)); }} />
          </div>
          <Bantuan>
            Tekan peta untuk menaruh titik, geser penandanya untuk merapikan.
            Hasil pencarian dan isian koordinat ikut menggerakkan peta.
          </Bantuan>

          {/* Saran mengikuti pin: nama tempat tepat di titik itu (desa
              Simontini, atau kampung/jalan OSM bila di luar poligon desa).
              Tidak diisi otomatis — editor menekan Pakai bila cocok. Titik di
              luar Indonesia diberi peringatan, bukan disembunyikan: pin di
              perbatasan memang bisa jatuh di negara tetangga. */}
          {mengenali && <p className="cms-mata mt-2">Mengenali titik…</p>}
          {saran !== null && !mengenali && (
            <div className="cms-baris mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 p-2.5">
              <p className="min-w-0 flex-1 text-[13px] text-[var(--redup)]">
                <span className="cms-mata mr-2">Di titik ini</span>
                {saran.nama}
              </p>
              <button type="button"
                      onClick={() => {
                        setLokasi(saran.nama);
                        // Kolomnya di luar layar (di atas peta) — bawa ke
                        // pandangan supaya jelas tombolnya bekerja.
                        lokasiRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                        lokasiRef.current?.focus({ preventScroll: true });
                      }}
                      className="cms-tombol cms-tombol--kecil">
                Pakai
              </button>
            </div>
          )}
          {saran !== null && saran.negara !== null && saran.negara !== "id" && (
            <p className="mt-2 text-[12.5px] leading-[1.5] text-[var(--api)]">
              Titik ini di luar Indonesia ({NEGARA[saran.negara] ?? saran.negara.toUpperCase()}) —
              periksa pin sebelum disimpan.
            </p>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <IsianKoordinat label="Latitude" nama="location_lat" nilai={lat} onUbah={setLat} wajib />
          <IsianKoordinat label="Longitude" nama="location_lng" nilai={lng} onUbah={setLng} wajib />
        </div>
      </Bagian>

      <Bagian nomor="03" judul="Media">
        <Galeri tersimpan={awal.galeri} baru={mediaBaru} setBaru={setMediaBaru} />
      </Bagian>

      {/* Bilah aksi menempel di dasar layar: form ini panjang, dan tombol simpan
          tidak boleh ikut hilang ke bawah saat editor sedang di bagian media. */}
      <AksiSimpan sedangUbah={sedangUbah} />
    </form>
  );
}

/** Bilah aksi menempel di dasar layar: form ini panjang, dan tombol simpan
 *  tidak boleh ikut hilang ke bawah saat editor sedang di bagian media.
 *  `useFormStatus` harus di komponen anak — ia hanya tahu status <form> di
 *  atasnya di pohon, dan di komponen ini belum ada <form> yang melingkupinya. */
function AksiSimpan({ sedangUbah }: { sedangUbah: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="sticky bottom-0 -mx-5 mt-8 flex flex-wrap items-center gap-3 border-t
                    border-[var(--garis-tegas)] bg-[var(--kertas)] px-5 py-3 lg:-mx-10 lg:px-10">
      {pending && <BilahUnggah />}
      <button type="submit" disabled={pending} aria-busy={pending}
              className="cms-tombol cms-tombol--utama">
        {pending && <Pemuat />}
        {sedangUbah ? "Simpan perubahan" : "Tambah kejadian"}
      </button>
      <Link href="/admin/kejadian" className="cms-mata px-1 underline-offset-4 hover:underline">
        Batal
      </Link>
    </div>
  );
}

/** Satu bagian form. Nomornya menandai urutan kerja, dan urutannya memang
 *  berarti: lokasi menentukan peta, media menentukan tampilan kartunya. */
function Bagian({ nomor, judul, children }: { nomor: string; judul: string; children: React.ReactNode }) {
  return (
    <section className="max-w-[820px] border-b border-[var(--garis)] py-7 first:pt-0">
      <div className="mb-5 flex items-baseline gap-3">
        <span aria-hidden="true" className="cms-angka text-[13px] text-[var(--lirih)]">{nomor}</span>
        <h2 className="cms-judul text-[15px]">{judul}</h2>
      </div>
      <div className="grid gap-5">{children}</div>
    </section>
  );
}

type ItemBaruGaleri = {
  id: string;
  berkas: File;
  nama: string;
  url: string;
  video: boolean;
  /** Bingkai pertama video, ditangkap di peramban — poster pratinjau sebelum tersimpan. */
  bingkai?: string;
  keterangan?: string;
};

/**
 * Ambil satu bingkai video sebagai gambar statis, langsung di peramban.
 *
 * Poster server baru ada SETELAH disimpan; sebelum itu pratinjau galeri tetap
 * butuh sesuatu yang murah — <video> memaksa peramban mengunduh metadata video
 * untuk sekadar thumbnail, dan itu yang mau dihindari. Gagal (kodek tidak
 * didukung, peramban kuno, video rusak) mengembalikan null dan pemanggil
 * kembali ke <video> seperti dulu.
 */
function bingkaiLokal(url: string): Promise<string | null> {
  return new Promise((selesai) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    // `beres` boleh menyebut `jeda` sebelum deklarasi: ia baru terpanggil
    // lewat event — selalu setelah baris `const jeda` selesai dieksekusi.
    const beres = (hasil: string | null) => {
      clearTimeout(jeda);
      video.removeAttribute("src");
      video.load();
      selesai(hasil);
    };
    const jeda = setTimeout(() => beres(null), 8_000);

    video.addEventListener(
      "seeked",
      () => {
        try {
          const kanvas = document.createElement("canvas");
          const lebar = video.videoWidth || 340;
          const tinggi = video.videoHeight || Math.round((lebar * 9) / 16);
          const skala = Math.min(1, 340 / lebar);
          kanvas.width = Math.max(1, Math.round(lebar * skala));
          kanvas.height = Math.max(1, Math.round(tinggi * skala));
          kanvas.getContext("2d")?.drawImage(video, 0, 0, kanvas.width, kanvas.height);
          beres(kanvas.toDataURL("image/jpeg", 0.75));
        } catch {
          beres(null);
        }
      },
      { once: true },
    );
    video.addEventListener("error", () => beres(null), { once: true });
    video.addEventListener(
      "loadeddata",
      () => {
        // Video lebih pendek dari 0,5 detik tetap kebagian bingkai.
        video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
      },
      { once: true },
    );

    video.src = url;
    video.load();
  });
}

/**
 * Galeri media: beberapa foto/video per kejadian.
 *
 * Yang sudah tersimpan dirender sebagai kotak centang `keep_media` bernilai
 * INDEKS — melepas centang berarti berkasnya dibuang saat disimpan. Tiap berkas
 * punya isian `media_desc_<indeks>` (tersimpan) / `media_desc_baru` (baru,
 * dijumlah urut sama dengan berkas baru) untuk keterangannya. Berkas baru
 * masuk lewat satu input multiple yang TERAKUMULASI ke state induk tanpa
 * menghapus pilihan sebelumnya; menghapus kartu cukup membuangnya dari state.
 *
 * Selama pengiriman pending semua kontrol galeri dikunci: isi form sudah
 * diserialisasi saat tombol simpan ditekan, jadi melepas centang atau
 * membatalkan berkas setelahnya tidak mengubah kiriman yang sedang terbang —
 * tanpa kunci ini hapus-media tampak "tidak berfungsi" karena hasil simpannya
 * memuat lagi media yang sudah dibuang dari layar.
 */
function Galeri({
  tersimpan, baru, setBaru,
}: {
  tersimpan: ItemMedia[];
  baru: ItemBaruGaleri[];
  setBaru: Dispatch<SetStateAction<ItemBaruGaleri[]>>;
}) {
  const { pending: mengirim } = useFormStatus();
  const inputRef = useRef<HTMLInputElement>(null);

  function pilih(berkasList: FileList | null) {
    if (!berkasList || berkasList.length === 0) return;

    const tambahan: ItemBaruGaleri[] = Array.from(berkasList).map((f) => ({
      id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`,
      berkas: f,
      nama: f.name,
      url: URL.createObjectURL(f),
      video: f.type.startsWith("video/"),
      keterangan: "",
    }));

    // Pemilihnya dikosongkan supaya berkas yang sama bisa dipilih lagi di
    // pemilihan berikutnya. Daftar kartunya hidup di state induk — yang dikirim
    // ke server pun dari sana (lihat kirimFormulir), bukan dari isi input ini.
    if (inputRef.current) inputRef.current.value = "";

    setBaru((lama) => [...lama, ...tambahan]);

    // Poster pratinjau untuk video baru ditangkap di belakang; bila berhasil,
    // kartu video berganti dari <video> ke gambar statis tanpa perlu disimpan.
    for (const item of tambahan) {
      if (!item.video) continue;
      void bingkaiLokal(item.url).then((dataUrl) => {
        if (!dataUrl) return;
        setBaru((lama) =>
          lama.map((b) => (b.id === item.id ? { ...b, bingkai: dataUrl } : b)),
        );
      });
    }
  }

  function hapusBaru(id: string) {
    const target = baru.find((b) => b.id === id);
    if (target) URL.revokeObjectURL(target.url);
    setBaru((lama) => lama.filter((b) => b.id !== id));
  }

  return (
    <div>
      <label htmlFor="media_files" className="cms-mata mb-1.5 block">
        Galeri media
      </label>

      {tersimpan.length > 0 && (
        <>
          <p className="mb-2 text-[12.5px] text-[var(--redup)]">
            Tersimpan sekarang — lepas centang untuk membuangnya saat disimpan.
          </p>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {tersimpan.map((m, i) => (
              <div key={i}
                   className="overflow-hidden rounded-[3px] border border-[var(--garis-tegas)]
                              bg-[var(--papan)]">
                {/* Kotak centang dan gambarnya satu label; isian keterangan
                    sengaja DI LUAR label — label yang menaungi dua kontrol
                    membuat klik pada isian ikut menyalakan centangnya. */}
                <label className="group relative block cursor-pointer
                                  has-[:focus-visible]:outline has-[:focus-visible]:outline-2
                                  has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--limau)]
                                  has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
                  <input type="checkbox" name="keep_media" value={i} defaultChecked
                         disabled={mengirim} className="peer sr-only" />

                  {/* Yang akan dibuang diredupkan dan diberi cap; tanpa penanda
                      seperti ini, melepas centang tidak terlihat sama sekali. */}
                  <div aria-hidden="true"
                       className="pointer-events-none absolute inset-0 z-[1] bg-[var(--jelaga)]/55
                                  transition-opacity peer-checked:opacity-0" />
                  <span aria-hidden="true"
                        className="cms-cap absolute top-1.5 left-1.5 z-[2] border-white bg-[var(--api)] text-white
                                   opacity-100 transition-opacity peer-checked:opacity-0">
                    Dibuang
                  </span>

                  {m.jenis === "video" ? (
                    m.poster ? (
                      <div className="relative">
                        <img src={m.poster} alt={`Media ${i + 1}`} className="h-[96px] w-full object-cover" />
                        <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
                          <span className="flex size-6 items-center justify-center rounded-full bg-black/60 shadow-xs">
                            <svg viewBox="0 0 20 20" fill="currentColor" className="ml-0.5 size-3">
                              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                            </svg>
                          </span>
                        </span>
                      </div>
                    ) : (
                      <div className="flex h-[96px] w-full flex-col items-center justify-center bg-[var(--kertas)] text-[var(--redup)]">
                        <svg viewBox="0 0 20 20" fill="currentColor" className="size-6 opacity-40">
                          <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                        </svg>
                        <span className="cms-mata mt-1 text-[10px]">Video {i + 1}</span>
                      </div>
                    )
                  ) : (
                    <img src={m.url} alt={`Media ${i + 1}`} className="h-[96px] w-full object-cover" />
                  )}

                  <p className="cms-mata flex items-center justify-between px-2 py-1.5">
                    <span>{m.jenis === "video" ? "Video" : "Foto"}</span>
                    <span className="cms-angka text-[11px] text-[var(--jelaga)]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </p>
                </label>

                <div className="border-t border-[var(--garis)] bg-[var(--kertas)] p-2">
                  <label htmlFor={`media_desc_${i}`} className="cms-mata mb-1 block text-[10px] text-[var(--redup)]">
                    Keterangan media
                  </label>
                  <input
                    id={`media_desc_${i}`}
                    type="text"
                    name={`media_desc_${i}`}
                    defaultValue={m.keterangan ?? ""}
                    placeholder="Deskripsi / alt teks…"
                    aria-label={`Keterangan media ${i + 1}`}
                    className="w-full rounded-[2px] border border-[var(--garis)] bg-white px-2 py-1 text-[11.5px] text-[var(--jelaga)]
                               outline-none placeholder:text-[var(--lirih)] focus:border-[var(--limau)]"
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <input
        ref={inputRef}
        id="media_files"
        type="file"
        multiple
        disabled={mengirim}
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
        onChange={(e) => pilih(e.target.files)}
        className="cms-isian w-full disabled:opacity-60"
      />
      <Bantuan>
        Boleh beberapa foto/video sekaligus, maksimal 100 MB per berkas. Memilih berkas
        lagi akan menambah ke daftar tanpa menghapus pilihan sebelumnya.
      </Bantuan>

      {baru.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-[12.5px] font-semibold text-[var(--hijau)]">
            Berkas baru terpilih ({baru.length}):
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {baru.map((b) => (
              <div
                key={b.id}
                className="group relative overflow-hidden rounded-[3px] border border-[var(--hijau)] bg-[var(--papan)]"
              >
                <button
                  type="button"
                  onClick={() => hapusBaru(b.id)}
                  disabled={mengirim}
                  title="Batalkan berkas ini"
                  aria-label={`Batalkan ${b.nama}`}
                  className="absolute top-1 right-1 z-[3] grid size-5 cursor-pointer place-items-center rounded-full
                             bg-black/60 text-white transition hover:bg-[var(--api)]
                             disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor" className="size-3">
                    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                  </svg>
                </button>

                <span className="cms-cap absolute top-1 left-1 z-[2] border-[var(--hijau)] bg-[var(--papan)] text-[var(--hijau)] text-[9px]">
                  Baru
                </span>

                {b.video ? (
                  b.bingkai ? (
                    <div className="relative">
                      <img src={b.bingkai} alt="" className="h-[96px] w-full object-cover" />
                      <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
                        <span className="flex size-6 items-center justify-center rounded-full bg-black/60 shadow-xs">
                          <svg viewBox="0 0 20 20" fill="currentColor" className="ml-0.5 size-3">
                            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                          </svg>
                        </span>
                      </span>
                    </div>
                  ) : (
                    <div className="flex h-[96px] w-full flex-col items-center justify-center bg-[var(--kertas)] text-[var(--redup)]">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="size-6 opacity-40">
                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                      </svg>
                      <span className="cms-mata mt-1 text-[10px]">Video</span>
                    </div>
                  )
                ) : (
                  <img src={b.url} alt="" className="h-[96px] w-full object-cover" />
                )}
                <p className="truncate px-2 pt-1.5 text-[11px] text-[var(--redup)]" title={b.nama}>
                  {b.nama}
                </p>

                <div className="border-t border-[var(--garis)] bg-[var(--kertas)] p-2">
                  <label htmlFor={`media_desc_baru_${b.id}`} className="cms-mata mb-1 block text-[10px] text-[var(--redup)]">
                    Keterangan media
                  </label>
                  <input
                    id={`media_desc_baru_${b.id}`}
                    type="text"
                    name="media_desc_baru"
                    value={b.keterangan ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBaru((lama) =>
                        lama.map((item) => (item.id === b.id ? { ...item, keterangan: val } : item)),
                      );
                    }}
                    placeholder="Deskripsi / alt teks…"
                    aria-label={`Keterangan ${b.nama}`}
                    className="w-full rounded-[2px] border border-[var(--garis)] bg-white px-2 py-1 text-[11.5px] text-[var(--jelaga)]
                               outline-none placeholder:text-[var(--lirih)] focus:border-[var(--hijau)]"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
