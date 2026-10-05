import Link from "next/link";
import { notFound } from "next/navigation";
import { wajibSesi } from "@/lib/sesi";
import {
  ambilLaporan, laporanBerikutnya, adaStatus, NAMA_STATUS,
  type Lampiran, type StatusLaporan,
} from "@/lib/laporan-publik";
import { peringatanLokasi } from "@/lib/provinsi-titik";
import { BilahAksi, Hampa, Kartu, KopPanel, LEBAR } from "../../ruang";
import { bacaSaring } from "../../saring";
import { Ikon } from "../../menu-admin";
import { TombolVerifikasi } from "../tombol-verifikasi";
import { PilihOrientasi } from "../pilih-orientasi";
import { TombolUrutanLampiran } from "../tombol-urutan";
import { SuntingLaporan } from "../sunting-laporan";

const waktuPanjang = new Intl.DateTimeFormat("id-ID", {
  weekday: "long", day: "numeric", month: "long", year: "numeric",
  hour: "2-digit", minute: "2-digit",
});

const CAP: Record<StatusLaporan, string> = {
  pending: "cms-cap cms-cap--titik cms-cap--perhatian",
  approved: "cms-cap cms-cap--titik cms-cap--aman",
  rejected: "cms-cap cms-cap--titik cms-cap--diam",
};

export default async function RincianLaporan({ params }: { params: Promise<{ id: string }> }) {
  const sesi = await wajibSesi();

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const laporan = await ambilLaporan(id);
  if (!laporan) notFound();

  // Laporan berikutnya dalam saringan tabel yang sama — dibuka sesudah
  // memutuskan, supaya antrean dikerjakan tanpa bolak-balik ke tabel.
  const pilihan = (await bacaSaring("laporan")).status || "pending";
  const idBerikut = await laporanBerikutnya(id, adaStatus(pilihan) ? pilihan : undefined);
  const berikutnya = idBerikut ? `/admin/laporan/${idBerikut}` : null;

  // Kewajaran lokasi dicek untuk SEMUA laporan yang dibuka — pola galat "S
  // tertinggal ketik" hanya terlihat di sini, sebelum promosi mengunci
  // koordinat dan nama daerahnya ke kejadian publik.
  const peringatan = peringatanLokasi(
    laporan.lat,
    laporan.lng,
    `${laporan.judul}\n${laporan.deskripsi}`,
  );

  return (
    <>
      <KopPanel lebar mata={`Laporan #${String(laporan.id).padStart(3, "0")}`} judul={laporan.judul} kembali="/admin/laporan"
                sisi={<span className={CAP[laporan.status]}>{NAMA_STATUS[laporan.status]}</span>}>
        {berikutnya && (
          <Link href={berikutnya} className="cms-tombol cms-tombol--hantu cms-tombol--kecil">
            Berikutnya <Ikon nama="kanan" className="size-3.5" />
          </Link>
        )}
      </KopPanel>

      {/* Keputusan di puncak, tetap terlihat: inilah alasan halaman ini dibuka. */}
      <BilahAksi lebar>
        <TombolVerifikasi id={laporan.id} status={laporan.status} bolehHapus={sesi.peran === "admin"} berikutnya={berikutnya} />
        <p className="ml-auto hidden text-[12.5px] text-[var(--lirih)] md:block">
          {laporan.status === "pending"
            ? "Verifikasi membuat kejadiannya dari nilai di bawah."
            : "Sudah diputuskan — kembalikan ke antrean untuk mengubahnya."}
        </p>
      </BilahAksi>

      <div className={`${LEBAR} grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]`}>
        <div className="grid min-w-0 gap-5">
          <Kartu judul="Isi laporan"
                 deskripsi={laporan.status === "pending" ? "Rapikan seperlunya — nilai inilah yang naik jadi kejadian saat diverifikasi." : undefined}>
            <SuntingLaporan
              id={laporan.id}
              judul={laporan.judul}
              judulEn={laporan.judulEn}
              deskripsi={laporan.deskripsi}
              deskripsiEn={laporan.deskripsiEn}
              lokasi={laporan.lokasi}
              statusKejadian={laporan.statusKejadian}
              lat={laporan.lat}
              lng={laporan.lng}
              diperbarui={laporan.diperbarui ? waktuPanjang.format(laporan.diperbarui) : null}
              terkunci={laporan.status !== "pending"}
            />
          </Kartu>

          <Kartu judul={`Lampiran (${laporan.lampiran.length})`}
                 deskripsi={laporan.lampiran.length ? "Tekan gambar untuk membuka berkas aslinya, ukuran penuh." : undefined}
                 isi={laporan.lampiran.length ? "cms-kartu__isi" : ""}>
            {laporan.lampiran.length === 0 ? (
              <Hampa ikon="gambar">Pelapor tidak melampirkan foto atau video.</Hampa>
            ) : (
              <LampiranPenuh
                id={laporan.id}
                daftar={laporan.lampiran}
                judul={laporan.judul}
                terkunci={laporan.status !== "pending"}
              />
            )}
          </Kartu>
        </div>

        {/* Keterangan duduk di kolom sendiri: saat memutuskan, yang dibaca
            berulang adalah lampiran dan ceritanya — data ini cukup ada di
            pinggir, tidak perlu memotong bacaan di tengah. */}
        <aside className="grid gap-5 lg:sticky lg:top-[124px]">
          {peringatan !== null && (
            <div className="cms-kartu cms-kartu--bahaya p-4">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--bara)]">
                <Ikon nama="peta" className="size-3.5" />Periksa lokasi
              </p>
              <p className="mt-1.5 text-[13px] leading-[1.55] text-[var(--redup)]">{peringatan}</p>
            </div>
          )}

          <Kartu judul="Keterangan">
            <dl className="cms-dl">
              <div>
                <dt>Pelapor</dt>
                <dd>{laporan.namaPelapor ?? <span className="text-[var(--lirih)] italic">Anonim</span>}</dd>
              </div>
              <div>
                <dt>Dikirim</dt>
                <dd className="tabular-nums">{laporan.dibuat ? waktuPanjang.format(laporan.dibuat) : "—"}</dd>
              </div>
              <div>
                <dt>Koordinat</dt>
                <dd>
                  {laporan.lat !== null && laporan.lng !== null ? (
                    <a href={`https://www.google.com/maps?q=${laporan.lat},${laporan.lng}`}
                       target="_blank" rel="noreferrer"
                       className="cms-angka underline-offset-4 hover:underline">
                      {laporan.lat.toFixed(6)}, {laporan.lng.toFixed(6)} ↗
                    </a>
                  ) : (
                    <span className="text-[var(--lirih)]">Tidak diisi</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Alamat IP</dt>
                <dd className="cms-angka">{laporan.ip ?? "—"}</dd>
              </div>
              {laporan.status !== "pending" && (
                <div>
                  <dt>Ditinjau</dt>
                  <dd>
                    <span className="tabular-nums">{laporan.ditinjau ? waktuPanjang.format(laporan.ditinjau) : "—"}</span>
                    {laporan.peninjau && <span className="mt-0.5 block text-[var(--redup)]">oleh {laporan.peninjau}</span>}
                  </dd>
                </div>
              )}
            </dl>
          </Kartu>
        </aside>
      </div>
    </>
  );
}

