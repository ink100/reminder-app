#!/bin/bash
# SSL 证书自动更新脚本
# 使用 acme.sh 检查并按需更新 ZeroSSL 证书；只有目标证书实际变化后才重载 nginx。

LOG_FILE="${REMINDER_SSL_LOG_FILE:-/home/ubuntu/apps/reminder-app/logs/ssl-renew.log}"
CERT_FILE="${REMINDER_SSL_CERT_FILE:-/home/ubuntu/.acme.sh/ne.daydreams.cn_ecc/ne.daydreams.cn.cer}"
APP_DIR="${REMINDER_SSL_APP_DIR:-/home/ubuntu/apps/reminder-app}"
STATUS_FILE="${REMINDER_SSL_STATUS_FILE:-$APP_DIR/data/ssl-status.json}"
ACME_SH="${REMINDER_SSL_ACME_SH:-$HOME/.acme.sh/acme.sh}"
ACME_DOMAIN="${REMINDER_SSL_ACME_DOMAIN:-ne.daydreams.cn}"
RENEW_THRESHOLD_DAYS="${REMINDER_SSL_RENEW_THRESHOLD_DAYS:-30}"
LOCK_FILE="${REMINDER_SSL_LOCK_FILE:-$APP_DIR/data/ssl-renew.lock}"

mkdir -p "$(dirname "$LOG_FILE")" "$(dirname "$STATUS_FILE")" "$(dirname "$LOCK_FILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

exec 9>"$LOCK_FILE"
if ! flock -w 10 9; then
    log "已有 SSL 证书检查正在运行，本次请求退出"
    exit 75
fi

get_expiry_text() {
    openssl x509 -in "$CERT_FILE" -noout -enddate | cut -d= -f2
}

get_expiry_iso() {
    local expiry_text="$1"
    date -d "$expiry_text" -Iseconds 2>/dev/null || date -d "$expiry_text" '+%Y-%m-%dT%H:%M:%SZ'
}

get_certificate_fingerprint() {
    openssl x509 -in "$CERT_FILE" -noout -fingerprint -sha256 | cut -d= -f2 | tr -d ':[:space:]'
}

write_status() {
    local action="$1"
    local result="$2"
    local skipped="$3"
    local message="$4"
    local expiry_iso="$5"
    local days_remaining="$6"
    local certificate_changed="${7:-false}"
    local reload_pending="${8:-preserve}"
    local pending_acme_result="${9:-preserve}"
    local pre_acme_fingerprint="${10:-preserve}"

    ACTION="$action" \
    RESULT="$result" \
    SKIPPED="$skipped" \
    MESSAGE="$message" \
    EXPIRY_ISO="$expiry_iso" \
    DAYS_REMAINING="$days_remaining" \
    CERTIFICATE_CHANGED="$certificate_changed" \
    RELOAD_PENDING="$reload_pending" \
    PENDING_ACME_RESULT="$pending_acme_result" \
    PRE_ACME_FINGERPRINT="$pre_acme_fingerprint" \
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
certificate_changed = os.environ['CERTIFICATE_CHANGED'].lower() == 'true'
reload_pending_raw = os.environ['RELOAD_PENDING'].lower()
pending_acme_result_raw = os.environ['PENDING_ACME_RESULT'].lower()
pre_acme_fingerprint_raw = os.environ['PRE_ACME_FINGERPRINT']
days_remaining_raw = os.environ['DAYS_REMAINING']

was_reload_pending = data.get('reloadPending') is True
reload_pending = was_reload_pending if reload_pending_raw == 'preserve' else reload_pending_raw == 'true'
if pending_acme_result_raw == 'clear':
    data.pop('pendingAcmeResult', None)
elif pending_acme_result_raw != 'preserve':
    data['pendingAcmeResult'] = int(pending_acme_result_raw)
if pre_acme_fingerprint_raw == 'clear':
    data.pop('preAcmeFingerprint', None)
elif pre_acme_fingerprint_raw != 'preserve':
    data['preAcmeFingerprint'] = pre_acme_fingerprint_raw
if certificate_changed and (not was_reload_pending or data.get('certificateChanged') is not True):
    data['lastRenew'] = now_iso

data.update({
    'lastCheck': now_iso,
    'lastResult': result,
    'lastAction': action,
    'skipped': skipped,
    'message': message,
    'expiry': expiry_iso or None,
    'updated': updated,
    'certificateChanged': certificate_changed,
    'reloadPending': reload_pending,
})

try:
    data['daysRemaining'] = int(days_remaining_raw)
except Exception:
    data.pop('daysRemaining', None)

temporary_path = status_path.with_suffix(status_path.suffix + '.tmp')
temporary_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
temporary_path.replace(status_path)
PY
}

