"use client";

import { useActionState, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Wajib, Bantuan, Isian, IsianPanjang, IsianKoordinat } from "../isian";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { kabari } from "../toko";
import { PetaLokasi } from "../peta-lokasi";
import { CariLokasi } from "../cari-lokasi";
import { BilahUnggah } from "@/components/bilah-unggah";
import { Pemuat } from "../pemuat";
import { DatePicker } from "@/components/ui/date-picker";
import { Kartu } from "../ruang";
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
  /** Sukses → id kejadian; gagal → galat untuk bilah simpan. */
  aksi: (data: FormData) => Promise<{ ok: false; galat: string } | { ok: true; id: number }>;
  sedangUbah: boolean;
}) {
  const router = useRouter();
  const [judulId, setJudulId] = useState(awal.title_id);
  const [slug, setSlug] = useState(awal.slug);
  const [slugManual, setSlugManual] = useState(Boolean(awal.slug));
  const [lokasi, setLokasi] = useState(awal.location);
  const [lat, setLat] = useState(awal.location_lat);
  const [lng, setLng] = useState(awal.location_lng);
  const [saran, setSaran] = useState<SaranTitik | null>(null);
  const [mengenali, setMengenali] = useState(false);

  // Galeri media dikelola dalam satu state berurutan (baik media tersimpan maupun baru):
  // pengguna bisa mengatur urutan (geser kiri/kanan, drag & drop, atau 'Jadikan Pertama'),
  // dan item nomor 01 menjadi media utama yang tampil pertama di korsel/kartu.
  const [daftarMedia, setDaftarMedia] = useState<ItemGaleriForm[]>(() => {
    return awal.galeri.map((m, i) => ({
      id: `tersimpan-${i}`,
      tipe: "tersimpan" as const,
      indeksAsli: i,
      path: m.path ?? "",
      jenis: m.jenis,
      url: m.url,
      poster: m.poster,
      keterangan: m.keterangan ?? "",
      dibuang: false,
    }));
  });

  const rujukDaftarMedia = useRef(daftarMedia);
  useEffect(() => {
    rujukDaftarMedia.current = daftarMedia;
  }, [daftarMedia]);
  useEffect(() => {
    return () => {
      rujukDaftarMedia.current.forEach((b) => {
        if (b.tipe === "baru" && b.url) {
          URL.revokeObjectURL(b.url);
        }
      });
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

  // Lampirkan berkas galeri dan urutan eksplisit dari state.
  function kirimFormulir(data: FormData) {
    const aktif = daftarMedia.filter((m) => !m.dibuang);

    let baruIdx = 0;
    for (const item of aktif) {
      if (item.tipe === "baru" && item.berkas) {
        data.append("media_files", item.berkas);
        data.append("media_desc_baru", item.keterangan || "");
        data.append("media_urutan", `baru:${baruIdx}`);
        baruIdx++;
      } else if (item.tipe === "tersimpan" && item.indeksAsli !== undefined) {
        data.append("media_urutan", `lama:${item.indeksAsli}`);
        data.append(`media_desc_${item.indeksAsli}`, item.keterangan || "");
        data.append("keep_media", String(item.indeksAsli));
      }
    }

    return aksi(data);
  }

  // `kiriman` dipakai sebagai defaultValue isian tak terkendali: React 19
  // me-reset form setelah aksi selesai, termasuk yang gagal — tanpa ini
  // Judul EN, deskripsi, orientasi, dan status kembali ke nilai awal.
  const [gagal, kirim] = useActionState(
    async (_s: { galat: string; kiriman: FormData } | null, data: FormData) => {
      const hasil = await kirimFormulir(data);
      if (!hasil.ok) return { galat: hasil.galat, kiriman: data };
      // Simpan = tetap di form ini; tambah = buka kejadian barunya.
      if (sedangUbah) {
        kabari("Perubahan disimpan.");
        router.refresh();
      } else {
        kabari("Kejadian ditambahkan sebagai " + (data.get("status") === "published" ? "tayang." : "draft."));
        router.push(`/admin/kejadian/${hasil.id}`);
        // Layout (daftar) tidak ikut dirender saat pindah halaman — segarkan.
        router.refresh();
      }
      return null;
    },
    null,
  );
  const nilaiKirim = (nama: string, cadangan: string) => {
    const v = gagal?.kiriman.get(nama);
    return typeof v === "string" ? v : cadangan;
  };

  return (
    <form action={kirim} className="grid gap-6">
      <Bagian
        nomor="01"
        judul="Laporan"
        deskripsi="Judul laporan dalam dua bahasa, tautan permanen (slug), dan ringkasan isi kejadian."
      >
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
        <Isian label="Judul (EN)" nama="title_en" wajib nilai={nilaiKirim("title_en", awal.title_en)} />
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
          <IsianPanjang label="Deskripsi (ID)" nama="description_id" nilai={nilaiKirim("description_id", awal.description_id)}
                        bantuan="Ringkasan kejadian dalam Bahasa Indonesia." />
          <IsianPanjang label="Deskripsi (EN)" nama="description_en" nilai={nilaiKirim("description_en", awal.description_en)}
                        bantuan="English summary of the event." />
        </div>
      </Bagian>

      <Bagian
        nomor="02"
        judul="Waktu & tempat"
        deskripsi="Tanggal kejadian, orientasi tampilan kartu, visibilitas tayang, dan penentuan koordinat peta."
      >
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
            <select id="orientation" name="orientation" defaultValue={nilaiKirim("orientation", awal.orientation)} className="cms-isian w-full">
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
          <select id="status" name="status" defaultValue={nilaiKirim("status", awal.status)} className="cms-isian w-full sm:max-w-[320px]">
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
          <div className="overflow-hidden rounded-[var(--jari)] border border-[var(--garis-tegas)]">
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

      <Bagian
        nomor="03"
        judul="Media dokumentasi"
        deskripsi="Foto atau rekaman video lapangan. Berkas nomor 01 otomatis tampil sebagai gambar sampul di beranda."
      >
        <Galeri daftar={daftarMedia} setDaftar={setDaftarMedia} />
      </Bagian>

      {/* Bilah aksi menempel di dasar layar: form ini panjang, dan tombol simpan
          tidak boleh ikut hilang ke bawah saat editor sedang di bagian media. */}
      <AksiSimpan sedangUbah={sedangUbah} galat={gagal?.galat ?? null} />
    </form>
  );
}

/** Bilah aksi menempel di dasar layar: form ini panjang, dan tombol simpan
 *  tidak boleh ikut hilang ke bawah saat editor sedang di bagian media.
 *  `useFormStatus` harus di komponen anak — ia hanya tahu status <form> di
 *  atasnya di pohon, dan di komponen ini belum ada <form> yang melingkupinya. */
function AksiSimpan({ sedangUbah, galat }: { sedangUbah: boolean; galat: string | null }) {
  const { pending } = useFormStatus();
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-6 flex flex-wrap items-center justify-between gap-3 border-t
                    border-[var(--garis)] bg-[var(--kertas)]/90 backdrop-blur-md px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      {pending && <div className="w-full"><BilahUnggah /></div>}
      {/* Di bilah simpan, tempat mata editor berada saat menekan tombol. */}
      {galat && !pending && (
        <p role="alert" className="cms-galat w-full">{galat}</p>
      )}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} aria-busy={pending}
                className="cms-tombol cms-tombol--utama">
          {pending && <Pemuat />}
          {sedangUbah ? "Simpan perubahan" : "Tambah kejadian"}
        </button>
        <Link href="/admin/kejadian" className="cms-tombol cms-tombol--hantu">
          Batal
        </Link>
      </div>
      <p className="hidden text-[12px] text-[var(--lirih)] sm:block">
        {sedangUbah ? "Perubahan langsung tersimpan ke sistem." : "Kejadian baru akan dibuat sebagai draft."}
      </p>
    </div>
  );
}

/** Satu bagian form. Nomornya menandai urutan kerja, dan urutannya memang
 *  berarti: lokasi menentukan peta, media menentukan tampilan kartunya. */
function Bagian({
  nomor,
  judul,
  deskripsi,
  children,
}: {
  nomor: string;
  judul: string;
  deskripsi?: string;
  children: React.ReactNode;
}) {
  return (
    <Kartu
      judul={
        <div className="flex items-center gap-2">
          <span className="cms-cap font-mono font-bold tracking-wider">{nomor}</span>
          <span>{judul}</span>
        </div>
      }
      deskripsi={deskripsi}
    >
      <div className="grid gap-5">{children}</div>
    </Kartu>
  );
}

export type ItemGaleriForm = {
  id: string;
  tipe: "tersimpan" | "baru";
  indeksAsli?: number;
  path?: string;
  berkas?: File;
  nama?: string;
  jenis: "gambar" | "video";
  url: string;
  poster?: string;
  bingkai?: string;
  keterangan: string;
  dibuang?: boolean;
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
 * Galeri media interaktif dengan kemampuan menentukan urutan tampil:
 * - Media nomor 01 otomatis menjadi media utama yang tampil pertama di korsel/kartu publik.
 * - Pengguna bisa menggeser kartu dengan drag-and-drop, tombol panah (← / →), atau tombol pintas "★ Tampil pertama".
 * - Berkas baru maupun tersimpan dikelola bersama dalam satu daftar terurut.
 */
function Galeri({
  daftar,
  setDaftar,
}: {
  daftar: ItemGaleriForm[];
  setDaftar: Dispatch<SetStateAction<ItemGaleriForm[]>>;
}) {
  const { pending: mengirim } = useFormStatus();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [sedangTarikBerkas, setSedangTarikBerkas] = useState(false);

  function pilih(berkasList: FileList | null) {
    if (!berkasList || berkasList.length === 0) return;

    const tambahan: ItemGaleriForm[] = Array.from(berkasList).map((f) => ({
      id: `baru-${f.name}-${f.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tipe: "baru",
      berkas: f,
      nama: f.name,
      jenis: f.type.startsWith("video/") ? "video" : "gambar",
      url: URL.createObjectURL(f),
      keterangan: "",
    }));

    if (inputRef.current) inputRef.current.value = "";

    setDaftar((lama) => [...lama, ...tambahan]);

    // Poster pratinjau untuk video baru ditangkap di belakang
    for (const item of tambahan) {
      if (item.jenis !== "video") continue;
      void bingkaiLokal(item.url).then((dataUrl) => {
        if (!dataUrl) return;
        setDaftar((lama) =>
          lama.map((b) => (b.id === item.id ? { ...b, bingkai: dataUrl } : b)),
        );
      });
    }
  }

  function hapusBaru(id: string) {
    const target = daftar.find((b) => b.id === id);
    if (target?.url) URL.revokeObjectURL(target.url);
    setDaftar((lama) => lama.filter((b) => b.id !== id));
  }

  function toggleBuang(id: string) {
    setDaftar((lama) =>
      lama.map((b) => (b.id === id ? { ...b, dibuang: !b.dibuang } : b)),
    );
  }

  function jadikanPertama(id: string) {
    setDaftar((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      if (idx <= 0) return prev;
      const target = prev[idx];
      const sisa = prev.filter((_, i) => i !== idx);
      return [target, ...sisa];
    });
  }

  function geser(id: string, arah: -1 | 1) {
    setDaftar((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      if (idx < 0) return prev;
      const targetIdx = idx + arah;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const salinan = [...prev];
      const temp = salinan[targetIdx];
      salinan[targetIdx] = salinan[idx];
      salinan[idx] = temp;
      return salinan;
    });
  }

  function ubahKeterangan(id: string, teks: string) {
    setDaftar((prev) =>
      prev.map((b) => (b.id === id ? { ...b, keterangan: teks } : b)),
    );
  }

  function handleDragStart(e: React.DragEvent, id: string) {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverId !== id) {
      setDragOverId(id);
    }
  }

  function handleDragLeave(_e: React.DragEvent, id: string) {
    if (dragOverId === id) {
      setDragOverId(null);
    }
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    setDragOverId(null);
    const sourceId = draggedId || e.dataTransfer.getData("text/plain");
    if (!sourceId || sourceId === targetId) return;

    setDaftar((prev) => {
      const sourceIdx = prev.findIndex((m) => m.id === sourceId);
      const targetIdx = prev.findIndex((m) => m.id === targetId);
      if (sourceIdx < 0 || targetIdx < 0) return prev;

      const salinan = [...prev];
      const [item] = salinan.splice(sourceIdx, 1);
      salinan.splice(targetIdx, 0, item);
      return salinan;
    });
    setDraggedId(null);
  }

  function handleDragEnd() {
    setDraggedId(null);
    setDragOverId(null);
  }

  const aktif = daftar.filter((m) => !m.dibuang);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor="media_files" className="cms-mata block">
          Galeri Media ({aktif.length} aktif)
        </label>
        <span className="text-[12px] text-[var(--redup)]">
          Media nomor <strong>01</strong> otomatis tampil pertama di beranda & kartu.
        </span>
      </div>

      {/* Area pilih & drop berkas */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setSedangTarikBerkas(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setSedangTarikBerkas(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setSedangTarikBerkas(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            pilih(e.dataTransfer.files);
          }
        }}
        className={`rounded-[var(--jari)] border-2 border-dashed p-4 text-center transition-colors ${
          sedangTarikBerkas
            ? "border-[var(--limau)] bg-[var(--limau)]/10"
            : "border-[var(--garis)] bg-[var(--papan)]"
        }`}
      >
        <p className="text-[13px] font-medium text-[var(--jelaga)]">
          Tarik & lepas foto/video ke sini, atau pilih berkas dari perangkat
        </p>
        <div className="mt-2 flex justify-center">
          <input
            ref={inputRef}
            id="media_files"
            type="file"
            multiple
            disabled={mengirim}
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
            onChange={(e) => pilih(e.target.files)}
            className="cms-isian w-full max-w-sm text-[12px] disabled:opacity-60"
          />
        </div>
        <Bantuan>
          Format JPG, PNG, WEBP, MP4, MOV, WEBM (maksimal 100 MB per berkas). Menambah berkas baru tidak menghapus daftar yang ada.
        </Bantuan>
      </div>

      {/* Daftar kartu media berurutan */}
      {daftar.length > 0 && (
        <div className="mt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--garis)] pb-2">
            <p className="cms-mata text-[var(--jelaga)]">
              Urutan Tampilan ({aktif.length} aktif{daftar.length > aktif.length ? `, ${daftar.length - aktif.length} dibuang` : ""})
            </p>
            <p className="text-[11.5px] text-[var(--redup)]">
              Gunakan drag & drop, tombol panah (← / →), atau tombol <strong>★ Pertama</strong> untuk mengatur urutan.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {daftar.map((m) => {
              const activeIndex = aktif.findIndex((a) => a.id === m.id);
              const isFirst = activeIndex === 0;
              const isLast = activeIndex === aktif.length - 1;
              const isBeingDragged = draggedId === m.id;
              const isDragTarget = dragOverId === m.id;

              return (
                <div
                  key={m.id}
                  draggable={!mengirim && !m.dibuang}
                  onDragStart={(e) => handleDragStart(e, m.id)}
                  onDragOver={(e) => handleDragOver(e, m.id)}
                  onDragLeave={(e) => handleDragLeave(e, m.id)}
                  onDrop={(e) => handleDrop(e, m.id)}
                  onDragEnd={handleDragEnd}
                  className={`group relative flex flex-col overflow-hidden rounded-[var(--jari)] transition-all ${
                    m.dibuang
                      ? "border border-dashed border-[var(--garis)] bg-[var(--kertas)] opacity-60"
                      : isFirst
                        ? "border-2 border-[var(--api)] bg-[var(--papan)] shadow-md ring-2 ring-[var(--api)]/20"
                        : "border border-[var(--garis-tegas)] bg-[var(--papan)] hover:border-[var(--redup)]"
                  } ${isBeingDragged ? "opacity-30 scale-95" : ""} ${
                    isDragTarget ? "ring-2 ring-[var(--limau)] scale-[1.02]" : ""
                  }`}
                >
                  {/* Bilah status kartu */}
                  <div className="flex items-center justify-between border-b border-[var(--garis)] bg-[var(--papan)] px-2.5 py-1.5">
                    <div className="flex items-center gap-1.5">
                      {m.dibuang ? (
                        <span className="cms-cap border-[var(--api)] bg-[var(--api)] text-white">
                          Dibuang
                        </span>
                      ) : isFirst ? (
                        <span className="cms-cap border-[var(--api)] bg-[var(--api)] text-white font-bold tracking-wider">
                          ★ 01 · TAMPIL PERTAMA
                        </span>
                      ) : (
                        <span className="cms-cap border-[var(--garis-tegas)] bg-[var(--papan)] text-[var(--jelaga)] font-semibold">
                          <span className="cms-angka font-bold">
                            {String(activeIndex + 1).padStart(2, "0")}
                          </span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {m.tipe === "baru" ? (
                        <span className="cms-cap border-[var(--hijau)] bg-emerald-50 text-[var(--hijau)] text-[9px]">
                          Baru
                        </span>
                      ) : (
                        <span className="cms-cap border-[var(--garis)] text-[var(--redup)] text-[9px]">
                          Tersimpan
                        </span>
                      )}
                      <span className="cms-cap border-transparent text-[var(--redup)] text-[9px] uppercase">
                        {m.jenis === "video" ? "Video" : "Foto"}
                      </span>
                    </div>
                  </div>

                  {/* Thumbnail / Pratinjau */}
                  <div className="relative h-[110px] w-full bg-[var(--jelaga)]">
                    {m.jenis === "video" ? (
                      m.poster || m.bingkai ? (
                        <div className="relative h-full w-full">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={m.poster || m.bingkai}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                          <span
                            aria-hidden="true"
                            className="absolute inset-0 flex items-center justify-center bg-black/25 text-white"
                          >
                            <span className="flex size-7 items-center justify-center rounded-full bg-black/70 shadow-sm">
                              <svg viewBox="0 0 20 20" fill="currentColor" className="ml-0.5 size-3.5">
                                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                              </svg>
                            </span>
                          </span>
                        </div>
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center bg-[var(--kertas)] text-[var(--redup)]">
                          <svg viewBox="0 0 20 20" fill="currentColor" className="size-6 opacity-40">
                            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                          </svg>
                          <span className="cms-mata mt-1 text-[10px]">Video</span>
                        </div>
                      )
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.url} alt="" className="h-full w-full object-cover" />
                    )}

                    {m.nama && (
                      <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-1.5 py-0.5 text-[10px] text-white/90">
                        {m.nama}
                      </span>
                    )}
                  </div>

                  {/* Tombol aksi & pengurutan */}
                  <div className="flex items-center justify-between border-t border-[var(--garis)] bg-[var(--papan)] px-2 py-1.5">
                    {m.dibuang ? (
                      <button
                        type="button"
                        onClick={() => toggleBuang(m.id)}
                        disabled={mengirim}
                        className="cms-tombol cms-tombol--kecil w-full justify-center"
                      >
                        ↩ Pulihkan
                      </button>
                    ) : (
                      <>
                        <div className="flex items-center gap-1">
                          {!isFirst && (
                            <button
                              type="button"
                              onClick={() => jadikanPertama(m.id)}
                              disabled={mengirim}
                              title="Jadikan media ini tampil paling pertama"
                              className="cms-tombol cms-tombol--kecil text-[11px] font-semibold text-[var(--api)] hover:bg-[var(--api)]/10"
                            >
                              ★ Pertama
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => geser(m.id, -1)}
                            disabled={mengirim || isFirst}
                            title="Geser ke kiri / urutan lebih awal"
                            aria-label="Geser ke kiri"
                            className="cms-tombol cms-tombol--kecil px-2 disabled:opacity-30"
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            onClick={() => geser(m.id, 1)}
                            disabled={mengirim || isLast}
                            title="Geser ke kanan / urutan berikutnya"
                            aria-label="Geser ke kanan"
                            className="cms-tombol cms-tombol--kecil px-2 disabled:opacity-30"
                          >
                            →
                          </button>
                        </div>

                        <div>
                          {m.tipe === "baru" ? (
                            <button
                              type="button"
                              onClick={() => hapusBaru(m.id)}
                              disabled={mengirim}
                              title="Batalkan berkas ini"
                              aria-label={`Batalkan ${m.nama || "berkas"}`}
                              className="cms-tombol cms-tombol--kecil text-[var(--api)] hover:bg-[var(--api)]/10"
                            >
                              ✕
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleBuang(m.id)}
                              disabled={mengirim}
                              title="Buang berkas ini saat disimpan"
                              aria-label={m.dibuang ? "Batal membuang berkas ini" : "Buang berkas ini saat disimpan"}
                              aria-pressed={m.dibuang}
                              className="cms-tombol cms-tombol--kecil text-[var(--api)] hover:bg-[var(--api)]/10"
                            >
                              🗑
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Keterangan / Alt text */}
                  <div className="border-t border-[var(--garis)] bg-[var(--kertas)] p-2">
                    <label
                      htmlFor={`media_desc_${m.id}`}
                      className="cms-mata mb-1 block text-[10px] text-[var(--redup)]"
                    >
                      Keterangan media
                    </label>
                    <input
                      id={`media_desc_${m.id}`}
                      type="text"
                      value={m.keterangan}
                      onChange={(e) => ubahKeterangan(m.id, e.target.value)}
                      disabled={mengirim || m.dibuang}
                      placeholder="Deskripsi / alt teks…"
                      aria-label={`Keterangan media ${activeIndex >= 0 ? activeIndex + 1 : ""}`}
                      className="w-full rounded-[4px] border border-[var(--garis)] bg-[var(--papan)] px-2 py-1 text-[11.5px] text-[var(--jelaga)] outline-none placeholder:text-[var(--lirih)] focus:border-[var(--limau)] disabled:opacity-60"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
