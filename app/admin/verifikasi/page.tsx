import type { mobile_ktp_verifications_ocr_result } from "@prisma/client";
import { catatGalat } from "@/lib/catat-galat";
import { prisma } from "@/lib/prisma";
import { wajibSesi } from "@/lib/sesi";
import { uraiNik } from "@/lib/nik";
import { fotoAda, sapuKedaluwarsa, sisaHariPengajuan } from "@/lib/verifikasi-ktp";
import { Ikon } from "../menu-admin";
import { bacaSaring, halamanDari } from "../saring";
import { Hampa, Kartu, KopPanel, LEBAR } from "../ruang";
import { PagerDaftar } from "../ruang-klien";
import { TombolKeputusanKtp } from "./tombol-keputusan";

const PER = 10;
const waktu = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const tanggal = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" });

/** 3201012345670001 → "3201 0123 4567 0001": lebih mudah dicocokkan per kelompok. */
const kelompokNik = (nik: string) => nik.replace(/(\d{4})(?=\d)/g, "$1 ");

/**
 * Antrean verifikasi KTP dari aplikasi mobile — syarat siaran langsung publik.
 * Terlama dulu: pengajuan yang 30 hari tidak diputuskan dihapus sendiri
 * (sapuKedaluwarsa, dijalankan saat halaman ini dibuka).
 */
export default async function VerifikasiKtp() {
  await wajibSesi();
  await sapuKedaluwarsa().catch((e) => catatGalat("sapu-ktp", e));
  const saring = await bacaSaring("verifikasi");

  const where = { status: "menunggu" as const };
  const total = await prisma.mobile_ktp_verifications.count({ where });
  const halaman = halamanDari(saring, total, PER);
  const daftar = await prisma.mobile_ktp_verifications.findMany({
    where,
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    skip: (halaman - 1) * PER,
    take: PER,
    select: {
      id: true, nik: true, nik_hash: true, ktp_path: true, created_at: true,
      ocr_result: true, ocr_nik: true, ocr_score: true,
      pemohon: { select: { id: true, name: true, email: true, created_at: true } },
    },
  });

  // NIK yang sama sudah dipegang akun terverifikasi (menyetujui pasti gagal),
  // atau sedang diajukan beberapa akun sekaligus (patut dicurigai).
  const sidik = [...new Set(daftar.map((d) => d.nik_hash))];
  const [pemegang, pengaju] = sidik.length
    ? await Promise.all([
        prisma.users.findMany({ where: { ktp_nik_hash: { in: sidik } }, select: { id: true, ktp_nik_hash: true } }),
        prisma.mobile_ktp_verifications.groupBy({ by: ["nik_hash", "user_id"], where: { status: "menunggu", nik_hash: { in: sidik } } }),
      ])
    : [[], []];
  const akunPengaju = new Map<string, number>();
  for (const p of pengaju) akunPengaju.set(p.nik_hash, (akunPengaju.get(p.nik_hash) ?? 0) + 1);

  const kini = new Date();
  const butir = await Promise.all(daftar.map(async (d) => ({
    ...d,
    adaKtp: await fotoAda(d.ktp_path),
    dipakaiLain: pemegang.some((u) => u.ktp_nik_hash === d.nik_hash && u.id !== d.pemohon.id),
    akunSama: akunPengaju.get(d.nik_hash) ?? 1,
    sisaHari: sisaHariPengajuan(d.created_at, kini),
  })));

  return (
    <>
      <KopPanel lebar mata="Moderasi" judul="Verifikasi KTP"
                deskripsi="Syarat siaran langsung publik dari aplikasi. Cocokkan NIK ketikan dengan NIK di foto KTP, dan pastikan fotonya KTP sungguhan yang terbaca jelas. Foto dan NIK dihapus begitu diputuskan; pengajuan yang 30 hari tidak diputuskan terhapus sendiri." />
      <div className={LEBAR}>
        {butir.length === 0 ? (
          <Kartu isi="">
            <Hampa judul="Antrean kosong" ikon="ktp">Tidak ada pengajuan verifikasi KTP yang menunggu.</Hampa>
          </Kartu>
        ) : (
          <ul className="grid gap-5">
            {butir.map((v) => {
              const urai = v.nik ? uraiNik(v.nik) : null;
              return (
                <li key={String(v.id)}>
                  <Kartu
                    judul={v.pemohon.name}
                    deskripsi={v.pemohon.email}
                    aksi={<span className={`cms-cap cms-cap--titik ${v.sisaHari <= 3 ? "cms-cap--perhatian" : "cms-cap--diam"}`}>
                      Kedaluwarsa {v.sisaHari > 0 ? `${v.sisaHari} hari lagi` : "hari ini"}
                    </span>}
                  >
                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                      <FotoKtp id={v.id} ada={v.adaKtp} nama={v.pemohon.name} />
                      <div className="grid content-start gap-4">
                        <dl className="cms-dl">
                          <div>
                            <dt>NIK ketikan</dt>
                            <dd className="cms-angka text-[15px] tracking-wide">{v.nik ? kelompokNik(v.nik) : "—"}</dd>
                          </div>
                          {v.ocr_result && (
                            <div>
                              <dt>Bacaan mesin</dt>
                              <dd><LencanaOcr hasil={v.ocr_result} nik={v.ocr_nik} skor={v.ocr_score} /></dd>
                            </div>
                          )}
                          {urai && (
                            <div>
                              <dt>Menurut NIK</dt>
                              <dd>Lahir <span className="cms-angka">{urai.lahir}</span> · {urai.perempuan ? "perempuan" : "laki-laki"}</dd>
                            </div>
                          )}
                          <div>
                            <dt>Diajukan</dt>
                            <dd className="tabular-nums">{waktu.format(v.created_at)}</dd>
                          </div>
                          <div>
                            <dt>Akun</dt>
                            <dd className="tabular-nums">
                              #{String(v.pemohon.id)}
                              {v.pemohon.created_at && <span className="text-[var(--redup)]"> · sejak {tanggal.format(v.pemohon.created_at)}</span>}
                            </dd>
                          </div>
                        </dl>
                        {v.dipakaiLain && (
                          <p role="alert" className="cms-galat">NIK ini sudah dipakai akun lain yang terverifikasi — tidak bisa disetujui. Tolak pengajuan ini.</p>
                        )}
                        {!v.dipakaiLain && v.akunSama > 1 && (
                          <p className="cms-galat">NIK yang sama sedang diajukan {v.akunSama} akun. Hanya satu yang bisa disetujui.</p>
                        )}
                        {!v.adaKtp && (
                          <p className="cms-galat">Foto KTP tidak ditemukan di server. Tolak dan minta warga mengirim ulang.</p>
                        )}
                        <TombolKeputusanKtp id={String(v.id)} bolehSetuju={!v.dipakaiLain && v.adaKtp} />
                      </div>
                    </div>
                  </Kartu>
                </li>
              );
            })}
          </ul>
        )}
        {total > PER && (
          <div className="cms-tabel-bingkai mt-5">
            <PagerDaftar bagian="verifikasi" nilai={saring} halaman={halaman} total={total} per={PER} />
          </div>
        )}
      </div>
    </>
  );
}

