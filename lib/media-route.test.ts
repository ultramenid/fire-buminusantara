import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { GET } from "../app/media/[...path]/route.ts";

const AKAR_MEDIA = path.join(process.cwd(), "media");
const UJI_DIR = path.join(AKAR_MEDIA, "uji-route");
const UJI_FILE = path.join(UJI_DIR, "foto.jpg");
const KONTEN_UJI = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

test("media route: melayani berkas lokal dengan header lengkap", async (t) => {
  await mkdir(UJI_DIR, { recursive: true });
  await writeFile(UJI_FILE, KONTEN_UJI);

  t.after(async () => {
    await rm(UJI_DIR, { recursive: true, force: true });
  });

  const req = new Request("http://localhost/media/uji-route/foto.jpg");
  const res = await GET(req, { params: Promise.resolve({ path: ["uji-route", "foto.jpg"] }) });

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/jpeg");
  assert.equal(res.headers.get("content-length"), String(KONTEN_UJI.length));
  assert.equal(res.headers.get("accept-ranges"), "bytes");
  assert.ok(res.headers.get("etag"), "harus menyertakan ETag");
  assert.ok(res.headers.get("last-modified"), "harus menyertakan Last-Modified");

  const etag = res.headers.get("etag")!;

  // 304 Not Modified dengan If-None-Match
  const req304 = new Request("http://localhost/media/uji-route/foto.jpg", {
    headers: { "if-none-match": etag },
  });
  const res304 = await GET(req304, { params: Promise.resolve({ path: ["uji-route", "foto.jpg"] }) });
  assert.equal(res304.status, 304);
  assert.equal(res304.headers.get("etag"), etag);

  // 304 Not Modified dengan If-Modified-Since
  const lastModified = res.headers.get("last-modified")!;
  const reqIms = new Request("http://localhost/media/uji-route/foto.jpg", {
    headers: { "if-modified-since": lastModified },
  });
  const resIms = await GET(reqIms, { params: Promise.resolve({ path: ["uji-route", "foto.jpg"] }) });
  assert.equal(resIms.status, 304);

  // 206 Partial Content dengan Range
  const reqRange = new Request("http://localhost/media/uji-route/foto.jpg", {
    headers: { range: "bytes=0-3" },
  });
  const resRange = await GET(reqRange, { params: Promise.resolve({ path: ["uji-route", "foto.jpg"] }) });
  assert.equal(resRange.status, 206);
  assert.equal(resRange.headers.get("content-range"), `bytes 0-3/${KONTEN_UJI.length}`);
  assert.equal(resRange.headers.get("content-length"), "4");
  const bytes = Buffer.from(await resRange.arrayBuffer());
  assert.equal(bytes.length, 4);
  assert.deepEqual(bytes, KONTEN_UJI.subarray(0, 4));

  // Penjagaan path traversal
  const reqJahat = new Request("http://localhost/media/../package.json");
  const resJahat = await GET(reqJahat, { params: Promise.resolve({ path: ["..", "package.json"] }) });
  assert.equal(resJahat.status, 404);
});

test("media route: stream langsung via GetObjectCommand tanpa HeadObjectCommand dan mendukung 304", async (t) => {
  const { getMinioClient } = await import("./unggah.ts");
  const client = getMinioClient();
  const originalSend = client.send;

  const perintahTerkirim: string[] = [];
  let simulasiRange: string | undefined;

  type S3ClientMock = {
    send: (cmd: unknown) => Promise<unknown>;
  };
  type S3CommandMock = {
    constructor?: { name?: string };
    input?: { Range?: string; IfNoneMatch?: string };
  };

  // Mock client.send
  (client as unknown as S3ClientMock).send = async (rawCmd: unknown) => {
    const cmd = rawCmd as S3CommandMock;
    const namaPerintah = cmd.constructor?.name || "UnknownCommand";
    perintahTerkirim.push(namaPerintah);

    if (namaPerintah === "GetObjectCommand") {
      simulasiRange = cmd.input?.Range;

      if (cmd.input?.IfNoneMatch === '"s3-etag-123"') {
        const err = Object.assign(new Error("Not Modified"), {
          $metadata: { httpStatusCode: 304 },
        });
        throw err;
      }

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3, 4]));
          controller.close();
        },
      });

      return {
        $metadata: { httpStatusCode: cmd.input?.Range ? 206 : 200 },
        Body: stream,
        ContentLength: 4,
        ContentType: "image/webp",
        ETag: '"s3-etag-123"',
        LastModified: new Date("2026-09-01T12:00:00Z"),
        ContentRange: cmd.input?.Range ? "bytes 0-3/4" : undefined,
      };
    }

    throw new Error(`Unexpected command: ${namaPerintah}`);
  };

  t.after(() => {
    (client as unknown as S3ClientMock).send = originalSend as unknown as S3ClientMock["send"];
  });

  // 1. Permintaan biasa ke MinIO
  const req1 = new Request("http://localhost/media/gambar/uji.webp");
  const res1 = await GET(req1, { params: Promise.resolve({ path: ["gambar", "uji.webp"] }) });

  assert.equal(res1.status, 200);
  assert.equal(res1.headers.get("content-type"), "image/webp");
  assert.equal(res1.headers.get("etag"), '"s3-etag-123"');
  assert.equal(res1.headers.get("content-length"), "4");
  assert.equal(perintahTerkirim.includes("HeadObjectCommand"), false, "HeadObjectCommand TIDAK boleh dipanggil");
  assert.equal(perintahTerkirim.filter((p) => p === "GetObjectCommand").length, 1);

  // 2. Permintaan dengan If-None-Match menghasilkan 304
  const req2 = new Request("http://localhost/media/gambar/uji.webp", {
    headers: { "if-none-match": '"s3-etag-123"' },
  });
  const res2 = await GET(req2, { params: Promise.resolve({ path: ["gambar", "uji.webp"] }) });
  assert.equal(res2.status, 304);
  assert.equal(res2.headers.get("etag"), '"s3-etag-123"');

  // 3. Permintaan Range mengalirkan 206 langsung
  perintahTerkirim.length = 0;
  const req3 = new Request("http://localhost/media/gambar/uji.webp", {
    headers: { range: "bytes=0-3" },
  });
  const res3 = await GET(req3, { params: Promise.resolve({ path: ["gambar", "uji.webp"] }) });
  assert.equal(res3.status, 206);
  assert.equal(res3.headers.get("content-range"), "bytes 0-3/4");
  assert.equal(simulasiRange, "bytes=0-3");
  assert.equal(perintahTerkirim.includes("HeadObjectCommand"), false);
});
