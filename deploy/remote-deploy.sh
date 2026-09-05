#!/usr/bin/env bash
# Dijalankan DI SERVER oleh deploy.yml (CI): remote-deploy.sh <role> VAR=tag ...
# Skrip ini berasal dari repo yang barusan di-reset ke origin/main, jadi logika
# deploy terverSI bersama kode. Rollback adalah jalur kelas satu, bukan renungan.
set -euo pipefail

ROLE="${1:?usage: remote-deploy.sh <role> VAR=tag ...}"
shift

STACK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$STACK_DIR/.env"
ENV_ROLLBACK="$STACK_DIR/.env.rollback"
BACKUP_DIR="$STACK_DIR/backups"
BACKUP_KEEP=30
HEALTH_TIMEOUT=420  # 7 menit — boot pertama menarik image bisa lambat

case "$ROLE" in
  prod)
    COMPOSE_FILE="docker-compose.prod.yml"
    HEALTH_SERVICES="web"
    ;;
  *)
    echo "role tidak dikenal: $ROLE" >&2
    exit 1
    ;;
esac

ALLOWED_KEYS="WEB_TAG"

log() { printf '[deploy] %s\n' "$*"; }
die() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

# Upsert VAR=tag ke .env; menolak kunci di luar allowlist — nilai ini datang
# dari CI/dispatch dan file ini yang dibaca compose.
set_tag() {
  local key="$1" val="$2"
  if ! tr ' ' '\n' <<<"$ALLOWED_KEYS" | grep -qx "$key"; then
    die "menolak kunci .env di luar allowlist: $key"
  fi
  if [ -f "$ENV_FILE" ] && grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$val" >>"$ENV_FILE"
  fi
}

compose() { docker compose -f "$STACK_DIR/$COMPOSE_FILE" "$@"; }

container_id() { compose ps -q "$1" 2>/dev/null; }

# Poll docker inspect sampai semua layanan role sehat (atau timeout).
wait_healthy() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT)) svc id
  for svc in $HEALTH_SERVICES; do
    id="$(container_id "$svc")"
    [ -n "$id" ] || return 1
    until [ "$(docker inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null)" = "healthy" ]; do
      [ "$SECONDS" -lt "$deadline" ] || return 1
      sleep 5
    done
  done
}

diagnostics() {
  log "=== compose ps ==="
  compose ps || true
  log "=== 40 baris log terakhir tiap layanan ==="
  local svc id
  for svc in $HEALTH_SERVICES; do
    id="$(container_id "$svc")"
    [ -n "$id" ] && docker logs --tail 40 "$id" || true
  done
}

# ── 1. Snapshot .env SEBELUM menyentuh apa pun ───────────────────────────────
[ -f "$ENV_FILE" ] && cp "$ENV_FILE" "$ENV_ROLLBACK" || true

# ── 2. Tulis tag baru ke .env ────────────────────────────────────────────────
for pair in "$@"; do
  set_tag "${pair%%=*}" "${pair#*=}"
done

