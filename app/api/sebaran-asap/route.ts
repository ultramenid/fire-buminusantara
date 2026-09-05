import { NextRequest, NextResponse } from "next/server";
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
      const timeChunkStr = searchParams.get("timeChunk") || searchParams.get("tc") || "116";
      const stepStr = searchParams.get("step") || searchParams.get("s") || "0";
      const timeInnerStr = searchParams.get("timeInner") || searchParams.get("ti") || "0";

      const timeChunk = parseInt(timeChunkStr, 10);
      const step = parseInt(stepStr, 10);
      const timeInner = parseInt(timeInnerStr, 10);

      if (isNaN(timeChunk) || isNaN(step)) {
        return NextResponse.json({ error: "Invalid timeChunk or step parameter" }, { status: 400 });
      }

      const frameBuffer = await getZarrFrame(timeChunk, step, isNaN(timeInner) ? 0 : timeInner);

      return new Response(frameBuffer as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(frameBuffer.byteLength),
          "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=172800",
        },
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
