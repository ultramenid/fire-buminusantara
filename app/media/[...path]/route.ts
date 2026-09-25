import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { getConfig, getMinioClient } from "../../../lib/unggah.ts";
import { GetObjectCommand } from "@aws-sdk/client-s3";

const AKAR_MEDIA = path.join(process.cwd(), "media");

const JENIS: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".mp4": "video/mp4", ".mov": "video/quicktime",
  ".webm": "video/webm",
};

/**
 * Melayani berkas media kejadian.
 *
 * Sumber utamanya MinIO; bucketnya TIDAK dibuka untuk umum, jadi browser tidak
 * bisa mengambil objeknya langsung — route inilah yang memegang kredensial dan
 * meneruskan isinya.
 *
 * Mengalirkan konten langsung via GetObjectCommand tanpa roundtrip HeadObjectCommand
 * yang redundan. Mendukung ETag dan HTTP 304 Not Modified.
 */
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const bagian = (await params).path;
  const rentang = req.headers.get("range");
  const ifNoneMatch = req.headers.get("if-none-match");
  const ifModifiedSince = req.headers.get("if-modified-since");

  return (
    (await lewatMinio(bagian.join("/"), rentang, ifNoneMatch, ifModifiedSince)) ??
    (await lewatLokal(bagian, rentang, ifNoneMatch, ifModifiedSince))
  );
}

