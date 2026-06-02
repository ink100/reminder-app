#!/bin/bash
# SSL 证书自动更新脚本
# 使用 acme.sh 更新 ZeroSSL 证书，更新后重载 nginx

LOG_FILE="/home/ubuntu/apps/reminder-app/logs/ssl-renew.log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

log "=== 开始证书更新检查 ==="

# 执行更新
~/.acme.sh/acme.sh --renew-all --ecc 2>&1 | tee -a "$LOG_FILE"
RESULT=$?

if [ $RESULT -eq 0 ]; then
    log "证书更新命令执行成功"
    
    # 重载 nginx 使新证书生效
    sudo nginx -t 2>&1 | tee -a "$LOG_FILE"
    if [ $? -eq 0 ]; then
        sudo nginx -s reload 2>&1 | tee -a "$LOG_FILE"
        log "nginx 重载成功"
    else
        log "nginx 配置检查失败，跳过重载"
    fi
else
    log "证书更新命令执行失败，退出码: $RESULT"
fi

log "=== 证书更新检查完成 ==="

# 记录更新结果到 JSON 文件供 API 读取
CERT_FILE="/home/ubuntu/.acme.sh/daydreams.cn_ecc/daydreams.cn.cer"
APP_DIR="/home/ubuntu/apps/reminder-app"
mkdir -p "$APP_DIR/data"
if [ -f "$CERT_FILE" ]; then
    EXPIRY=$(openssl x509 -in "$CERT_FILE" -noout -enddate | cut -d= -f2)
    EXPIRY_ISO=$(date -d "$EXPIRY" -Iseconds 2>/dev/null || date -d "$EXPIRY" '+%Y-%m-%dT%H:%M:%SZ')
    
    cat > "$APP_DIR/data/ssl-status.json" << EOF
{
  "lastRenew": "$(date -Iseconds)",
  "lastResult": $RESULT,
  "expiry": "$EXPIRY_ISO",
  "updated": "$(date '+%Y-%m-%d %H:%M:%S')"
}
EOF
    log "已更新 ssl-status.json"

    if cd "$APP_DIR" && npx tsx scripts/sync-ssl-reminder.ts "$EXPIRY_ISO" 2>&1 | tee -a "$LOG_FILE"; then
        log "已同步 SSL 证书到期提醒"
    else
        log "同步 SSL 证书到期提醒失败"
    fi
fi
