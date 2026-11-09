"use client";

import { useEffect, useRef, useState } from "react";
import type { Room } from "livekit-client";
import { Kartu } from "../ruang";
import { Pemuat } from "../pemuat";
import { kabari } from "../toko";
import { peranDari, type Siaran } from "./alat";
import { PetaSiaran } from "./peta-siaran";
import { TombolAkhiri } from "./tombol-akhiri";

/*
 * Penonton siaran untuk petugas — port mock-server/penonton.html di repo
 * aplikasi. Kontrak topik text stream: src/lib/live.ts & docs/LIVE.md di sana.
 */
const AWALAN_PELAPOR = "pelapor-";
const TOPIK_KOMENTAR = "komentar";
const TOPIK_SUKA = "suka";
const TOPIK_HADIAH = "hadiah";
/** Hadiah di siaran dimatikan sementara: tombolnya tidak tampil dan hadiah yang masuk
 *  diabaikan. Samakan dengan HADIAH_AKTIF di aplikasi (src/lib/live.ts). */
const HADIAH_AKTIF = false;
/** Titik persis pelapor, hanya dikirim ke peserta `petugas-…`:
 *  JSON { lat, lng, akurasi, waktu }. */
const TOPIK_LOKASI = "lokasi";
const BATAS_KOMENTAR = 200;
/** Urutan & id harus sama dengan DAFTAR_HADIAH di aplikasi. */
const DAFTAR_HADIAH = [
  { id: "tepuk", nama: "Tepuk tangan", emoji: "👏" },
  { id: "air", nama: "Tetes air", emoji: "💧" },
  { id: "terima-kasih", nama: "Terima kasih", emoji: "🙏" },
  { id: "pohon", nama: "Pohon", emoji: "🌳" },
  { id: "pemadam", nama: "Pemadam", emoji: "🧯" },
  { id: "medali", nama: "Medali", emoji: "🏅" },
  { id: "damkar", nama: "Mobil damkar", emoji: "🚒" },
  { id: "bom-air", nama: "Bom air", emoji: "🚁" },
] as const;
const KUALITAS: Record<string, string> = { excellent: "bagus", good: "cukup", poor: "lemah", lost: "putus", unknown: "…" };

type Baris = {
  id: number; nama: string; teks: string;
  peran: "Petugas" | "Pelapor" | null;
  /** kabar = hadiah, bukan tulisan orang. */
  kabar?: boolean; saya?: boolean;
};
type Lokasi = {
  lat: number; lng: number; akurasi: number | null; waktu: number | null;
  /** false = atribut siaran publik yang dibulatkan (~1 km). */
  persis: boolean;
};

let urut = 0;
/** Pembaru state log: baris baru di bawah, paling banyak 100 baris. */
const tambahkan = (b: Omit<Baris, "id">) => (l: Baris[]) => [...l.slice(-99), { ...b, id: ++urut }];
const jam = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" });

const durasi = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = `${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}` : mm;
};

function bacaHadiah(teks: string) {
  try {
    const isi = JSON.parse(teks);
    const hadiah = DAFTAR_HADIAH.find((h) => h.id === isi?.id);
    if (!hadiah) return null;
    return { hadiah, jumlah: Math.min(99, Math.max(1, Math.floor(Number(isi.jumlah)) || 1)) };
  } catch {
    return null;
  }
}

/** Koordinat dari text stream "lokasi" (angka) atau atribut peserta (teks). */
function titikDari(lat: unknown, lng: unknown) {
  if (lat === null || lat === undefined || lat === "" || lng === null || lng === undefined || lng === "") return null;
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lng: b } : null;
}
/** Siaran publik membulatkan atribut ke 2 desimal (~1 km). Titik yang lebih
 *  halus berarti pelapornya belum ikut aturan itu — anggap persis. */
const kasar = (t: { lat: number; lng: number }) =>
  Math.round(t.lat * 100) / 100 === t.lat && Math.round(t.lng * 100) / 100 === t.lng;
