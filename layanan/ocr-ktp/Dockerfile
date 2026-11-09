# Layanan OCR KTP (PaddleOCR 3.x, CPU) — lihat README.md di folder ini.
# ponytail: patok digest python:3.11-slim seperti image node di Dockerfile
# utama begitu build pertama di CI berhasil (`docker buildx imagetools inspect`).
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # Atap piksel dekoder OpenCV: gambar kecil yang mengaku raksasa tidak
    # boleh menghabiskan memori (bom dekompresi). 50 MP, sama dengan situs.
    OPENCV_IO_MAX_IMAGE_PIXELS=50000000 \
    # Model sudah ada di image; jangan memeriksa sumber unduhan saat start.
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True

# Pustaka sistem yang dibutuhkan OpenCV (libgl1, libglib2.0-0) dan Paddle (libgomp1).
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Proses jalan sebagai pengguna biasa: dekoder gambar membedah unggahan orang luar.
RUN useradd --create-home --uid 10001 ocr
WORKDIR /app

COPY requirements.txt .
RUN python -m pip install paddlepaddle==3.2.0 -i https://www.paddlepaddle.org.cn/packages/stable/cpu/ \
    && python -m pip install -r requirements.txt

COPY app.py .

# Model diunduh SEKARANG (saat build) ke ~/.paddlex milik pengguna ocr, lewat
# satu prediksi pemanasan — container tidak pernah mengunduh model saat jalan.
USER ocr
ENV HOME=/home/ocr
RUN python -c "from app import buat_ocr, hangatkan; print('pemanasan:', len(hangatkan(buat_ocr())), 'baris')"

EXPOSE 8866
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8866", "--workers", "1", "--no-access-log"]
