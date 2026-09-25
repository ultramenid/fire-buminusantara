import Link from "next/link";
import { notFound } from "next/navigation";
import { wajibSesi } from "@/lib/sesi";
import {
  ambilLaporan, laporanBerikutnya, adaStatus, NAMA_STATUS,
  type Lampiran, type StatusLaporan,
} from "@/lib/laporan-publik";
import { peringatanLokasi } from "@/lib/provinsi-titik";
import { HALAMAN, KopHalaman } from "../../kop-halaman";
import { Segarkan } from "../../segarkan";
import { TombolVerifikasi } from "../tombol-verifikasi";
import { PilihOrientasi } from "../pilih-orientasi";
import { SuntingLaporan } from "../sunting-laporan";

const waktuPanjang = new Intl.DateTimeFormat("id-ID", {
  weekday: "long", day: "numeric", month: "long", year: "numeric",
  hour: "2-digit", minute: "2-digit",
});

const CAP: Record<StatusLaporan, string> = {
  pending: "cms-cap cms-cap--perhatian",
  approved: "cms-cap cms-cap--aman",
  rejected: "cms-cap cms-cap--diam",
};

export default async function RincianLaporan({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const sesi = await wajibSesi();

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const laporan = await ambilLaporan(id);
  if (!laporan) notFound();

  // Saringan yang sedang dilihat dibawa lewat query, jadi tombol kembali
  // mendarat di tab yang sama — bukan melempar peninjau balik ke "Menunggu"
  // setelah ia sedang menelusuri arsip yang ditolak.
  const asal = (await searchParams).status ?? "pending";
  const saringan: StatusLaporan | undefined = adaStatus(asal) ? asal : undefined;
  const berikutnya = await laporanBerikutnya(id, saringan);

  const kembali = `/admin/laporan?status=${asal}`;

  // Kewajaran lokasi dicek untuk SEMUA laporan yang dibuka — pola galat "S
  // tertinggal ketik" hanya terlihat di sini, sebelum promosi mengunci
  // koordinat dan nama daerahnya ke kejadian publik.
  const peringatan = peringatanLokasi(
    laporan.lat,
    laporan.lng,
    `${laporan.judul}\n${laporan.deskripsi}`,
  );

  return (
    <div className={HALAMAN}>
      <Link href={kembali} className="cms-mata mb-4 inline-block underline-offset-4 hover:underline">
        ← Laporan warga
      </Link>

      <KopHalaman
        mata={`Laporan ${String(laporan.id).padStart(3, "0")}`}
        judul={laporan.judul}
        asli
      >
        <TombolVerifikasi
          id={laporan.id}
          status={laporan.status}
          bolehHapus={sesi.peran === "admin"}
          setelahHapus={kembali}
        />
        <Segarkan />
      </KopHalaman>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          <Bagian judul="Isi laporan">
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
          </Bagian>

          <Bagian judul={`Lampiran (${laporan.lampiran.length})`}>
            {laporan.lampiran.length === 0 ? (
              <p className="text-[13.5px] text-[var(--lirih)]">
                Pelapor tidak melampirkan foto atau video.
              </p>
            ) : (
              <LampiranPenuh id={laporan.id} daftar={laporan.lampiran} judul={laporan.judul} />
            )}
          </Bagian>
        </div>

        {/* Keterangan duduk di kolom sendiri: saat memutuskan, yang dibaca
            berulang adalah lampiran dan ceritanya — data ini cukup ada di
            pinggir, tidak perlu memotong bacaan di tengah. */}
        <aside className="lg:border-l lg:border-[var(--garis)] lg:pl-7">
          <Bagian judul="Keterangan">
            <dl className="grid gap-3.5">
              <Baris label="Status">
                <span className={CAP[laporan.status]}>{NAMA_STATUS[laporan.status]}</span>
              </Baris>

              <Baris label="Pelapor">
                {laporan.namaPelapor ?? (
                  <span className="text-[var(--lirih)] italic">Anonim</span>
                )}
              </Baris>

              <Baris label="Dikirim">
                <span className="cms-angka">
                  {laporan.dibuat ? waktuPanjang.format(laporan.dibuat) : "—"}
                </span>
              </Baris>

              <Baris label="Koordinat">
                {laporan.lat !== null && laporan.lng !== null ? (
                  <a href={`https://www.google.com/maps?q=${laporan.lat},${laporan.lng}`}
                     target="_blank" rel="noreferrer"
                     className="cms-angka underline-offset-4 hover:underline">
                    {laporan.lat.toFixed(7)}, {laporan.lng.toFixed(7)} ↗
                  </a>
                ) : (
                  <span className="text-[var(--lirih)]">Tidak diisi</span>
                )}
              </Baris>

              <Baris label="Alamat IP">
                <span className="cms-angka">{laporan.ip ?? "—"}</span>
              </Baris>

              {peringatan !== null && (
                <div className="cms-baris cms-baris--perhatian p-3">
                  <p className="cms-cap cms-cap--perhatian">Periksa lokasi</p>
                  <p className="mt-1.5 text-[13px] leading-[1.55] text-[var(--redup)]">
                    {peringatan}
                  </p>
                </div>
              )}

              {laporan.status !== "pending" && (
                <Baris label="Ditinjau">
                  <span className="cms-angka">
                    {laporan.ditinjau ? waktuPanjang.format(laporan.ditinjau) : "—"}
                  </span>
                  {laporan.peninjau && (
                    <span className="mt-0.5 block text-[var(--redup)]">
                      oleh {laporan.peninjau}
                    </span>
                  )}
                </Baris>
              )}
            </dl>
          </Bagian>

          {berikutnya !== null && (
            <Link href={`/admin/laporan/${berikutnya}?status=${asal}`}
                  className="cms-tombol cms-tombol--garis mt-2 w-full justify-center">
              Laporan berikutnya →
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}

function Bagian({ judul, children }: { judul: string; children: React.ReactNode }) {
  return (
    <section className="mb-8 last:mb-0">
      <h2 className="cms-mata mb-3 border-b border-[var(--garis)] pb-2">{judul}</h2>
      {children}
    </section>
  );
}

function Baris({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="cms-mata text-[var(--lirih)]">{label}</dt>
      <dd className="mt-1 text-[13.5px] text-[var(--jelaga)]">{children}</dd>
    </div>
  );
}

/**
 * Lampiran ukuran baca, bukan keping kecil seperti di daftar.
 *
 * Di halaman inilah keputusan diambil, jadi gambarnya digambar sebesar yang
 * muat — dibatasi tinggi layar supaya foto potret tidak mendorong sisa halaman
 * jauh ke bawah. Menekan gambar membuka berkas aslinya, ukuran penuh.
 */
function LampiranPenuh({ id, daftar, judul }: { id: number; daftar: Lampiran[]; judul: string }) {
  return (
    <ul className="grid gap-4">
      {daftar.map((m, i) => (
        <li key={m.url}>
          {/* Orientasi dipilih peninjau: potret atau lanskap. Disimpan ke
              metadata berkas lewat aksi, dipakai penampil media. */}
          <PilihOrientasi id={id} url={m.url} nilai={m.orientasi} />

          {m.jenis === "gambar" ? (
            <a href={m.url} target="_blank" rel="noreferrer"
               className="block w-fit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--api)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- URL media remote warisan, host dinamis di luar remotePatterns */}
              <img src={m.url} alt={m.keterangan || `Lampiran ${i + 1} — ${judul}`} loading="lazy"
                   className="max-h-[70svh] w-auto max-w-full rounded-[3px] border border-[var(--garis)]" />
            </a>
          ) : (
            <video src={m.url} controls preload="metadata"
                   className="max-h-[70svh] w-full max-w-full rounded-[3px] border border-[var(--garis)] bg-black" />
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