# ── 3. Dump pra-deploy database (SEBELUM container app baru menjalankan migrasi)
# DB di luar stack ini (milik CMS Laravel). DB_CONTAINER dibaca dari .env di
# DALAM SUBSHELL supaya var yang di-export tidak menimpa interpolasi compose
# dari file yang barusan ditulis ulang.
dump_db() {
  mkdir -p "$BACKUP_DIR"
  local file="$BACKUP_DIR/db-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"

  # DB_CONTAINER / DATABASE_URL dibaca di DALAM SUBSHELL supaya var yang
  # di-export tidak menimpa interpolasi compose dari .env yang baru ditulis.
  local container url
  container="$(set -a; [ -f "$ENV_FILE" ] && . "$ENV_FILE"; echo "${DB_CONTAINER:-}")" || container=""
  url="$(set -a; [ -f "$ENV_FILE" ] && . "$ENV_FILE"; echo "${DATABASE_URL:-}")" || url=""

  if [ -n "$container" ]; then
    # Jalur A: database berjalan sebagai container.
    if [ "$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null || echo false)" != "true" ]; then
      log "container DB '$container' tidak berjalan — lewati dump"
      return 0
    fi
    docker exec "$container" sh -c \
      'exec mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" --all-databases 2>/dev/null || exec mysqldump -uroot -p"$MARIADB_ROOT_PASSWORD" --all-databases' \
      | gzip >"$file"
  elif [ -n "$url" ] && command -v mysqldump >/dev/null 2>&1; then
    # Jalur B: MariaDB/MySQL native di host — kredensial diambil dari
    # DATABASE_URL supaya tidak ada rahasia kedua yang harus dijaga.
    # mysql://user:pass@host:port/nama
    local rest creds hostport user pass host port nama
    rest="${url#mysql://}"
    creds="${rest%%@*}"; hostport="${rest#*@}"
    user="${creds%%:*}"; pass="${creds#*:}"
    nama="${hostport#*/}"; hostport="${hostport%%/*}"
    host="${hostport%%:*}"; port="${hostport#*:}"
    [ "$port" = "$host" ] && port=3306
    # Port host tidak dipakai apa adanya: dump jalan DI host, jadi 127.0.0.1.
    # --no-tablespaces: tanpa ini mysqldump meminta hak PROCESS (server-wide)
    # hanya untuk membaca info tablespace, yang tidak diperlukan cadangan
    # InnoDB biasa. Akun aplikasi cukup punya hak atas databasenya sendiri.
    MYSQL_PWD="$(printf '%b' "${pass//%/\\x}")" mysqldump \
      -h 127.0.0.1 -P "$port" -u "$user" \
      --single-transaction --quick --no-tablespaces "$nama" \
      | gzip >"$file"
  else
    log "tidak ada DB_CONTAINER maupun mysqldump di host — lewati dump pra-deploy"
    return 0
  fi

  # Dump kosong = kegagalan senyap; lebih baik batalkan deploy daripada
  # mengira ada cadangan padahal tidak. Isi dicek lewat gzip -t (integritas)
  # plus ukuran — BUKAN "gzip -dc | head -c 1": head menutup pipe lebih dulu,
  # gzip kena SIGPIPE, dan pipefail menandai dump yang sehat sebagai gagal.
  if [ ! -s "$file" ] || ! gzip -t "$file" 2>/dev/null; then
    rm -f "$file"
    log "dump pra-deploy kosong atau rusak"
    return 1
  fi

  # Simpan 30 terbaru.
  ls -1t "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | tail -n +$((BACKUP_KEEP + 1)) | xargs -r rm -f
  log "dump pra-deploy: $file ($(du -h "$file" | cut -f1))"
}
if ! dump_db; then
  # Gagal dump = jangan lanjut: jalur data-loss ditutup rapat.
  [ -f "$ENV_ROLLBACK" ] && { mv "$ENV_ROLLBACK" "$ENV_FILE"; }
  die "dump pra-deploy gagal — deploy dibatalkan"
fi

# ── 4. Deploy ────────────────────────────────────────────────────────────────
log "pull + up (role=$ROLE)"
# Jaringan bersama dengan MinIO/MariaDB — dibuat bila belum ada.
docker network create shared 2>/dev/null || true
compose pull
compose up -d --remove-orphans

# ── 5. Sehat? ───────────────────────────────────────────────────────────────
# Kontainer "healthy" belum berarti halaman tampil — health check HTTP bawaan
# hanya menyentuh /id, sedangkan bug peta Leaflet (ubin sebaris) lolos darinya.
# asap_rute mengetuk rute-rute kunci dan gagal (→ rollback di bawah) kalau ada
# yang menjawab 5xx / tak menjawab sama sekali.
asap_rute() {
  command -v curl >/dev/null 2>&1 || {
    log "peringatan: curl tidak ada di box — asap rute dilewati"
    return 0
  }
  local basis="http://127.0.0.1:3000" gagal=0
  # $1=path, $2=mode: "halaman" (harus 2xx/3xx) atau "tahan" (cukup non-5xx —
  # untuk API yang sah menjawab 4xx, mis. parameter kurang).
  cek() {
    local kode
    kode="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 "$basis$1" 2>/dev/null || echo 000)"
    # curl yang gagal koneksi mencetak 000 sendiri LEWAT -w lalu gagal —
    # tanpa normalisasi kode jadi "000000" dan lolos dari pola 000 di bawah.
    kode="${kode: -3}"
    if [ "$2" = halaman ]; then
      case "$kode" in
        2??|3??) log "asap OK $1 → $kode" ;;
        *) log "asap GAGAL $1 → $kode"; gagal=$((gagal + 1)) ;;
      esac
    else
      case "$kode" in
        000|5??) log "asap GAGAL $1 → $kode"; gagal=$((gagal + 1)) ;;
        *) log "asap OK $1 → $kode" ;;
      esac
    fi
  }
  cek "/" halaman                  # proxy pengalih bahasa (308)
  cek "/id" halaman                # beranda publik + peta
  cek "/id/lapor" halaman          # form laporan
  cek "/admin/login" halaman       # cangkang CMS (tanpa DB)
  cek "/robots.txt" halaman
  cek "/sitemap.xml" halaman       # sekalian canary query DB events
  cek "/api/forecasting?lat=-2.4&lon=118&zoom=5" tahan
  [ "$gagal" -eq 0 ]
}

if wait_healthy && asap_rute; then
  rm -f "$ENV_ROLLBACK"
  log "deploy $ROLE sukses, sehat, dan lolos asap rute"
  exit 0
fi

# ── 6. Gagal → rollback ──────────────────────────────────────────────────────
log "health check / asap rute gagal — memulai rollback"
diagnostics

if [ -f "$ENV_ROLLBACK" ]; then
  cp "$ENV_ROLLBACK" "$ENV_FILE"
  rm -f "$ENV_ROLLBACK"
  compose pull
  compose up -d --remove-orphans
  if wait_healthy; then
    log "rollback sehat — box kembali ke versi sebelumnya"
  else
    log "ROLLBACK JUGA TIDAK SEHAT — periksa box secara manual"
    diagnostics
  fi
else
  log "tidak ada .env.rollback — tidak ada yang bisa dipulihkan otomatis"
fi

# DB TIDAK dikembalikan otomatis: migrasi maju tidak dibatalkan oleh image lama.
# Dump pra-deploy ada di $BACKUP_DIR (path di atas).
die "deploy $ROLE gagal"