async function lewatMinio(
  kunci: string,
  rentang: string | null,
  ifNoneMatch: string | null,
  ifModifiedSince: string | null,
): Promise<Response | null> {
  const cfg = getConfig();
  const klien = getMinioClient();

  const rangeHeader =
    rentang && /^bytes=\d*-\d*$/.test(rentang.trim()) ? rentang.trim() : undefined;

  let hasil;
  try {
    hasil = await klien.send(
      new GetObjectCommand({
        Bucket: cfg.bucket,
        Key: kunci,
        Range: rangeHeader,
        IfNoneMatch: ifNoneMatch || undefined,
        IfModifiedSince: ifModifiedSince ? new Date(ifModifiedSince) : undefined,
      }),
    );
  } catch (galat: unknown) {
    const status = (galat as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;

    // 304 Not Modified dari S3
    if (status === 304) {
      const headers: Record<string, string> = {
        "cache-control": "public, max-age=31536000, immutable",
      };
      if (ifNoneMatch) headers["etag"] = ifNoneMatch;
      return new Response(null, { status: 304, headers });
    }

    // 416 Range Not Satisfiable
    if (status === 416) {
      return new Response("Range Not Satisfiable", {
        status: 416,
        headers: { "content-range": "bytes */*" },
      });
    }

    // 404 = objeknya memang tak ada di MinIO, lanjut ke cadangan lokal tanpa berisik.
    if (status !== 404) {
      console.warn("[Media] MinIO tak terjangkau, jatuh ke lokal:", {
        kunci,
        sebab: galat instanceof Error ? galat.message : String(galat),
      });
    }
    return null;
  }

  const etag = hasil.ETag;
  const lastModified = hasil.LastModified?.toUTCString();

function tutupAliran(body: unknown): void {
  if (
    body &&
    typeof body === "object" &&
    "destroy" in body &&
    typeof (body as { destroy: () => void }).destroy === "function"
  ) {
    (body as { destroy: () => void }).destroy();
  }
}

  // Evaluasi 304 Not Modified bila S3 mengembalikan 200/206
  if (ifNoneMatch && etag && (ifNoneMatch === etag || ifNoneMatch === `W/${etag}`)) {
    tutupAliran(hasil.Body);
    return new Response(null, {
      status: 304,
      headers: {
        ...(etag ? { etag } : {}),
        ...(lastModified ? { "last-modified": lastModified } : {}),
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  }

  if (!ifNoneMatch && ifModifiedSince && hasil.LastModified) {
    const imsDate = new Date(ifModifiedSince);
    if (
      !Number.isNaN(imsDate.getTime()) &&
      Math.floor(hasil.LastModified.getTime() / 1000) <= Math.floor(imsDate.getTime() / 1000)
    ) {
      tutupAliran(hasil.Body);
      return new Response(null, {
        status: 304,
        headers: {
          ...(etag ? { etag } : {}),
          ...(lastModified ? { "last-modified": lastModified } : {}),
          "cache-control": "public, max-age=31536000, immutable",
        },
      });
    }
  }

  const status = hasil.$metadata.httpStatusCode === 206 ? 206 : 200;
  const jenis =
    hasil.ContentType || JENIS[path.extname(kunci).toLowerCase()] || "application/octet-stream";

  const headers: Record<string, string> = {
    "content-type": jenis,
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=31536000, immutable",
  };
  if (hasil.ContentLength !== undefined) {
    headers["content-length"] = String(hasil.ContentLength);
  }
  if (hasil.ContentRange) {
    headers["content-range"] = hasil.ContentRange;
  }
  if (etag) {
    headers["etag"] = etag;
  }
  if (lastModified) {
    headers["last-modified"] = lastModified;
  }

  let stream: BodyInit | null = null;
  if (hasil.Body instanceof Readable) {
    stream = Readable.toWeb(hasil.Body) as unknown as BodyInit;
  } else if (
    hasil.Body &&
    typeof hasil.Body === "object" &&
    "transformToWebStream" in hasil.Body &&
    typeof (hasil.Body as { transformToWebStream: () => unknown }).transformToWebStream === "function"
  ) {
    stream = (hasil.Body as { transformToWebStream: () => unknown }).transformToWebStream() as unknown as BodyInit;
  } else if (hasil.Body) {
    stream = hasil.Body as unknown as BodyInit;
  }
  return new Response(stream, { status, headers });
}

async function lewatLokal(
  bagian: string[],
  rentang: string | null,
  ifNoneMatch: string | null,
  ifModifiedSince: string | null,
): Promise<Response> {
  const penuh = path.resolve(AKAR_MEDIA, ...bagian);
  if (penuh !== AKAR_MEDIA && !penuh.startsWith(AKAR_MEDIA + path.sep)) {
    return new Response("Tidak ditemukan.", { status: 404 });
  }

  let info;
  try {
    info = await stat(penuh);
  } catch {
    return new Response("Tidak ditemukan.", { status: 404 });
  }
  if (!info.isFile()) return new Response("Tidak ditemukan.", { status: 404 });

  const etag = `"${info.mtimeMs.toString(16)}-${info.size.toString(16)}"`;
  const lastModified = info.mtime.toUTCString();

  if (ifNoneMatch && (ifNoneMatch === etag || ifNoneMatch === `W/${etag}`)) {
    return new Response(null, {
      status: 304,
      headers: {
        etag,
        "last-modified": lastModified,
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  }

  if (!ifNoneMatch && ifModifiedSince) {
    const imsDate = new Date(ifModifiedSince);
    if (
      !Number.isNaN(imsDate.getTime()) &&
      Math.floor(info.mtime.getTime() / 1000) <= Math.floor(imsDate.getTime() / 1000)
    ) {
      return new Response(null, {
        status: 304,
        headers: {
          etag,
          "last-modified": lastModified,
          "cache-control": "public, max-age=31536000, immutable",
        },
      });
    }
  }

  const potongan = pecahRentang(rentang, info.size);
  const aliran = createReadStream(
    penuh,
    potongan ? { start: potongan.awal, end: potongan.akhir } : undefined,
  );

  const jenis = JENIS[path.extname(penuh).toLowerCase()] ?? "application/octet-stream";
  const webStream = Readable.toWeb(aliran) as ReadableStream;

  const headers: Record<string, string> = {
    "content-type": jenis,
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=31536000, immutable",
    etag,
    "last-modified": lastModified,
  };

  if (potongan) {
    headers["content-length"] = String(potongan.akhir - potongan.awal + 1);
    headers["content-range"] = `bytes ${potongan.awal}-${potongan.akhir}/${info.size}`;
    return new Response(webStream, { status: 206, headers });
  }

  headers["content-length"] = String(info.size);
  return new Response(webStream, { headers });
}

type Potongan = { awal: number; akhir: number };

function pecahRentang(rentang: string | null, ukuran: number): Potongan | null {
  const cocok = /^bytes=(\d*)-(\d*)$/.exec(rentang?.trim() ?? "");
  if (!cocok || !ukuran) return null;

  const [, mulai, henti] = cocok;
  if (mulai === "" && henti === "") return null;

  const awal = mulai === "" ? Math.max(0, ukuran - Number(henti)) : Number(mulai);
  const akhir = mulai === "" || henti === "" ? ukuran - 1 : Math.min(Number(henti), ukuran - 1);

  return awal <= akhir && awal < ukuran ? { awal, akhir } : null;
}
