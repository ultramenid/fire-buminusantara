import { lewatBatas } from "./batas-laju.ts";
import { catatGalat } from "./catat-galat.ts";
import { prisma } from "./prisma.ts";

/**
 * Notifikasi push aplikasi mobile lewat Expo Push Service (kontrak: docs/NOTIFIKASI.md di repo
 * aplikasi). Penerimanya setiap pemasang aplikasi yang mendaftarkan perangkat — dengan atau tanpa
 * akun — dan belum mematikan jenis itu di Pengaturan:
 *
 * - `live`: siaran langsung publik yang baru mulai (lib/siaran.ts, setelah pelapor tersambung).
 * - `laporan`: kejadian yang baru ditayangkan petugas dari CMS (app/admin/kejadian/aksi.ts).
 *
 * Expo meneruskan ke FCM (Android) & APNs (iOS) memakai kredensial proyek EAS. EXPO_ACCESS_TOKEN
 * hanya perlu bila "enhanced security for push notifications" dinyalakan di proyek Expo.
 */

export type JenisPush = "live" | "laporan";
export type PesanPush = { judul: string; isi: string; data: Record<string, unknown> };

const EXPO_PUSH = "https://exp.host/--/api/v2/push/send";
/** Batas Expo per permintaan. */
export const PER_KIRIM = 100;

/** Token Expo: `ExponentPushToken[…]` (atau `ExpoPushToken[…]`). */
export function tokenPushSah(token: unknown): token is string {
  return typeof token === "string" && token.length <= 255 && /^Expo(nent)?PushToken\[[\w-]{8,}\]$/.test(token);
}

export function pecah<T>(daftar: readonly T[], n: number): T[][] {
  const hasil: T[][] = [];
  for (let i = 0; i < daftar.length; i += n) hasil.push(daftar.slice(i, i + n));
  return hasil;
}

/** Daftarkan / perbarui perangkat beserta pilihannya. */
export async function simpanPerangkat(
  token: string,
  platform: string,
  pilihan: { live: boolean; laporan: boolean },
): Promise<void> {
  const sekarang = new Date();
  await prisma.mobile_push_tokens.upsert({
    where: { token },
    create: { token, platform, ...pilihan, created_at: sekarang, updated_at: sekarang },
    update: { platform, ...pilihan, updated_at: sekarang },
  });
}

/** Perangkat berhenti menerima notifikasi (izin dicabut, aplikasi keluar dari daftar). */
export async function hapusPerangkat(token: string): Promise<void> {
  await prisma.mobile_push_tokens.deleteMany({ where: { token } });
}

type Tiket = { status?: string; details?: { error?: string } };

/**
 * Kirim ke semua perangkat yang menerima `jenis`. Tidak pernah melempar: kegagalan dicatat
 * (catatGalat). Token yang ditolak Expo karena perangkatnya tidak terdaftar lagi dibuang.
 */
export async function kirimPush(jenis: JenisPush, pesan: PesanPush): Promise<{ dikirim: number; dibuang: number }> {
  let dikirim = 0;
  const mati: string[] = [];
  try {
    const perangkat = await prisma.mobile_push_tokens.findMany({ where: { [jenis]: true }, select: { token: true } });
    const kunci = process.env.EXPO_ACCESS_TOKEN ?? "";
    for (const bagian of pecah(perangkat.map((p) => p.token), PER_KIRIM)) {
      const r = await fetch(EXPO_PUSH, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(kunci && { Authorization: `Bearer ${kunci}` }),
        },
        body: JSON.stringify(
          bagian.map((to) => ({
            to,
            title: pesan.judul,
            body: pesan.isi,
            data: pesan.data,
            sound: "default",
            priority: "high",
            // Kanal Android yang dibuat aplikasi (src/lib/notifikasi-push.ts): bisa dimatikan terpisah.
            channelId: jenis,
          })),
        ),
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) {
        await catatGalat("kirimPush", new Error(`Expo Push HTTP ${r.status}`), `jenis=${jenis}`);
        continue;
      }
      const tiket = ((await r.json().catch(() => null)) as { data?: Tiket[] } | null)?.data ?? [];
      tiket.forEach((t, i) => {
        if (t?.status === "ok") dikirim++;
        else if (t?.details?.error === "DeviceNotRegistered") mati.push(bagian[i]);
      });
    }
    if (mati.length > 0) await prisma.mobile_push_tokens.deleteMany({ where: { token: { in: mati } } });
  } catch (e) {
    await catatGalat("kirimPush", e, `jenis=${jenis}`);
  }
  return { dikirim, dibuang: mati.length };
}

/** Kejadian lebih tua dari ini tidak dikabarkan sebagai "laporan baru" (mis. arsip yang baru ditayangkan). */
export const UMUR_KABAR_MS = 7 * 24 * 60 * 60_000;

/**
 * Kejadian yang baru tayang → notifikasi "laporan". Dipanggil SETELAH tersimpan (di luar transaksi)
 * dan hanya saat statusnya berubah menjadi tayang; di sini diperiksa lagi dari DB. Sekali per
 * kejadian (turun lalu tayang lagi tidak mengabari ulang). Tidak pernah melempar.
 */
export async function umumkanKejadianTayang(id: number): Promise<void> {
  try {
    const k = await prisma.events.findUnique({
      where: { id },
      select: { status: true, title_id: true, location: true, event_date: true },
    });
    if (!k || k.status !== "published" || Date.now() - k.event_date.getTime() > UMUR_KABAR_MS) return;
    if (await lewatBatas(`notif-laporan:${id}`, 1, 30 * 24 * 3600)) return;
    kirimPushLatar("laporan", {
      judul: "Laporan karhutla terverifikasi",
      isi: `${k.title_id} · ${k.location}`,
      data: { jenis: "laporan", beritaId: id },
    });
  } catch (e) {
    await catatGalat("umumkanKejadianTayang", e, `id=${id}`);
  }
}

/** Tanpa ditunggu: aksi CMS & rute siaran tidak tertahan oleh Expo. */
export function kirimPushLatar(jenis: JenisPush, pesan: PesanPush): void {
  void kirimPush(jenis, pesan).then(({ dikirim, dibuang }) => {
    console.info(`[push] ${jenis}: ${dikirim} terkirim, ${dibuang} token dibuang`);
  });
}
