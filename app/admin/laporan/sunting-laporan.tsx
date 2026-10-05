"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Isian, IsianPanjang, IsianKoordinat, Bantuan } from "../isian";
import { CariLokasi } from "../cari-lokasi";
import { Pemuat } from "../pemuat";
import { PetaLokasi } from "../peta-lokasi";
import { aksiSuntingLaporan } from "./aksi";

/** Hasil satu kali simpan. `null` = belum pernah disimpan di sesi ini. */
type Isian = { judul: string; judulEn: string; deskripsi: string; deskripsiEn: string; statusKejadian: string };
/** Gagal membawa kembali ketikan kurator: React 19 me-reset field tak terkendali
 *  setelah setiap aksi form, termasuk yang gagal — tanpa ini suntingannya
 *  kembali ke nilai basis data begitu server menolak. */
type Keadaan = { ok: true } | { ok: false; galat: string; isian: Isian } | null;

/**
 * Perapian laporan sebelum diverifikasi.
 *
 * Teks pelapor naik apa adanya jadi kejadian publik begitu tombol Verifikasi
 * ditekan — promosi membaca ulang baris ini di dalam transaksinya. Jadi
 * merapikan di sini sama dengan merapikan halaman publiknya, dan tidak ada
 * langkah kedua yang bisa terlupa.
 *
 * Isian sengaja TIDAK terkendali (defaultValue): satu-satunya sumber kebenaran
 * adalah baris database, dan setiap simpan menyegarkan halaman dari sana.
 * Menyimpan salinannya di state klien cuma menambah satu tempat yang bisa
 * berbeda dari yang tersimpan.
 */
