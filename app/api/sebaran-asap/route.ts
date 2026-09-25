import { NextRequest, NextResponse } from "next/server";
import { brotliCompressSync, gzipSync, constants as konstantaZlib } from "node:zlib";
import { getZarrMetadata, getZarrFrame } from "@/lib/zarr-reader";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") || "metadata";
  const force = searchParams.get("force") === "true" || searchParams.has("_ts");

  try {
    if (mode === "metadata") {
      const metadata = await getZarrMetadata(force);
      return NextResponse.json(metadata, {
        headers: {
          "Cache-Control": force
            ? "no-cache, no-store, must-revalidate"
            : "public, max-age=300, s-maxage=600, stale-while-revalidate=1800",
        },
      });
    }

    if (mode === "frame") {
      const timeChunkStr = searchParams.get("timeChunk");
      const stepStr = searchParams.get("step");
      const timeInnerStr = searchParams.get("timeInner") ?? "0";

      const timeChunk = timeChunkStr !== null ? parseInt(timeChunkStr, 10) : NaN;
      const step = stepStr !== null ? parseInt(stepStr, 10) : NaN;
      const timeInner = parseInt(timeInnerStr, 10);

      if (Number.isNaN(timeChunk) || Number.isNaN(step)) {
        return Response.json({ error: "Invalid timeChunk or step parameter" }, { status: 400 });
      }

      const frameBuffer = await getZarrFrame(timeChunk, step, Number.isNaN(timeInner) ? 0 : timeInner);

      // Kompresi respons di sini, bukan menunggu gzip nginx: jenis responsnya
      // application/octet-stream, yang tidak masuk gzip_types bawaan — tanpa
      // ini seluruh 61 frame (~26 MB) mengalir mentah ke ponsel tiap pemuatan
      // peta. Data float yang sebagian besar konstan (wilayah tanpa asap)
      // memampatkan sangat baik (~80%). Transparan bagi peta-asap: fetch() +
      // arrayBuffer() menerima byte terdekompresi yang sama. Vary mencegah
      // tembolok CDN/proksi mencampur versi terkompresi dan mentah satu URL.
      // Brotli mutu 5: mutu bawaan (11) boros CPU ratusan ms per 400 KB —
      // berulang 61× per pemuatan peta; mutu 5 memampatkan hampir sama pada
      // data berulang ini dengan biaya puluhan ms.
      const terima = req.headers.get("accept-encoding") ?? "";
      let isi: Uint8Array = frameBuffer;
      const kepala: Record<string, string> = {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(frameBuffer.byteLength),
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=172800",
        Vary: "Accept-Encoding",
      };
      if (terima.includes("br")) {
        isi = brotliCompressSync(frameBuffer, {
          params: { [konstantaZlib.BROTLI_PARAM_QUALITY]: 5 },
        });
        kepala["Content-Encoding"] = "br";
        kepala["Content-Length"] = String(isi.byteLength);
      } else if (terima.includes("gzip")) {
        isi = gzipSync(frameBuffer);
        kepala["Content-Encoding"] = "gzip";
        kepala["Content-Length"] = String(isi.byteLength);
      }

      return new Response(isi as unknown as BodyInit, {
        status: 200,
        headers: kepala,
      });
    }

    return NextResponse.json({ error: `Unknown mode: ${mode}` }, { status: 400 });
  } catch (error) {
    console.error("[API sebaran-asap] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
