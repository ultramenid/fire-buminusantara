/**
 * Satu pintu untuk galat server yang harus diketahui manusia.
 *
 * Selalu ke log container (console.error). Bila ALERT_WEBHOOK_URL disetel,
 * juga POST ke sana — bentuk `{ text, content }` dibaca webhook Slack (text)
 * maupun Discord (content). Insiden image_en: Verifikasi gagal berhari-hari
 * dan satu-satunya jejak adalah teks merah di kartu CMS.
 *
 * Tanpa impor node-only: dipanggil juga dari instrumentation.ts.
 */
const terakhir = new Map<string, number>();
const JEDA_MS = 5 * 60_000; // satu label paling sering sekali per 5 menit

export async function catatGalat(label: string, e: unknown, rincian?: string): Promise<void> {
  console.error(`[${label}]`, rincian ?? "", e);

  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  const kini = Date.now();
  if (kini - (terakhir.get(label) ?? 0) < JEDA_MS) return;
  terakhir.set(label, kini);

  const pesan = e instanceof Error ? e.message : String(e);
  const digest = typeof e === "object" && e !== null && "digest" in e ? ` (digest ${String(e.digest)})` : "";
  // Potong: pesan Prisma bisa ribuan karakter, dan webhook menolak yang panjang.
  const teks = `🔥 Pasopati Fire — ${label}${rincian ? ` ${rincian}` : ""}${digest}\n${pesan.slice(0, 1500)}`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: teks, content: teks }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Alarm yang gagal tidak boleh menggagalkan permintaan; log di atas tetap ada.
  }
}