export function SuntingLaporan({
  id,
  judul,
  judulEn,
  deskripsi,
  deskripsiEn,
  lokasi: awalLokasi,
  statusKejadian,
  lat: awalLat,
  lng: awalLng,
  diperbarui,
  terkunci,
}: {
  id: number;
  judul: string;
  judulEn: string;
  deskripsi: string;
  deskripsiEn: string;
  lokasi: string;
  statusKejadian: string;
  lat: number | null;
  lng: number | null;
  /** Waktu simpan terakhir, sudah diformat di server. Inilah konfirmasinya —
   *  dirender server, jadi tidak bisa terhapus oleh transisi penyegaran, dan
   *  masih terbaca setelah halaman dimuat ulang maupun oleh kurator berikutnya. */
  diperbarui: string | null;
  /** Laporan yang sudah diputuskan tidak boleh diubah lagi — arsipnya harus
   *  tetap sebagaimana adanya saat keputusan diambil. */
  terkunci: boolean;
}) {
  // useActionState, bukan useTransition + useState: hasil simpan bertahan
  // sampai kiriman berikutnya, jadi konfirmasinya tidak bisa terhapus oleh
  // render ulang dari server.
  const router = useRouter();
  // Koordinat punya dua penulis di sini — peta dan ketikan manual — jadi
  // nilainya dipegang state, bukan DOM. Bentuknya sama persis dengan form
  // kejadian, supaya kurator tidak perlu belajar dua cara menaruh titik.
  const [lat, setLat] = useState(awalLat === null ? "" : String(awalLat));
  const [lng, setLng] = useState(awalLng === null ? "" : String(awalLng));
  const [lokasi, setLokasi] = useState(awalLokasi);

  const [keadaan, kirim, sibuk] = useActionState<Keadaan, FormData>(
    async (_sebelum, data) => {
      const isian: Isian = {
        judul: String(data.get("judul") ?? ""),
        judulEn: String(data.get("judulEn") ?? ""),
        deskripsi: String(data.get("deskripsi") ?? ""),
        deskripsiEn: String(data.get("deskripsiEn") ?? ""),
        statusKejadian: String(data.get("statusKejadian") ?? ""),
      };
      const hasil = await aksiSuntingLaporan(id, {
        ...isian,
        lokasi: String(data.get("lokasi") ?? ""),
        lat: String(data.get("lat") ?? ""),
        lng: String(data.get("lng") ?? ""),
      });
      return hasil.ok ? hasil : { ...hasil, isian };
    },
    null,
  );

  // Penyegaran SENGAJA di luar aksinya, bukan di dalam: memanggil
  // router.refresh() sebelum aksi sempat mengembalikan hasilnya membuat
  // transisi penyegaran menggantikan state aksi, dan konfirmasi "Tersimpan"
  // ikut terhapus sebelum sempat terlihat. Judul juga tampil di kepala halaman
  // dan koordinat di kolom samping — keduanya dirender di server, jadi
  // penyegarannya tetap diperlukan.
  useEffect(() => {
    if (keadaan?.ok) router.refresh();
  }, [keadaan, router]);

  const isi = keadaan && !keadaan.ok ? keadaan.isian : null;

  if (terkunci) {
    return (
      <>
        <p className="text-[14.5px] leading-[1.65] whitespace-pre-line text-[var(--jelaga)]">
          {deskripsi}
        </p>
        <p className="mt-3 text-[12.5px] text-[var(--lirih)]">
          Laporan yang sudah diputuskan tidak bisa disunting lagi.
        </p>
      </>
    );
  }

  return (
    <form action={kirim} className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Isian
          label="Judul (ID)" nama="judul" nilai={isi?.judul ?? judul} wajib mati={sibuk} panjangMaks={255}
          bantuan="Jadi judul kejadian publik saat laporan diverifikasi."
        />
        <Isian
          label="Judul (EN)" nama="judulEn" nilai={isi?.judulEn ?? judulEn} mati={sibuk} panjangMaks={255}
          bantuan="Kosongkan untuk memakai judul Indonesia apa adanya."
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <IsianPanjang
          label="Deskripsi (ID)" nama="deskripsi" nilai={isi?.deskripsi ?? deskripsi} wajib mati={sibuk}
          baris={7} panjangMaks={5000}
          bantuan="Cerita pelapor, dirapikan seperlunya."
        />
        <IsianPanjang
          label="Deskripsi (EN)" nama="deskripsiEn" nilai={isi?.deskripsiEn ?? deskripsiEn} mati={sibuk}
          baris={7} panjangMaks={5000}
          bantuan="Boleh dikosongkan — kejadiannya lahir tanpa deskripsi Inggris."
        />
      </div>

      <CariLokasi
        label="Lokasi" nama="lokasi" nilai={lokasi} mati={sibuk}
        onUbah={setLokasi}
        onPilih={(n, a, b) => { setLokasi(n); setLat(String(a)); setLng(String(b)); }}
        bantuan="Pilih dari hasil pencarian supaya provinsinya terbaca. Dikosongkan pun tidak apa — namanya akan dicari otomatis dari koordinat saat diverifikasi."
      />

      {/* Koordinat boleh kosong dua-duanya — sebagian pelapor memang tidak
          mengirimkannya — tapi tidak boleh terisi sebelah. */}
      <div className="grid gap-5 sm:grid-cols-2">
        <IsianKoordinat label="Latitude" nama="lat" nilai={lat} onUbah={setLat} mati={sibuk}
                        bantuan="-90 sampai 90. Wajib sebelum verifikasi — kejadian tanpa titik tidak bisa tampil di peta." />
        <IsianKoordinat label="Longitude" nama="lng" nilai={lng} onUbah={setLng} mati={sibuk}
                        bantuan="-180 sampai 180." />
      </div>

      {/* Peta yang sama dengan form kejadian. Di sini justru lebih penting:
          koordinat laporan datang dari GPS ponsel pelapor dan kerap meleset,
          dan menggeser penanda jauh lebih cepat daripada mengarang angka. */}
      <div>
        <p className="cms-mata mb-1.5">Perbaiki titik di peta</p>
        <div className="overflow-hidden rounded-[var(--jari)] border border-[var(--garis-tegas)]">
          <PetaLokasi lat={lat} lng={lng}
                      onPilih={(a, b) => { setLat(a.toFixed(6)); setLng(b.toFixed(6)); }} />
        </div>
        <Bantuan>
          Tekan peta untuk menaruh titik, geser penandanya untuk merapikan.
          Titik inilah yang menentukan provinsi kejadian saat laporan diverifikasi.
        </Bantuan>
      </div>

      {/* Keputusan terhadap KEJADIAN yang lahir dari laporan ini — bukan
          terhadap laporannya. Verifikasi tetap memutuskan laporannya. */}
      <div>
        <label htmlFor="statusKejadian" className="cms-mata mb-1.5 block">Keadaan tayang kejadian</label>
        <select id="statusKejadian" name="statusKejadian" defaultValue={isi?.statusKejadian ?? statusKejadian}
                disabled={sibuk} className="cms-isian w-full sm:max-w-[320px]">
          <option value="published">Publish — langsung tayang saat diverifikasi</option>
          <option value="draft">Draft — dibuat tapi belum tampil di situs publik</option>
        </select>
        <Bantuan>
          Pilih draft bila kejadiannya masih perlu dirapikan lagi di form kejadian
          sebelum publik melihatnya.
        </Bantuan>
      </div>

      {keadaan && !keadaan.ok && (
        <p className="cms-galat" role="alert">{keadaan.galat}</p>
      )}

      <AksiSimpan diperbarui={diperbarui} />
    </form>
  );
}

/** Bilah aksi form perapian, mengikuti idiom form kejadian: tombol utama
 *  berwarna, status kiriman dibaca useFormStatus dari <form> di atasnya.
 *  Harus komponen anak — useFormStatus tidak melihat <form> yang dirender
 *  komponen yang sama. */
function AksiSimpan({ diperbarui }: { diperbarui: string | null }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-[var(--garis)] pt-4">
      <button type="submit" disabled={pending} aria-busy={pending}
              className="cms-tombol cms-tombol--utama">
        {pending && <Pemuat />}
        Simpan perapian
      </button>
      <span className="text-[12.5px] text-[var(--lirih)]">
        {diperbarui
          ? `Terakhir dirapikan ${diperbarui}. Nilai inilah yang naik jadi kejadian saat diverifikasi.`
          : "Nilai inilah yang naik jadi kejadian saat diverifikasi."}
      </span>
    </div>
  );
}