/**
 * Lampiran ukuran baca, bukan keping kecil seperti di daftar.
 *
 * Di halaman inilah keputusan diambil, jadi gambarnya digambar sebesar yang
 * muat — dibatasi tinggi layar supaya foto potret tidak mendorong sisa halaman
 * jauh ke bawah. Menekan gambar membuka berkas aslinya, ukuran penuh.
 */
function LampiranPenuh({
  id,
  daftar,
  judul,
  terkunci,
}: {
  id: number;
  daftar: Lampiran[];
  judul: string;
  terkunci: boolean;
}) {
  return (
    <ul className="grid gap-4">
      {daftar.map((m, i) => (
        <li key={m.url}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {/* Orientasi dipilih peninjau: potret atau lanskap. Terkunci =
                sudah diputuskan: mengubahnya hanya mengubah arsip laporan,
                kejadian yang sudah lahir tidak ikut. */}
            {!terkunci && <PilihOrientasi id={id} url={m.url} nilai={m.orientasi} />}
            {!terkunci && daftar.length > 1 && (
              <TombolUrutanLampiran id={id} url={m.url} indeks={i} total={daftar.length} />
            )}
          </div>

          {m.jenis === "gambar" ? (
            <a href={m.url} target="_blank" rel="noreferrer"
               className="block w-fit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--api)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- URL media remote warisan, host dinamis di luar remotePatterns */}
              <img src={m.url} alt={m.keterangan || `Lampiran ${i + 1} — ${judul}`} loading="lazy"
                   className="max-h-[70svh] w-auto max-w-full rounded-[var(--jari)] border border-[var(--garis)]" />
            </a>
          ) : (
            <video src={m.url} controls preload="metadata"
                   className="max-h-[70svh] w-full max-w-full rounded-[var(--jari)] border border-[var(--garis)] bg-black" />
          )}
          <p className="cms-mata mt-1.5 text-[var(--lirih)]">
            {m.jenis === "gambar" ? "Gambar" : "Video"} {i + 1}
            {m.keterangan && (
              <> · <span className="text-[var(--jelaga)] font-medium">{m.keterangan}</span></>
            )} ·{" "}
            <a href={m.url} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
              buka berkas ↗
            </a>
          </p>

          {/* Metadata EXIF foto: kapan & di mana kamera mengambilnya. Berbeda
              dari koordinat laporan yang bisa diketik pelapor — ini terekam
              otomatis oleh kamera, jadi bukti yang lebih sulit dikarang. */}
          {m.exif && (m.exif.waktu || (m.exif.lat != null && m.exif.lng != null)) && (
            <p className="cms-mata mt-1 text-[var(--lirih)]">
              <span className="text-[var(--redup)]">EXIF foto —</span>{" "}
              {m.exif.waktu && (
                <>diambil <span className="cms-angka text-[var(--jelaga)]">{m.exif.waktu}</span></>
              )}
              {m.exif.waktu && m.exif.lat != null && m.exif.lng != null && " · "}
              {m.exif.lat != null && m.exif.lng != null && (
                <a
                  href={`https://www.google.com/maps?q=${m.exif.lat},${m.exif.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="cms-angka text-[var(--jelaga)] underline-offset-4 hover:underline"
                >
                  {m.exif.lat.toFixed(5)}, {m.exif.lng.toFixed(5)} ↗
                </a>
              )}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