persist_status() {
    if ! write_status "$@"; then
        log "无法持久化 SSL 状态，停止后续操作"
        exit 74
    fi
}

sync_reminder() {
    local expiry_iso="$1"
    if [ -z "$expiry_iso" ]; then
        return 0
    fi

    if cd "$APP_DIR" && npx tsx scripts/sync-ssl-reminder.ts "$expiry_iso" 2>&1 | tee -a "$LOG_FILE"; then
        log "已同步 SSL 证书到期提醒"
    else
        log "同步 SSL 证书到期提醒失败"
    fi
}

is_reload_pending() {
    STATUS_FILE="$STATUS_FILE" python3 - <<'PY'
import json
import os
from pathlib import Path

try:
    data = json.loads(Path(os.environ['STATUS_FILE']).read_text(encoding='utf-8'))
    print('true' if data.get('reloadPending') is True else 'false')
except Exception:
    print('false')
PY
}

get_pending_acme_result() {
    STATUS_FILE="$STATUS_FILE" python3 - <<'PY'
import json
import os
from pathlib import Path

try:
    data = json.loads(Path(os.environ['STATUS_FILE']).read_text(encoding='utf-8'))
    value = int(data.get('pendingAcmeResult', 0))
    print(value)
except Exception:
    print(0)
PY
}

get_pre_acme_fingerprint() {
    STATUS_FILE="$STATUS_FILE" python3 - <<'PY'
import json
import os
from pathlib import Path

try:
    data = json.loads(Path(os.environ['STATUS_FILE']).read_text(encoding='utf-8'))
    print(data.get('preAcmeFingerprint', ''))
except Exception:
    print('')
PY
}

activate_nginx() {
    local reason="$1"
    local source_result="${2:-0}"
    local pending_acme_result="clear"
    local pending_action="pending"
    local pending_result=0
    local pending_message="新证书已签发，等待 nginx 验证并加载"
    if [ "$source_result" -ne 0 ] && [ "$source_result" -ne 2 ]; then
        pending_acme_result="$source_result"
        pending_action="failed"
        pending_result="$source_result"
        pending_message="证书文件已变化，但 acme.sh 报告失败；仍需完成 nginx 加载"
    fi
    log "$reason"
    persist_status "$pending_action" "$pending_result" "false" "$pending_message" "$EXPIRY_ISO" "$DAYS_REMAINING" "true" "true" "$pending_acme_result" "clear"

    sudo nginx -t 2>&1 | tee -a "$LOG_FILE"
    local nginx_test_result=${PIPESTATUS[0]}
    if [ "$nginx_test_result" -ne 0 ]; then
        MESSAGE="证书已重新签发，但 nginx 配置检查失败，保留待重载状态"
        log "$MESSAGE"
        persist_status "failed" "$nginx_test_result" "false" "$MESSAGE" "$EXPIRY_ISO" "$DAYS_REMAINING" "true" "true" "$pending_acme_result"
        sync_reminder "$EXPIRY_ISO"
        log "=== 证书更新检查完成 ==="
        exit "$nginx_test_result"
    fi

    sudo nginx -s reload 2>&1 | tee -a "$LOG_FILE"
    local nginx_reload_result=${PIPESTATUS[0]}
    if [ "$nginx_reload_result" -ne 0 ]; then
        MESSAGE="证书已重新签发，但 nginx 重载失败，保留待重载状态"
        log "$MESSAGE"
        persist_status "failed" "$nginx_reload_result" "false" "$MESSAGE" "$EXPIRY_ISO" "$DAYS_REMAINING" "true" "true" "$pending_acme_result"
        sync_reminder "$EXPIRY_ISO"
        log "=== 证书更新检查完成 ==="
        exit "$nginx_reload_result"
    fi

    if [ "$source_result" -ne 0 ] && [ "$source_result" -ne 2 ]; then
        MESSAGE="目标证书已成功加载，但 acme.sh 仍报告失败，退出码: $source_result"
        log "$MESSAGE"
        persist_status "failed" "$source_result" "false" "$MESSAGE" "$EXPIRY_ISO" "$DAYS_REMAINING" "true" "false" "clear"
        sync_reminder "$EXPIRY_ISO"
        log "=== 证书更新检查完成 ==="
        exit "$source_result"
    fi

    MESSAGE="目标证书已重新签发并成功重载 nginx"
    log "$MESSAGE"
    persist_status "renewed" 0 "false" "$MESSAGE" "$EXPIRY_ISO" "$DAYS_REMAINING" "true" "false" "clear"
    sync_reminder "$EXPIRY_ISO"
    log "=== 证书更新检查完成 ==="
    exit 0
}

