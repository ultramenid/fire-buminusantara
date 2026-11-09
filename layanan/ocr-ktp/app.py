"""
Layanan OCR KTP — penyedia eKYC "paddleocr" untuk verifikasi KTP situs
(lib/ocr-ktp.ts). Hanya MEMBACA teks foto KTP; perbandingan NIK, keputusan,
dan semua data tinggal di situs.

  GET  /sehat  → 200 {"ok": true} setelah model termuat
  POST /ocr    → multipart `gambar` (≤ 10 MB), header X-Kunci-OCR = OCR_KUNCI
               → {"baris": [{"teks": str, "skor": float}]}  (atas ke bawah)

Privasi: isi gambar dan teks hasil OCR TIDAK PERNAH dicatat atau disimpan.
Galat hanya mencatat jenisnya. Unggahan multipart yang besar dispool Starlette
ke /tmp — di docker-compose.prod.yml /tmp adalah tmpfs (RAM), bukan disk.
"""

import hmac
import logging
import os
import threading
from contextlib import asynccontextmanager

import cv2
import numpy as np
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

log = logging.getLogger("ocr-ktp")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

BATAS_BYTE = 10 * 1024 * 1024
# Pembatas multipart + nama bidang di atas isi gambar.
CADANGAN_MULTIPART = 64 * 1024
# Sisi terpanjang sebelum OCR: KTP tetap terbaca, CPU per permintaan terbatas.
SISI_MAKS = 2048
# Thread CPU Paddle = jatah CPU container (docker-compose: cpus 2). Bawaan Paddle mengikuti jumlah CPU
# mesin (mis. 10): di bawah jatah 2 CPU semua thread itu saling tercekik, satu foto 25–45 dtk alih-alih ±3.
CPU_THREADS = int(os.environ.get("OCR_CPU_THREADS", "2"))
# Kunci pendek = salah konfigurasi; layanan menolak semua permintaan.
PANJANG_KUNCI_MIN = 16

_ocr = None
# Prediktor Paddle tidak dijamin aman dipakai bersamaan: satu per satu.
_kunci_ocr = threading.Lock()


def buat_ocr():
    """Pipeline PaddleOCR 3.x, dibuat SEKALI. Model diunduh saat build image
    (lihat Dockerfile), jadi container tidak pernah mengambilnya saat jalan."""
    from paddleocr import PaddleOCR

    # Deteksi model *mobile* & sisi gambar paling panjang 960 px: teks KTP besar, jadi tetap terbaca
    # tepat (NIK skor ±0,99 pada foto HP miring & buram), sedangkan model *server* bawaan dengan gambar
    # penuh memakan ±5 GB memori dan 30–60 dtk per foto di CPU (melewati batas memori container).
    return PaddleOCR(
        lang="id",
        text_detection_model_name="PP-OCRv5_mobile_det",
        text_det_limit_type="max",
        text_det_limit_side_len=960,
        use_doc_orientation_classify=True,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        cpu_threads=CPU_THREADS,
    )


def baca(ocr, gambar):
    """Teks per baris beserta skornya, urut seperti keluaran PaddleOCR."""
    baris = []
    for res in ocr.predict(gambar):
        for teks, skor in zip(res["rec_texts"], res["rec_scores"]):
            if teks:
                baris.append({"teks": str(teks), "skor": round(float(skor), 4)})
    return baris


def hangatkan(ocr):
    """Satu prediksi pada gambar buatan: memaksa semua model terunduh & termuat."""
    kanvas = np.full((160, 640, 3), 255, dtype=np.uint8)
    cv2.putText(kanvas, "NIK 3201014101900001", (12, 96), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (0, 0, 0), 3)
    return baca(ocr, kanvas)


@asynccontextmanager
async def umur(_app):
    global _ocr
    _ocr = buat_ocr()
    log.info("model OCR termuat")
    yield


app = FastAPI(lifespan=umur, docs_url=None, redoc_url=None, openapi_url=None)


def galat(pesan, status):
    return JSONResponse({"galat": pesan}, status_code=status)


@app.get("/sehat")
def sehat():
    return {"ok": _ocr is not None}


@app.post("/ocr")
async def ocr(request: Request):
    kunci = os.environ.get("OCR_KUNCI", "")
    if len(kunci) < PANJANG_KUNCI_MIN:
        return galat("OCR_KUNCI belum disetel", 503)
    if not hmac.compare_digest(request.headers.get("x-kunci-ocr", "").encode(), kunci.encode()):
        return galat("kunci salah", 401)

    # Ukuran diputuskan dari header SEBELUM badan dibaca.
    panjang = request.headers.get("content-length")
    if panjang is None:
        return galat("Content-Length wajib", 411)
    if not panjang.isdigit() or int(panjang) > BATAS_BYTE + CADANGAN_MULTIPART:
        return galat("gambar melebihi 10 MB", 413)

    try:
        form = await request.form(max_files=1, max_fields=1)
    except Exception:
        return galat("kiriman tidak terbaca", 400)
    berkas = form.get("gambar")
    if berkas is None or isinstance(berkas, str):
        await form.close()
        return galat("bidang `gambar` wajib", 400)
    try:
        isi = await berkas.read(BATAS_BYTE + 1)
    finally:
        await form.close()
    if len(isi) > BATAS_BYTE:
        return galat("gambar melebihi 10 MB", 413)

    gambar = cv2.imdecode(np.frombuffer(isi, dtype=np.uint8), cv2.IMREAD_COLOR)
    del isi
    if gambar is None:
        return galat("gambar tidak terbaca", 422)
    tinggi, lebar = gambar.shape[:2]
    skala = SISI_MAKS / max(tinggi, lebar)
    if skala < 1:
        gambar = cv2.resize(gambar, (round(lebar * skala), round(tinggi * skala)), interpolation=cv2.INTER_AREA)

    def kerja():
        with _kunci_ocr:
            return baca(_ocr, gambar)

    try:
        baris = await run_in_threadpool(kerja)
    except Exception as e:  # noqa: BLE001 — jenisnya saja; pesannya bisa memuat isi
        log.error("OCR gagal: %s", type(e).__name__)
        return galat("OCR gagal", 500)
    return {"baris": baris}