const skorTeks = (skor: number | null) => (skor === null ? "" : ` (skor ${skor.toFixed(2)})`);

/**
 * Hasil OCR foto KTP (EKYC_PROVIDER=paddleocr) — petunjuk, bukan keputusan:
 * OCR hanya membaca angka di foto, tidak menilai keaslian KTP atau wajah.
 */
function LencanaOcr({ hasil, nik, skor }: { hasil: mobile_ktp_verifications_ocr_result; nik: string | null; skor: number | null }) {
  if (hasil === "cocok") return <span className="cms-cap cms-cap--aman cms-cap--titik">OCR: NIK cocok{skorTeks(skor)}</span>;
  if (hasil === "beda") {
    return (
      <span className="cms-cap cms-cap--perhatian cms-cap--titik">
        OCR: NIK di foto berbeda{nik ? <>: <span className="cms-angka">{kelompokNik(nik)}</span></> : null}{skorTeks(skor)}
      </span>
    );
  }
  if (hasil === "tak_terbaca") return <span className="cms-cap cms-cap--diam cms-cap--titik">OCR: NIK tidak terbaca</span>;
  return <span className="cms-cap cms-cap--diam cms-cap--titik">OCR: layanan tidak tersedia</span>;
}

/**
 * Foto KTP pengajuan lewat rute khusus peninjau (/api/admin/verifikasi/:id),
 * bukan /media. Menekannya membuka ukuran penuh di tab baru untuk dicermati.
 */
function FotoKtp({ id, ada, nama }: { id: bigint; ada: boolean; nama: string }) {
  const url = `/api/admin/verifikasi/${id}`;
  const label = "Foto KTP";
  return (
    <figure className="min-w-0">
      {ada ? (
        <a href={url} target="_blank" rel="noreferrer noopener"
           className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--api)]">
          {/* eslint-disable-next-line @next/next/no-img-element -- rute bersesi CMS, tidak boleh lewat optimizer/cache next/image */}
          <img src={url} alt={`${label} — ${nama}`} loading="lazy" referrerPolicy="no-referrer"
               className="max-h-[420px] w-full rounded-[var(--jari)] border border-[var(--garis)] bg-[var(--rona)] object-contain" />
        </a>
      ) : (
        <div className="grid h-40 place-items-center rounded-[var(--jari)] border border-dashed border-[var(--garis)] text-[12.5px] text-[var(--lirih)]">
          <span className="inline-flex items-center gap-1.5"><Ikon nama="gambar" className="size-3.5" />Foto tidak ditemukan</span>
        </div>
      )}
      <figcaption className="cms-mata mt-1.5">{label}</figcaption>
    </figure>
  );
}
