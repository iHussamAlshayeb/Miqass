#!/usr/bin/env bash
# نسخة احتياطية يومية لقاعدة بيانات مِقَص (mongodump) مع الاحتفاظ بآخر BACKUP_KEEP نسخة.
set -uo pipefail

DIR=/backups
KEEP="${BACKUP_KEEP:-7}"
UTC_HOUR="${BACKUP_UTC_HOUR:-0}"   # 0 UTC = 03:00 بتوقيت الرياض

mkdir -p "$DIR"

if [ -z "${MONGO_URI:-}" ]; then
  echo "[backup] MONGO_URI غير مضبوط" >&2
  exit 1
fi

run_backup() {
  local name="miqass-$(date -u +%Y-%m-%d_%H%M).archive.gz"
  echo "[backup] $(date -u '+%F %T') UTC بدء النسخ -> $name"
  if mongodump --uri="$MONGO_URI" --archive="$DIR/$name.partial" --gzip --quiet; then
    mv "$DIR/$name.partial" "$DIR/$name"
    echo "[backup] تم ($(du -h "$DIR/$name" | cut -f1))"
    ls -1t "$DIR"/miqass-*.archive.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
  else
    rm -f "$DIR/$name.partial"
    echo "[backup] فشل النسخ الاحتياطي" >&2
  fi
}

# نسخة فورية عند التشغيل إن لم توجد نسخة لليوم
if ! ls "$DIR"/miqass-"$(date -u +%Y-%m-%d)"_*.archive.gz >/dev/null 2>&1; then
  run_backup
fi

while true; do
  now=$(date -u +%s)
  next=$(date -u -d "today ${UTC_HOUR}:00" +%s)
  if [ "$next" -le "$now" ]; then
    next=$(date -u -d "tomorrow ${UTC_HOUR}:00" +%s)
  fi
  sleep $((next - now))
  run_backup
done
