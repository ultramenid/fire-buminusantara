import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { gpsDariBerkas, exifDariBerkas } from "./unggah.ts";

/** JPEG kosong (tanpa EXIF GPS) sebagai gambar dasar penguji. */
async function jpegPolos(): Promise<Buffer> {
  return sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 20, g: 180, b: 20 } },
  })
    .jpeg()
    .toBuffer();
}

/** JPEG + tag GPS EXIF (3°35'4"S, 98°40'33"E → lat -3.584444, lng 98.675833). */
async function jpegDenganGps(): Promise<Buffer> {
  return sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 20, g: 180, b: 20 } },
  })
    .withMetadata({
      exif: {
        IFD0: { Make: "Simontini", Model: "FireCam S1" },
        IFD2: { DateTimeOriginal: "2026:08:15 09:14:22", CreateDate: "2026:08:15 09:14:22" },
        IFD3: {
          GPSLatitudeRef: "S",
          GPSLatitude: "3/1 35/1 4/1",
          GPSLongitudeRef: "E",
          GPSLongitude: "98/1 40/1 33/1",
        },
      },
    })
    .jpeg()
    .toBuffer();
}

/** Bungkus Buffer sebagai File semampunya (hanya butuh arrayBuffer()). */
function buatFile(buf: Buffer): File {
  return {
    name: "uji.jpg",
    type: "image/jpeg",
    size: buf.length,
    arrayBuffer: async () =>
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  } as unknown as File;
}

/** Satu box MP4: `[u32 size][4cc type][payload]`. */
function box(tipe: string, payload: Buffer): Buffer {
  const hdr = Buffer.alloc(8);
  hdr.writeUInt32BE(payload.length + 8, 0);
  hdr.write(tipe, 4, "latin1");
  return Buffer.concat([hdr, payload]);
}

/** Box `data` (version/flags 4 + locale 4 + teks) seperti di seek video. */
function dataBox(teks: string): Buffer {
  const s = Buffer.from(teks, "latin1");
  const payload = Buffer.alloc(8 + s.length);
  s.copy(payload, 8);
  return box("data", payload);
}

/** MP4 tiruan: ftyp + moov › udta › meta › ilst yang memuat ISO6709. */
function mp4DenganGps(iso6709: string): Buffer {
  const meta = box(
    "meta",
    Buffer.concat([Buffer.alloc(4), box("ilst", box("mdta", dataBox(iso6709)))]),
  );
  const udta = box("udta", meta);
  const moov = box("moov", udta);
  return Buffer.concat([box("ftyp", Buffer.from("isom", "latin1")), moov]);
}

test("membaca GPS EXIF dari gambar", async () => {
  const gps = await gpsDariBerkas(buatFile(await jpegDenganGps()));
  assert.ok(gps, "harus mengembalikan koordinat");
  // 3°35'04"S → -3,584444; 98°40'33"E → 98,675833
  assert.ok(Math.abs(gps.lat - -3.584444) < 0.001, `lat ${gps.lat}`);
  assert.ok(Math.abs(gps.lng - 98.675833) < 0.001, `lng ${gps.lng}`);
});

test("mengembalikan null untuk gambar tanpa GPS EXIF", async () => {
  const gps = await gpsDariBerkas(buatFile(await jpegPolos()));
  assert.equal(gps, null);
});

test("mengembalikan null untuk isi yang bukan gambar, tanpa melempar", async () => {
  const bukanGambar = Buffer.from("ini bukan gambar");
  const gps = await gpsDariBerkas(buatFile(bukanGambar));
  assert.equal(gps, null);
});

test("membaca GPS dari video MP4 (ISO6709 QuickTime)", async () => {
  const mp4 = mp4DenganGps("+03.5844+098.6758+000.000/");
  const gps = await gpsDariBerkas(buatFile(mp4));
  assert.ok(gps, "harus mengembalikan koordinat");
  assert.ok(Math.abs(gps.lat - 3.5844) < 0.0001, `lat ${gps.lat}`);
  assert.ok(Math.abs(gps.lng - 98.6758) < 0.0001, `lng ${gps.lng}`);
});

test("membaca GPS belahan selatan/barat dari video MP4", async () => {
  const mp4 = mp4DenganGps("-06.2000-106.8167+025.000/");
  const gps = await gpsDariBerkas(buatFile(mp4));
  assert.ok(gps, "harus mengembalikan koordinat");
  assert.ok(Math.abs(gps.lat - -6.2) < 0.0001, `lat ${gps.lat}`);
  assert.ok(Math.abs(gps.lng - -106.8167) < 0.0001, `lng ${gps.lng}`);
});

test("mengembalikan null untuk video tanpa metadata GPS", async () => {
  const mp4 = box("udta", box("meta", Buffer.concat([Buffer.alloc(4), box("ilst", box("mdta", dataBox("hello"))) ])));
  const video = Buffer.concat([box("ftyp", Buffer.from("isom", "latin1")), box("moov", mp4)]);
  const gps = await gpsDariBerkas(buatFile(video));
  assert.equal(gps, null);
});

test("exifDariBerkas membaca koordinat dan waktu pengambilan", async () => {
  const file = buatFile(await jpegDenganGps());
  const exif = await exifDariBerkas(file);
  assert.ok(exif, "harus mengembalikan objek exif");
  assert.ok(exif.lat !== undefined && Math.abs(exif.lat - -3.584444) < 0.001);
  assert.ok(exif.lng !== undefined && Math.abs(exif.lng - 98.675833) < 0.001);
  assert.ok(exif.waktu && exif.waktu.includes("Agustus 2026"));
});