log "=== 开始证书更新检查 ==="

if [ ! -f "$CERT_FILE" ]; then
    MESSAGE="证书文件不存在：$CERT_FILE"
    log "$MESSAGE"
    persist_status "failed" 1 "false" "$MESSAGE" "" "" "false"
    log "=== 证书更新检查完成 ==="
    exit 1
fi

EXPIRY_TEXT=$(get_expiry_text)
if [ -z "$EXPIRY_TEXT" ]; then
    MESSAGE="无法读取证书到期时间"
    log "$MESSAGE"
    persist_status "failed" 1 "false" "$MESSAGE" "" "" "false"
    log "=== 证书更新检查完成 ==="
    exit 1
fi

EXPIRY_ISO=$(get_expiry_iso "$EXPIRY_TEXT")
EXPIRY_EPOCH=$(date -d "$EXPIRY_TEXT" +%s)
NOW_EPOCH=$(date +%s)
DAYS_REMAINING=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))

PENDING_PRE_ACME_FINGERPRINT=$(get_pre_acme_fingerprint)
if [ "$(is_reload_pending)" = "true" ] || [ -n "$PENDING_PRE_ACME_FINGERPRINT" ]; then
    PENDING_SOURCE_RESULT=$(get_pending_acme_result)
    if [ -n "$PENDING_PRE_ACME_FINGERPRINT" ]; then
        CURRENT_FINGERPRINT=$(get_certificate_fingerprint)
        if [ -z "$CURRENT_FINGERPRINT" ]; then
            MESSAGE="待确认的证书仍无法读取，保留待加载状态"
            log "$MESSAGE"
            persist_status "failed" 1 "false" "$MESSAGE" "$EXPIRY_ISO" "$DAYS_REMAINING" "false" "true"
            exit 1
        fi
        if [ "$CURRENT_FINGERPRINT" = "$PENDING_PRE_ACME_FINGERPRINT" ]; then
            if [ "$PENDING_SOURCE_RESULT" -eq 0 ] || [ "$PENDING_SOURCE_RESULT" -eq 2 ]; then
                MESSAGE="证书恢复可读，确认 ACME 检查期间证书未变化"
                log "$MESSAGE"
                persist_status "skipped" 0 "true" "$MESSAGE" "$EXPIRY_ISO" "$DAYS_REMAINING" "false" "false" "clear" "clear"
                sync_reminder "$EXPIRY_ISO"
                exit 0
            fi
            MESSAGE="证书恢复可读且未变化，acme.sh 续签仍为失败，退出码: $PENDING_SOURCE_RESULT"
            log "$MESSAGE"
            persist_status "failed" "$PENDING_SOURCE_RESULT" "false" "$MESSAGE" "$EXPIRY_ISO" "$DAYS_REMAINING" "false" "false" "clear" "clear"
            sync_reminder "$EXPIRY_ISO"
            exit "$PENDING_SOURCE_RESULT"
        fi
    fi
    activate_nginx "检测到上次签发后的 nginx 待重载状态，优先重试证书加载" "$PENDING_SOURCE_RESULT"
fi

