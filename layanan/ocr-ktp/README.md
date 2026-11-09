# Layanan OCR KTP

Penyedia eKYC `paddleocr` untuk verifikasi KTP situs (`lib/ocr-ktp.ts`,
`EKYC_PROVIDER=paddleocr`). PaddleOCR 3.2 (CPU) membaca teks foto KTP; situs
mencari NIK di dalamnya dan membandingkannya dengan NIK ketikan warga.

OCR hanya **membaca**: tidak memeriksa keaslian KTP atau data Dukcapil. Di mode
`bantu` (bawaan, `KTP_OCR_MODE`) hasilnya hanya lencana untuk petugas; di mode
`otomatis` NIK yang cocok dengan skor ≥ 0,9 langsung disetujui. OCR tidak
pernah menolak.

## API

| | |
|---|---|
| `GET /sehat` | `200 {"ok": true}` setelah model termuat |
| `POST /ocr` | multipart `gambar` (≤ 10 MB, `Content-Length` wajib), header `X-Kunci-OCR: <OCR_KUNCI>` → `{"baris": [{"teks": "...", "skor": 0.97}]}` |

Galat: `401` kunci salah · `503` `OCR_KUNCI` kosong/< 16 karakter · `411`/`413`
ukuran · `400`/`422` kiriman atau gambar tak terbaca · `500` OCR gagal.

Isi gambar dan teks hasil OCR tidak pernah dicatat atau disimpan. Model
diunduh saat **build** image, bukan saat jalan.

## Menjalankan lokal

```bash
docker build -t ocr-ktp layanan/ocr-ktp          # ±beberapa GB unduhan pertama kali
docker run --rm -p 127.0.0.1:8866:8866 --tmpfs /tmp \
  -e OCR_KUNCI="$(openssl rand -hex 24)" ocr-ktp

curl -s http://127.0.0.1:8866/sehat
curl -s -H "X-Kunci-OCR: <kunci yang sama>" -F gambar=@ktp.jpg http://127.0.0.1:8866/ocr
```

Lalu di `.env` situs: `EKYC_PROVIDER=paddleocr`, `OCR_URL=http://127.0.0.1:8866`,
`OCR_KUNCI=<kunci yang sama>`.

## Produksi

`docker-compose.prod.yml` menjalankan layanan `ocr-ktp` tanpa port terbuka
(hanya jaringan internal compose; web memanggil `http://ocr-ktp:8866`),
`/tmp` di tmpfs, atap memori 2 GB. Image dibangun & didorong workflow Release
(`ghcr.io/ultramenid/fire-buminusantara-ocr-ktp`, tag `OCR_TAG`).
