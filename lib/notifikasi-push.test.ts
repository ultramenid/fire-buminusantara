import { test } from "node:test";
import assert from "node:assert/strict";
import { kirimPush, pecah, PER_KIRIM, tokenPushSah, umumkanKejadianTayang, UMUR_KABAR_MS } from "./notifikasi-push.ts";

type Uji = { after: (f: () => void) => void };

/** Prisma palsu lewat globalThis.prisma (dibaca lib/prisma.ts lebih dulu). */
function prismaPalsu(t: Uji, isi: { token?: string[]; kejadian?: Record<number, Record<string, unknown>> }) {
  const ruang = globalThis as { prisma?: unknown };
  const lama = ruang.prisma;
  t.after(() => void (ruang.prisma = lama));
  const catat = { cari: [] as unknown[], buang: [] as unknown[] };
  ruang.prisma = {
    mobile_push_tokens: {
      findMany: async (a: unknown) => {
        catat.cari.push(a);
        return (isi.token ?? []).map((token) => ({ token }));
      },
      deleteMany: async (a: unknown) => void catat.buang.push(a),
    },
    events: {
      findUnique: async ({ where }: { where: { id: number } }) => isi.kejadian?.[where.id] ?? null,
    },
  };
  return catat;
}

/** fetch palsu ke Expo Push: `tiket(pesan)` menentukan jawabannya per pesan. */
function expoPalsu(t: Uji, tiket: (pesan: { to: string }) => Record<string, unknown> = () => ({ status: "ok" })) {
  const asli = globalThis.fetch;
  t.after(() => void (globalThis.fetch = asli));
  const kiriman: { url: string; kepala: Record<string, string>; pesan: Record<string, unknown>[] }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const pesan = JSON.parse(String(init.body)) as { to: string }[];
    kiriman.push({ url: String(url), kepala: init.headers as Record<string, string>, pesan });
    return Response.json({ data: pesan.map(tiket) });
  }) as typeof fetch;
  return kiriman;
}

const token = (n: number) => `ExponentPushToken[uji${String(n).padStart(6, "0")}]`;
const tunggu = () => new Promise((r) => setTimeout(r, 20));

test("tokenPushSah: hanya token Expo", () => {
  assert.ok(tokenPushSah("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"));
  assert.ok(tokenPushSah("ExpoPushToken[abc_DEF-123456]"));
  for (const salah of ["", "ExponentPushToken[]", "ExponentPushToken[a b]", "fcm:abcdef", 42, null, `ExponentPushToken[${"a".repeat(260)}]`]) {
    assert.equal(tokenPushSah(salah), false, String(salah));
  }
});

test("pecah: kelompok sebesar batas Expo", () => {
  assert.deepEqual(pecah([...Array(250).keys()], PER_KIRIM).map((b) => b.length), [100, 100, 50]);
  assert.deepEqual(pecah([], PER_KIRIM), []);
});

test("kirimPush: hanya perangkat yang memilih jenis itu, kanal Android = jenis, token mati dibuang", async (t) => {
  const catat = prismaPalsu(t, { token: [token(1), token(2), token(3)] });
  const kiriman = expoPalsu(t, ({ to }) =>
    to === token(2)
      ? { status: "error", details: { error: "DeviceNotRegistered" } }
      : to === token(3)
        ? { status: "error", details: { error: "MessageRateExceeded" } }
        : { status: "ok" },
  );
  const hasil = await kirimPush("live", { judul: "🔴 Budi sedang live", isi: "Api", data: { jenis: "live", ruang: "siaran-x" } });

  assert.deepEqual(hasil, { dikirim: 1, dibuang: 1 });
  assert.deepEqual(catat.cari, [{ where: { live: true }, select: { token: true } }]);
  assert.equal(kiriman.length, 1);
  assert.equal(kiriman[0].url, "https://exp.host/--/api/v2/push/send");
  assert.deepEqual(kiriman[0].pesan[0], {
    to: token(1),
    title: "🔴 Budi sedang live",
    body: "Api",
    data: { jenis: "live", ruang: "siaran-x" },
    sound: "default",
    priority: "high",
    channelId: "live",
  });
  // Hanya DeviceNotRegistered yang dibuang; galat sementara (rate) tidak.
  assert.deepEqual(catat.buang, [{ where: { token: { in: [token(2)] } } }]);
});

test("kirimPush: 150 perangkat = 2 permintaan; EXPO_ACCESS_TOKEN dikirim bila diset", async (t) => {
  prismaPalsu(t, { token: [...Array(150).keys()].map(token) });
  const kiriman = expoPalsu(t);
  const lama = process.env.EXPO_ACCESS_TOKEN;
  process.env.EXPO_ACCESS_TOKEN = "rahasia-uji";
  t.after(() => {
    if (lama === undefined) delete process.env.EXPO_ACCESS_TOKEN;
    else process.env.EXPO_ACCESS_TOKEN = lama;
  });
  const hasil = await kirimPush("laporan", { judul: "x", isi: "y", data: {} });
  assert.deepEqual(kiriman.map((k) => k.pesan.length), [100, 50]);
  assert.equal(kiriman[0].kepala.Authorization, "Bearer rahasia-uji");
  assert.equal(kiriman[0].pesan[0].channelId, "laporan");
  assert.equal(hasil.dikirim, 150);
});

test("kirimPush: Expo tidak terjangkau tidak melempar", async (t) => {
  prismaPalsu(t, { token: [token(1)] });
  const asli = globalThis.fetch;
  t.after(() => void (globalThis.fetch = asli));
  globalThis.fetch = (async () => {
    throw new Error("ECONNRESET");
  }) as typeof fetch;
  const galat = console.error;
  console.error = () => {};
  t.after(() => void (console.error = galat));
  assert.deepEqual(await kirimPush("live", { judul: "x", isi: "y", data: {} }), { dikirim: 0, dibuang: 0 });
});

test("umumkanKejadianTayang: hanya kejadian tayang yang baru, sekali per kejadian", async (t) => {
  const kini = new Date();
  const lama = new Date(Date.now() - UMUR_KABAR_MS - 86_400_000);
  prismaPalsu(t, {
    token: [token(1)],
    kejadian: {
      9101: { status: "published", title_id: "Api di Katingan", location: "Katingan, Kalimantan Tengah", event_date: kini },
      9102: { status: "draft", title_id: "Draf", location: "-", event_date: kini },
      9103: { status: "published", title_id: "Arsip lama", location: "-", event_date: lama },
    },
  });
  const kiriman = expoPalsu(t);
  const info = console.info;
  console.info = () => {};
  t.after(() => void (console.info = info));

  await umumkanKejadianTayang(9102);
  await umumkanKejadianTayang(9103);
  await umumkanKejadianTayang(9999);
  await tunggu();
  assert.equal(kiriman.length, 0, "draft, kejadian lama, dan yang tidak ada tidak dikabarkan");

  await umumkanKejadianTayang(9101);
  await umumkanKejadianTayang(9101);
  await tunggu();
  assert.equal(kiriman.length, 1, "sekali saja walau ditayangkan ulang");
  assert.deepEqual(kiriman[0].pesan[0].data, { jenis: "laporan", beritaId: 9101 });
  assert.equal(kiriman[0].pesan[0].body, "Api di Katingan · Katingan, Kalimantan Tengah");
});
