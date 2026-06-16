#!/bin/bash
# SSL 证书自动更新脚本
# 使用 acme.sh 更新 ZeroSSL 证书，更新后重载 nginx
# 证书未进入续期窗口时只记录检查结果并跳过更新，避免误以为已重新签发。

LOG_FILE="/home/ubuntu/apps/reminder-app/logs/ssl-renew.log"
CERT_FILE="/home/ubuntu/.acme.sh/daydreams.cn_ecc/daydreams.cn.cer"
APP_DIR="/home/ubuntu/apps/reminder-app"
STATUS_FILE="$APP_DIR/data/ssl-status.json"
RENEW_THRESHOLD_DAYS=30

mkdir -p "$(dirname "$LOG_FILE")" "$APP_DIR/data"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

get_expiry_iso() {
    local expiry_text="$1"
    date -d "$expiry_text" -Iseconds 2>/dev/null || date -d "$expiry_text" '+%Y-%m-%dT%H:%M:%SZ'
}

write_status() {
    local action="$1"
    local result="$2"
    local skipped="$3"
    local message="$4"
    local expiry_iso="$5"
    local days_remaining="$6"

    ACTION="$action" \
    RESULT="$result" \
    SKIPPED="$skipped" \
    MESSAGE="$message" \
    EXPIRY_ISO="$expiry_iso" \
    DAYS_REMAINING="$days_remaining" \
    STATUS_FILE="$STATUS_FILE" \
    python3 - <<'PY'
import json
import os
from datetime import datetime, timezone
from pathlib import Path

status_path = Path(os.environ['STATUS_FILE'])
try:
    data = json.loads(status_path.read_text(encoding='utf-8'))
except Exception:
    data = {}

now_iso = datetime.now(timezone.utc).astimezone().isoformat(timespec='seconds')
updated = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
action = os.environ['ACTION']
result = int(os.environ['RESULT'])
skipped = os.environ['SKIPPED'].lower() == 'true'
message = os.environ['MESSAGE']
expiry_iso = os.environ['EXPIRY_ISO']
days_remaining_raw = os.environ['DAYS_REMAINING']

if action != 'skipped':
    data['lastRenew'] = now_iso

data.update({
    'lastCheck': now_iso,
    'lastResult': result,
    'lastAction': action,
    'skipped': skipped,
    'message': message,
    'expiry': expiry_iso,
    'updated': updated,
})

try:
    data['daysRemaining'] = int(days_remaining_raw)
except Exception:
    pass

status_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
PY
}

log "=== 开始证书更新检查 ==="

if [ ! -f "$CERT_FILE" ]; then
    MESSAGE="证书文件不存在：$CERT_FILE"
    log "$MESSAGE"
    write_status "failed" 1 "false" "$MESSAGE" "" ""
    log "=== 证书更新检查完成 ==="
    exit 1
fi

EXPIRY_TEXT=$(openssl x509 -in "$CERT_FILE" -noout -enddate | cut -d= -f2)
EXPIRY_ISO=$(get_expiry_iso "$EXPIRY_TEXT")
EXPIRY_EPOCH=$(date -d "$EXPIRY_TEXT" +%s)
NOW_EPOCH=$(date +%s)
DAYS_REMAINING=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))

if [ "$DAYS_REMAINING" -gt "$RENEW_THRESHOLD_DAYS" ]; then
    MESSAGE="证书剩余 ${DAYS_REMAINING} 天，未到 ${RENEW_THRESHOLD_DAYS} 天续期窗口，跳过更新"
    log "$MESSAGE"
    write_status "skipped" 0 "true" "$MESSAGE" "$EXPIRY_ISO" "$DAYS_REMAINING"
    log "=== 证书更新检查完成 ==="

    if cd "$APP_DIR" && npx tsx scripts/sync-ssl-reminder.ts "$EXPIRY_ISO" 2>&1 | tee -a "$LOG_FILE"; then
        log "已同步 SSL 证书到期提醒"
    else
        log "同步 SSL 证书到期提醒失败"
    fi
    exit 0
fi

log "证书剩余 ${DAYS_REMAINING} 天，进入续期窗口，开始执行 acme.sh 更新"
~/.acme.sh/acme.sh --renew-all --ecc 2>&1 | tee -a "$LOG_FILE"
RESULT=${PIPESTATUS[0]}

if [ $RESULT -eq 0 ]; then
    MESSAGE="证书更新命令执行成功"
    log "$MESSAGE"
    
    # 重载 nginx 使新证书生效
    sudo nginx -t 2>&1 | tee -a "$LOG_FILE"
    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        sudo nginx -s reload 2>&1 | tee -a "$LOG_FILE"
        log "nginx 重载成功"
    else
        log "nginx 配置检查失败，跳过重载"
    fi
else
    MESSAGE="证书更新命令执行失败，退出码: $RESULT"
    log "$MESSAGE"
fi

# 重新读取可能被更新后的证书到期时间
EXPIRY_TEXT=$(openssl x509 -in "$CERT_FILE" -noout -enddate | cut -d= -f2)
EXPIRY_ISO=$(get_expiry_iso "$EXPIRY_TEXT")
EXPIRY_EPOCH=$(date -d "$EXPIRY_TEXT" +%s)
NOW_EPOCH=$(date +%s)
DAYS_REMAINING=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))

if [ $RESULT -eq 0 ]; then
    write_status "renewed" "$RESULT" "false" "$MESSAGE" "$EXPIRY_ISO" "$DAYS_REMAINING"
else
    write_status "failed" "$RESULT" "false" "$MESSAGE" "$EXPIRY_ISO" "$DAYS_REMAINING"
fi
log "已更新 ssl-status.json"

if cd "$APP_DIR" && npx tsx scripts/sync-ssl-reminder.ts "$EXPIRY_ISO" 2>&1 | tee -a "$LOG_FILE"; then
    log "已同步 SSL 证书到期提醒"
else
    log "同步 SSL 证书到期提醒失败"
fi

log "=== 证书更新检查完成 ==="
