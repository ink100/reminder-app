import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'

import { requireAdminApi } from '@/lib/admin-api'
import { syncSslCertificateReminder, type SyncSslCertificateReminderResult } from '@/lib/ssl-reminder'

const execAsync = promisify(exec)

const SSL_STATUS_FILE = path.join(process.cwd(), 'data', 'ssl-status.json')
const CERT_FILE = '/home/ubuntu/.acme.sh/daydreams.cn_ecc/daydreams.cn.cer'
const RENEW_SCRIPT = path.join(process.cwd(), 'scripts', 'ssl-renew.sh')

interface SSLStatus {
  lastRenew: string | null
  lastCheck?: string | null
  lastResult: number | null
  lastAction?: 'skipped' | 'renewed' | 'failed' | string | null
  skipped?: boolean
  message?: string | null
  expiry: string | null
  updated: string | null
  daysRemaining?: number
  subject?: string
  issuer?: string
  serialNumber?: string
  isExpired?: boolean
}

// 获取 SSL 证书状态
export async function GET() {
  const auth = await requireAdminApi()
  if (auth.response) return auth.response

  try {
    // 读取证书信息
    let certInfo: SSLStatus = {
      lastRenew: null,
      lastResult: null,
      expiry: null,
      updated: null,
    }

    // 读取上次更新记录
    try {
      const statusData = await fs.readFile(SSL_STATUS_FILE, 'utf-8')
      certInfo = { ...certInfo, ...JSON.parse(statusData) }
    } catch {
      // 文件不存在，使用默认值
    }

    let reminderSync: SyncSslCertificateReminderResult | null = null

    // 从证书文件获取详细信息，并同步成提醒事项
    try {
      const { stdout: expiry } = await execAsync(
        `openssl x509 -in ${CERT_FILE} -noout -enddate | cut -d= -f2`
      )
      const { stdout: subject } = await execAsync(
        `openssl x509 -in ${CERT_FILE} -noout -subject | sed 's/subject=//'`
      )
      const { stdout: issuer } = await execAsync(
        `openssl x509 -in ${CERT_FILE} -noout -issuer | sed 's/issuer=//'`
      )
      const { stdout: serial } = await execAsync(
        `openssl x509 -in ${CERT_FILE} -noout -serial | sed 's/serial=//'`
      )

      const expiryDate = new Date(expiry.trim())
      const now = new Date()
      const daysRemaining = Math.floor(
        (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )

      certInfo.expiry = expiryDate.toISOString()
      certInfo.subject = subject.trim()
      certInfo.issuer = issuer.trim()
      certInfo.serialNumber = serial.trim()
      certInfo.daysRemaining = daysRemaining
      certInfo.isExpired = daysRemaining <= 0
      reminderSync = await syncSslCertificateReminder(expiryDate)
    } catch (error) {
      console.error('读取证书信息或同步 SSL 提醒失败:', error)
    }

    // 获取 acme.sh 列表
    let acmeList = ''
    try {
      const { stdout } = await execAsync('~/.acme.sh/acme.sh --list')
      acmeList = stdout
    } catch (error) {
      console.error('获取 acme.sh 列表失败:', error)
    }

    // 获取更新日志（最后50行）
    let logs = ''
    try {
      const logFile = path.join(process.cwd(), 'logs', 'ssl-renew.log')
      const logData = await fs.readFile(logFile, 'utf-8')
      logs = logData.split('\n').slice(-50).join('\n')
    } catch {
      logs = '暂无更新日志'
    }

    return NextResponse.json({
      status: certInfo,
      reminderSync,
      acmeList,
      logs,
      certPath: CERT_FILE,
      renewScript: RENEW_SCRIPT,
    })
  } catch (error) {
    console.error('获取 SSL 状态失败:', error)
    return NextResponse.json(
      { error: '获取 SSL 状态失败' },
      { status: 500 }
    )
  }
}

// 手动触发证书更新
export async function POST() {
  const auth = await requireAdminApi()
  if (auth.response) return auth.response

  try {
    // 执行更新脚本
    const { stdout, stderr } = await execAsync(`bash ${RENEW_SCRIPT}`, {
      timeout: 120000, // 2分钟超时
    })

    // 读取更新后的状态
    let status: SSLStatus = {
      lastRenew: null,
      lastResult: null,
      expiry: null,
      updated: null,
    }

    let reminderSync: SyncSslCertificateReminderResult | null = null

    try {
      const statusData = await fs.readFile(SSL_STATUS_FILE, 'utf-8')
      status = { ...status, ...JSON.parse(statusData) }
      if (status.expiry) {
        reminderSync = await syncSslCertificateReminder(status.expiry)
      }
    } catch {
      // 文件不存在或提醒同步失败
    }

    const skipped = status.lastAction === 'skipped' || status.skipped === true

    return NextResponse.json({
      success: true,
      skipped,
      message:
        status.message ||
        (skipped
          ? '证书未到续期窗口，已跳过更新'
          : '证书更新脚本已执行，并已同步 SSL 到期提醒'),
      output: stdout,
      error: stderr || null,
      status,
      reminderSync,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '证书更新失败'
    const commandError = error as { stdout?: string }
    console.error('证书更新失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: message,
        output: commandError.stdout || null,
      },
      { status: 500 }
    )
  }
}
