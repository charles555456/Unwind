#!/bin/bash
# Kobo 自動同步腳本 v3 — 每次接上只同步一次

KOBO_DB="/Volumes/KOBOeReader/.kobo/KoboReader.sqlite"
PYTHON="/Library/Frameworks/Python.framework/Versions/3.13/bin/python3"
SYNC_SCRIPT="/Users/charles/.kobo-sync/sync-kobo.py"
LOG_FILE="/Users/charles/.kobo-sync/kobo-sync.log"
LOCK_FILE="/Users/charles/.kobo-sync/synced.lock"
OUTPUT="/Users/charles/.kobo-sync/kobo-highlights.json"
DESKTOP_DIR="/Users/charles/Desktop/charlesshen"

# Kobo 沒接 → 清除鎖定，下次接上才會重新同步
if [ ! -f "$KOBO_DB" ]; then
  rm -f "$LOCK_FILE"
  exit 0
fi

# 已經同步過 → 跳過
if [ -f "$LOCK_FILE" ]; then
  exit 0
fi

sleep 3

echo "$(date): Kobo 偵測到，開始同步..." >> "$LOG_FILE"

"$PYTHON" "$SYNC_SCRIPT" >> "$LOG_FILE" 2>&1

if [ $? -eq 0 ]; then
  touch "$LOCK_FILE"
  cp "$OUTPUT" "$DESKTOP_DIR/kobo-highlights.json" 2>/dev/null
  osascript -e 'display notification "書摘已同步完成" with title "Kobo 同步成功"'
  echo "$(date): 同步成功" >> "$LOG_FILE"
else
  osascript -e 'display notification "同步失敗，請查看 log" with title "Kobo 同步失敗"'
  echo "$(date): 同步失敗" >> "$LOG_FILE"
fi