if [ "$DAYS_REMAINING" -gt "$RENEW_THRESHOLD_DAYS" ]; then
    MESSAGE="证书剩余 ${DAYS_REMAINING} 天，未到 ${RENEW_THRESHOLD_DAYS} 天检查窗口，跳过续签检查"
    log "$MESSAGE"
    persist_status "skipped" 0 "true" "$MESSAGE" "$EXPIRY_ISO" "$DAYS_REMAINING" "false"
    sync_reminder "$EXPIRY_ISO"
    log "=== 证书更新检查完成 ==="
    exit 0
fi

BEFORE_FINGERPRINT=$(get_certificate_fingerprint)
if [ -z "$BEFORE_FINGERPRINT" ]; then
    MESSAGE="无法读取更新前的证书指纹"
    log "$MESSAGE"
    persist_status "failed" 1 "false" "$MESSAGE" "$EXPIRY_ISO" "$DAYS_REMAINING" "false"
    log "=== 证书更新检查完成 ==="
    exit 1
fi

MESSAGE="已记录更新前证书指纹，准备调用 acme.sh"
persist_status "checking" 0 "false" "$MESSAGE" "$EXPIRY_ISO" "$DAYS_REMAINING" "false" "false" "clear" "$BEFORE_FINGERPRINT"
log "证书剩余 ${DAYS_REMAINING} 天，开始调用 acme.sh 检查目标证书"
"$ACME_SH" --renew -d "$ACME_DOMAIN" --ecc 2>&1 | tee -a "$LOG_FILE"
ACME_RESULT=${PIPESTATUS[0]}
ACME_PENDING_RESULT="clear"
if [ "$ACME_RESULT" -ne 0 ] && [ "$ACME_RESULT" -ne 2 ]; then
    ACME_PENDING_RESULT="$ACME_RESULT"
fi

EXPIRY_TEXT=$(get_expiry_text)
if [ -z "$EXPIRY_TEXT" ]; then
    MESSAGE="acme.sh 执行后无法读取证书到期时间"
    log "$MESSAGE"
    persist_status "failed" 1 "false" "$MESSAGE" "" "" "false" "true" "$ACME_PENDING_RESULT"
    log "=== 证书更新检查完成 ==="
    exit 1
fi

EXPIRY_ISO=$(get_expiry_iso "$EXPIRY_TEXT")
EXPIRY_EPOCH=$(date -d "$EXPIRY_TEXT" +%s)
NOW_EPOCH=$(date +%s)
DAYS_REMAINING=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))
AFTER_FINGERPRINT=$(get_certificate_fingerprint)

if [ -z "$AFTER_FINGERPRINT" ]; then
    MESSAGE="acme.sh 执行后无法读取证书指纹"
    log "$MESSAGE"
    persist_status "failed" 1 "false" "$MESSAGE" "$EXPIRY_ISO" "$DAYS_REMAINING" "false" "true" "$ACME_PENDING_RESULT"
    log "=== 证书更新检查完成 ==="
    exit 1
fi

if [ "$BEFORE_FINGERPRINT" = "$AFTER_FINGERPRINT" ]; then
    if [ "$ACME_RESULT" -eq 0 ] || [ "$ACME_RESULT" -eq 2 ]; then
        MESSAGE="acme.sh 检查完成，目标证书未到 CA/ARI 续期时间"
        log "$MESSAGE"
        persist_status "skipped" 0 "true" "$MESSAGE" "$EXPIRY_ISO" "$DAYS_REMAINING" "false" "false" "clear" "clear"
        sync_reminder "$EXPIRY_ISO"
        log "=== 证书更新检查完成 ==="
        exit 0
    fi

    MESSAGE="acme.sh 续签检查失败，退出码: $ACME_RESULT"
    log "$MESSAGE"
    persist_status "failed" "$ACME_RESULT" "false" "$MESSAGE" "$EXPIRY_ISO" "$DAYS_REMAINING" "false" "false" "clear" "clear"
    sync_reminder "$EXPIRY_ISO"
    log "=== 证书更新检查完成 ==="
    exit "$ACME_RESULT"
fi

activate_nginx "检测到目标证书已变化（acme.sh 退出码: $ACME_RESULT），开始验证并重载 nginx" "$ACME_RESULT"