const angkaAtauNull = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export function Penonton({ siaran, onTutup, onBerakhir }: {
  /** Data terbaru dari daftar (penonton ikut diperbarui tiap muat ulang). */
  siaran: Siaran;
  onTutup: () => void;
  onBerakhir: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const suaraRef = useRef<HTMLDivElement | null>(null);
  const ruangRef = useRef<Room | null>(null);
  const [status, setStatus] = useState<string | null>("Menghubungkan…");
  const [baris, setBaris] = useState<Baris[]>([]);
  const [lokasi, setLokasi] = useState<Lokasi | null>(() => {
    const t = titikDari(siaran.lat, siaran.lng);
    return t ? { ...t, akurasi: siaran.akurasi, waktu: null, persis: !siaran.publik || !kasar(t) } : null;
  });
  const [kualitas, setKualitas] = useState("…");
  const [suka, setSuka] = useState(0);
  const [bisaSuara, setBisaSuara] = useState(true);
  const [mengirim, setMengirim] = useState(false);
  const [kini, setKini] = useState<number | null>(null);
  const tertunda = useRef(new Map<string, number>());
  const pengatur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logRef = useRef<HTMLOListElement | null>(null);
  const { ruang: namaRuang, publik } = siaran;

  useEffect(() => {
    const t = setInterval(() => setKini(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Komentar baru → gulir ke bawah, kecuali petugas sedang membaca ke atas.
  useEffect(() => {
    const el = logRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight;
  }, [baris]);

  useEffect(() => {
    let batal = false;
    let ruang: Room | null = null;
    const wadahSuara = suaraRef.current;
    // Siaran publik: atribut pelapor hanya dibulatkan 2 desimal; titik persis
    // datang lewat topik "lokasi". Sekali titik persis tiba, atribut yang
    // dibulatkan tidak lagi menimpanya.
    let adaPersis = false;
    const dariAtribut = (a: Record<string, string>) => {
      const t = titikDari(a.lat, a.lng);
      if (!t) return;
      const persis = !publik || !kasar(t);
      if (adaPersis && !persis) return;
      setLokasi({ ...t, akurasi: angkaAtauNull(a.akurasi), waktu: angkaAtauNull(a.waktu) ?? Date.now(), persis });
    };

    (async () => {
      let lk: typeof import("livekit-client");
      try {
        lk = await import("livekit-client");
      } catch {
        if (!batal) setStatus("Pustaka siaran gagal dimuat. Muat ulang halaman.");
        return;
      }
      let sambungan: { url: string; token: string };
      try {
        const r = await fetch(`/api/admin/siaran/token?ruang=${encodeURIComponent(namaRuang)}`, { cache: "no-store" });
        const isi = await r.json().catch(() => null);
        if (!r.ok || !isi?.token) {
          if (!batal) setStatus(isi?.galat ?? `Gagal mengambil token penonton (HTTP ${r.status}).`);
          return;
        }
        sambungan = isi;
      } catch {
        if (!batal) setStatus("Koneksi terputus. Tutup lalu tonton lagi.");
        return;
      }
      if (batal) return;

      const { Room, RoomEvent, Track } = lk;
      const r = new Room({ adaptiveStream: true, dynacast: true });
      ruang = r;
      ruangRef.current = r;
      const pelaporDi = () => [...r.remoteParticipants.values()].find((p) => p.identity.startsWith(AWALAN_PELAPOR));
      const namaDari = (identity: string) => r.remoteParticipants.get(identity)?.name || peranDari(identity) || "Warga";

      r.registerTextStreamHandler(TOPIK_KOMENTAR, async (reader, { identity }) => {
        const isi = (await reader.readAll()).trim().slice(0, BATAS_KOMENTAR);
        if (!isi || batal) return;
        setBaris(tambahkan({ nama: namaDari(identity), teks: isi, peran: peranDari(identity) }));
      });
      r.registerTextStreamHandler(TOPIK_SUKA, async (reader) => {
        const n = Math.min(50, Math.max(1, parseInt(await reader.readAll(), 10) || 1));
        if (!batal) setSuka((s) => s + n);
      });
      if (HADIAH_AKTIF) {
        r.registerTextStreamHandler(TOPIK_HADIAH, async (reader, { identity }) => {
          const k = bacaHadiah(await reader.readAll());
          if (!k || batal) return;
          setBaris(tambahkan({
            nama: namaDari(identity), peran: peranDari(identity), kabar: true,
            teks: `mengirim ${k.hadiah.emoji} ${k.hadiah.nama}${k.jumlah > 1 ? ` ×${k.jumlah}` : ""}`,
          }));
        });
      }
      r.registerTextStreamHandler(TOPIK_LOKASI, async (reader, { identity }) => {
        const teks = await reader.readAll();
        if (batal || !identity.startsWith(AWALAN_PELAPOR)) return;
        let isi;
        try {
          isi = JSON.parse(teks);
        } catch {
          return;
        }
        const t = titikDari(isi?.lat, isi?.lng);
        if (!t) return;
        adaPersis = true;
        setLokasi({ ...t, akurasi: angkaAtauNull(isi.akurasi), waktu: angkaAtauNull(isi.waktu) ?? Date.now(), persis: true });
      });

      r.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Video) {
          if (videoRef.current) track.attach(videoRef.current);
          setStatus(null);
        } else if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.hidden = true;
          wadahSuara?.append(el);
        }
      })
        .on(RoomEvent.TrackUnsubscribed, (track) => {
          track.detach().forEach((el) => el !== videoRef.current && el.remove());
        })
        .on(RoomEvent.ParticipantAttributesChanged, (_ubah, p) => {
          if (p.identity.startsWith(AWALAN_PELAPOR)) dariAtribut(p.attributes);
        })
        .on(RoomEvent.ConnectionQualityChanged, (q, p) => {
          if (p.identity.startsWith(AWALAN_PELAPOR)) setKualitas(KUALITAS[q] ?? "…");
        })
        .on(RoomEvent.ParticipantDisconnected, (p) => {
          if (p.identity.startsWith(AWALAN_PELAPOR)) setStatus("Pelapor mengakhiri siaran.");
        })
        .on(RoomEvent.Reconnecting, () => setStatus("Koneksi terputus — menyambung ulang…"))
        .on(RoomEvent.Reconnected, () => setStatus(null))
        .on(RoomEvent.AudioPlaybackStatusChanged, () => setBisaSuara(r.canPlaybackAudio))
        .on(RoomEvent.Disconnected, () => {
          if (!batal) setStatus("Siaran berakhir.");
        });

      try {
        await r.connect(sambungan.url, sambungan.token);
      } catch (e) {
        if (!batal) setStatus(`Tidak bisa bergabung: ${(e as Error).message}`);
        return;
      }
      if (batal) {
        r.disconnect();
        return;
      }
      const pelapor = pelaporDi();
      if (!pelapor) setStatus("Pelapor sudah tidak ada di ruang ini.");
      else {
        dariAtribut(pelapor.attributes);
        setKualitas(KUALITAS[pelapor.connectionQuality] ?? "…");
        if (!pelapor.videoTrackPublications.size) setStatus("Menunggu video dari pelapor…");
      }
      r.startAudio().catch(() => {});
      setBisaSuara(r.canPlaybackAudio);
    })();

    return () => {
      batal = true;
      ruangRef.current = null;
      ruang?.disconnect();
      wadahSuara?.replaceChildren();
    };
  }, [namaRuang, publik]);

  const kirimKomentar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const isi = String(new FormData(form).get("isi") ?? "").trim().slice(0, BATAS_KOMENTAR);
    const r = ruangRef.current;
    if (!isi || !r) return;
    setMengirim(true);
    try {
      await r.localParticipant.sendText(isi, { topic: TOPIK_KOMENTAR });
      setBaris(tambahkan({ nama: "Anda", teks: isi, peran: "Petugas", saya: true }));
      form.reset();
    } catch (err) {
      kabari(`Komentar gagal terkirim: ${(err as Error).message}`, "galat");
    } finally {
      setMengirim(false);
    }
  };

  // Hati & hadiah: ketukan beruntun digabung per 400 ms jadi satu pesan per jenis.
  const kirimApresiasi = (id: string) => {
    if (!ruangRef.current) return;
    if (id === "hati") setSuka((s) => s + 1);
    tertunda.current.set(id, (tertunda.current.get(id) ?? 0) + 1);
    if (pengatur.current) return;
    pengatur.current = setTimeout(() => {
      pengatur.current = null;
      const r = ruangRef.current;
      for (const [kode, jumlah] of tertunda.current) {
        if (kode === "hati") {
          r?.localParticipant.sendText(String(jumlah), { topic: TOPIK_SUKA }).catch(() => {});
          continue;
        }
        const h = DAFTAR_HADIAH.find((x) => x.id === kode);
        if (!h || !r) continue;
        r.localParticipant.sendText(JSON.stringify({ id: kode, jumlah }), { topic: TOPIK_HADIAH }).catch(() => {});
        setBaris(tambahkan({ nama: "Anda", peran: "Petugas", kabar: true, saya: true, teks: `mengirim ${h.emoji} ${h.nama}${jumlah > 1 ? ` ×${jumlah}` : ""}` }));
      }
      tertunda.current.clear();
    }, 400);
  };

  const umurLokasi = lokasi?.waktu && kini ? Math.max(0, Math.round((kini - lokasi.waktu) / 1000)) : null;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
      <div className="relative mx-auto aspect-[9/16] max-h-[78dvh] w-full max-w-[440px] overflow-hidden rounded-[var(--jari-kartu)] bg-black text-white">
        <video ref={videoRef} autoPlay playsInline muted className="block size-full bg-black object-contain" />
        <div className="absolute inset-x-3 top-3 flex flex-wrap items-center gap-1.5 text-[12px] font-semibold tabular-nums">
          <span className="inline-flex items-center gap-1.5 rounded-[4px] bg-[#e5484d] px-2 py-0.5 tracking-wide">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-white" />LIVE
          </span>
          <span className="rounded-[4px] bg-black/60 px-2 py-0.5">{kini ? durasi(kini - siaran.mulai) : "--:--"}</span>
          <span className="rounded-[4px] bg-black/60 px-2 py-0.5">♥ {suka}</span>
          <span className="rounded-[4px] bg-black/60 px-2 py-0.5">{siaran.penonton} menonton</span>
          <span className="ml-auto rounded-[4px] bg-black/60 px-2 py-0.5">Sinyal pelapor: {kualitas}</span>
        </div>
        {status && (
          <div role="status" className="absolute inset-0 grid place-items-center bg-black/55 p-6 text-center text-[14px] font-semibold">
            {status}
          </div>
        )}
        {!bisaSuara && (
          <button type="button" onClick={() => ruangRef.current?.startAudio().then(() => setBisaSuara(true)).catch(() => {})}
                  className="cms-tombol cms-tombol--utama absolute bottom-3 left-1/2 -translate-x-1/2">
            Nyalakan suara
          </button>
        )}
        <div ref={suaraRef} hidden />
      </div>

      <div className="grid min-w-0 gap-5">
        <Kartu
          judul={<span className="[overflow-wrap:anywhere]">{siaran.judul}</span>}
          deskripsi={<>
            {siaran.nama} · mulai <time suppressHydrationWarning>{jam.format(siaran.mulai)}</time> ·{" "}
            {siaran.publik ? "publik, warga ikut menonton" : "khusus petugas"}
          </>}
          aksi={<button type="button" onClick={onTutup} className="cms-tombol cms-tombol--hantu cms-tombol--kecil">Berhenti menonton</button>}
          kaki={<>
            <TombolAkhiri ruang={siaran.ruang} lalu={onBerakhir} ringkas />
            <span className="text-[12.5px] text-[var(--lirih)]">Mengakhiri siaran memutus pelapor dan semua penonton.</span>
          </>}
        />

        <Kartu judul="Lokasi pelapor"
               deskripsi={lokasi && !lokasi.persis ? "Perkiraan ±1 km dari beranda warga — titik persis menyusul dari HP pelapor." : undefined}
               aksi={lokasi && (
                 <a href={`https://www.google.com/maps?q=${lokasi.lat},${lokasi.lng}`} target="_blank" rel="noreferrer"
                    className="cms-tombol cms-tombol--garis cms-tombol--kecil">
                   Google Maps
                 </a>
               )}>
          {lokasi ? (
            <div className="grid gap-3">
              <div>
                <p className="cms-angka text-[15px] font-semibold">{lokasi.lat.toFixed(6)}, {lokasi.lng.toFixed(6)}</p>
                <p className="mt-0.5 text-[12.5px] text-[var(--lirih)]">
                  {[
                    lokasi.akurasi !== null && `akurasi ±${Math.round(lokasi.akurasi)} m`,
                    umurLokasi !== null && `diperbarui ${umurLokasi < 5 ? "baru saja" : `${umurLokasi} dtk lalu`}`,
                  ].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              {/* Perkiraan → titik persis bisa melompat ~1 km: peta dipasang ulang di titik baru. */}
              <PetaSiaran key={lokasi.persis ? "persis" : "perkiraan"} lat={lokasi.lat} lng={lokasi.lng} />
            </div>
          ) : (
            <p className="text-[13px] text-[var(--lirih)]">Pelapor belum mengirim lokasi.</p>
          )}
        </Kartu>

        <Kartu judul="Komentar" deskripsi="Muncul di layar HP pelapor dan penonton lain." isi="">
          <ol ref={logRef} aria-live="polite" className="grid max-h-[280px] content-start gap-2 overflow-y-auto px-5 py-4 text-[13.5px]">
            {baris.length === 0 && <li className="text-[var(--lirih)]">Belum ada komentar.</li>}
            {baris.map((b) => (
              <li key={b.id} className="[overflow-wrap:anywhere]">
                <span className={`mr-1.5 font-semibold ${b.saya ? "text-[var(--limau)]" : ""}`}>{b.nama}</span>
                {b.peran && (
                  <span className={`cms-cap mr-1.5 align-[1px] ${b.peran === "Pelapor" ? "cms-cap--perhatian" : "cms-cap--diam"}`}>{b.peran}</span>
                )}
                <span className={b.kabar ? "text-[var(--lirih)]" : ""}>{b.teks}</span>
              </li>
            ))}
          </ol>
          <form onSubmit={kirimKomentar} data-tanpa-jaga autoComplete="off"
                className="flex gap-2 border-t border-[var(--garis)] px-5 py-3">
            <label htmlFor="isi-komentar-siaran" className="sr-only">Komentar untuk pelapor</label>
            <input id="isi-komentar-siaran" name="isi" maxLength={BATAS_KOMENTAR} required
                   placeholder="Komentar sebagai petugas…" className="cms-isian min-w-0 flex-1" />
            <button type="submit" disabled={mengirim} aria-busy={mengirim} className="cms-tombol cms-tombol--utama">
              {mengirim && <Pemuat />}
              Kirim
            </button>
          </form>
        </Kartu>

        <Kartu judul="Apresiasi" deskripsi="Simbolis, tanpa koin. Tampil di layar HP pelapor.">
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
            <button type="button" onClick={() => kirimApresiasi("hati")}
                    className="cms-tombol cms-tombol--garis h-auto flex-col gap-0.5 py-2 text-[12px]">
              <span aria-hidden="true" className="text-[22px] leading-none text-[#e5484d]">♥</span>Hati
            </button>
            {HADIAH_AKTIF && DAFTAR_HADIAH.map((h) => (
              <button key={h.id} type="button" onClick={() => kirimApresiasi(h.id)}
                      className="cms-tombol cms-tombol--garis h-auto flex-col gap-0.5 py-2 text-[12px]">
                <span aria-hidden="true" className="text-[22px] leading-none">{h.emoji}</span>{h.nama}
              </button>
            ))}
          </div>
        </Kartu>
      </div>
    </div>
  );
}
