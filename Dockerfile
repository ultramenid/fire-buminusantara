# ── Tahap 1: build standalone ────────────────────────────────────────────────
FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4 AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# prisma.config.ts me-resolve DATABASE_URL saat dimuat; `prisma generate` hanya
# perlu placeholder — koneksi asli tetap dibaca dari env saat runtime.
ARG DATABASE_URL=mysql://build:build@localhost:3306/build
ENV DATABASE_URL=$DATABASE_URL

# NEXT_PUBLIC_* dipanggang saat build — harus lewat build-args dari CI.
ARG NEXT_PUBLIC_MEDIA_URL=""
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=""
ENV NEXT_PUBLIC_MEDIA_URL=$NEXT_PUBLIC_MEDIA_URL \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY

# ID setiap Server Action diturunkan dari kunci ini saat build. Tanpa kunci
# tetap, tiap build menghasilkan ID baru: tab yang sudah terbuka sebelum deploy
# mengirim ID lama, server menolak dengan "Failed to find Server Action", dan
# form gagal senyap — submit tidak melakukan apa pun. Kunci sama = ID stabil
# lintas deploy.
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=""
ENV NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY

# Deployment ID untuk proteksi version skew: diteruskan ke Next.js saat build
# sehingga aset diberi query ?dpl=<id> dan navigasi klien otomatis me-reload
# halaman secara penuh bila mendeteksi build baru di server.
ARG NEXT_DEPLOYMENT_ID=""
ENV NEXT_DEPLOYMENT_ID=$NEXT_DEPLOYMENT_ID

# ponytail: --webpack — build Turbopack (bawaan Next 16) gagal spawn proses
# anak di beberapa lingkungan; webpack terverifikasi menghasilkan standalone.
# Bisa dilepas bila Turbopack build terbukti stabil di CI.
RUN npx prisma generate && npx next build --webpack

# CLI prisma lengkap (dengan dependensinya) untuk tahap runtime. Versi
# disamakan dengan devDependency supaya migrasi dijalankan CLI yang sama
# dengan yang membuatnya.
RUN mkdir -p /opt/prisma && cd /opt/prisma \
    && npm init -y >/dev/null \
    && npm install --no-audit --no-fund --omit=dev \
       "prisma@$(node -p "require('/app/package.json').devDependencies.prisma")" >/dev/null

# ── Tahap 2: runtime ─────────────────────────────────────────────────────────
FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4
WORKDIR /app
ENV NODE_ENV=production
# Node 22 memberi tiap alamat hanya 250 ms (happy eyeballs); NASA FIRMS butuh
# ~300 ms+ dari server, dan jaringan Docker tanpa IPv6 → fetch ETIMEDOUT ~7/10.
ENV NODE_OPTIONS=--network-family-autoselection-attempt-timeout=2000

# ffmpeg dipakai bingkaiVideo() untuk membuat poster (bingkai pertama) tiap
# video yang diunggah. Tanpa ini di image runtime, poster tidak pernah dibuat:
# video-saja tampil tanpa thumbnail di korsel, dan pratinjau bagikannya
# (og:image) jatuh ke logo alih-alih cuplikan videonya.
RUN apk add --no-cache ffmpeg

# Proses app jalan sebagai user `node`, bukan root: ffmpeg membedah video
# unggahan orang luar — celah di demuxer-nya tidak boleh berarti root, dan
# berkas app (server.js) tidak boleh bisa ditimpa dari dalam proses. Hanya
# .next (cache ISR/gambar) dan /app (fallback media lokal) yang perlu ditulisi.
RUN chown node:node /app
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Asuransi kalau pelacakan berkas Next tidak menyalin klien Prisma hasil generate.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Migrasi dijalankan saat container start (lihat CMD), jadi berkas migrasi dan
# CLI prisma harus ikut. CLI dipasang utuh di /opt/prisma — menyalin paketnya
# saja tidak cukup: CLI v7 butuh dependensinya sendiri (effect dll.).
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /opt/prisma /opt/prisma

# Prisma 7 mewajibkan datasource.url dari berkas config, bukan schema.prisma.
# prisma.config.ts repo tidak dipakai di sini karena butuh runtime TypeScript;
# versi .mjs ini setara dan dibaca langsung oleh Node.
RUN printf '%s\n' \
    "export default { schema: 'prisma/schema.prisma', migrations: { path: 'prisma/migrations' }, datasource: { url: process.env.DATABASE_URL } };" \
    > /app/prisma.config.mjs

# server.js standalone mendengarkan di $HOSTNAME, dan Docker mengisi HOSTNAME
# dengan ID container (mis. 08aafe8f2476 → 172.21.0.4) — akibatnya port 3000
# hanya hidup di satu antarmuka: 127.0.0.1 di dalam container mati dan
# pemetaan port host ikut gagal. 0.0.0.0 membuatnya mendengarkan semuanya.
ENV HOSTNAME=0.0.0.0 PORT=3000

EXPOSE 3000
USER node
# migrate deploy sebelum server hidup: hanya menerapkan migrasi yang tertunda,
# tidak pernah membuat berkas migrasi baru dan tidak menjalankan seed. Kalau
# migrasi gagal, container mati → healthcheck merah → remote-deploy.sh rollback,
# jadi versi rusak tidak pernah melayani trafik.
# Dipanggil ke build/index.js langsung, bukan lewat node_modules/.bin/prisma:
# symlink itu putus saat disalin antar tahap build.
CMD ["sh", "-c", "/opt/prisma/node_modules/.bin/prisma migrate deploy --config=/app/prisma.config.mjs && exec node server.js"]