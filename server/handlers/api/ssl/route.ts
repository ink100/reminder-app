import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'

import { requireAdminApi } from '@/lib/admin-api'
import { syncSslCertificateReminder, type SyncSslCertificateReminderResult } from '@/lib/ssl-reminder'

const execFileAsync = promisify(execFile)

const APP_DIR = process.env.REMINDER_SSL_APP_DIR || process.cwd()
const SSL_STATUS_FILE = process.env.REMINDER_SSL_STATUS_FILE || path.join(APP_DIR, 'data', 'ssl-status.json')
const SSL_LOG_FILE = process.env.REMINDER_SSL_LOG_FILE || path.join(APP_DIR, 'logs', 'ssl-renew.log')
const CERT_FILE = process.env.REMINDER_SSL_CERT_FILE || '/home/ubuntu/.acme.sh/daydreams.cn_ecc/daydreams.cn.cer'
const ACME_SH = process.env.REMINDER_SSL_ACME_SH || path.join(process.env.HOME || '/home/ubuntu', '.acme.sh', 'acme.sh')
const RENEW_SCRIPT = process.env.REMINDER_SSL_RENEW_SCRIPT || path.join(APP_DIR, 'scripts', 'ssl-renew.sh')

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
  certificateAvailable?: boolean
  certificateError?: string | null
  certificateChanged?: boolean
  reloadPending?: boolean
  pendingAcmeResult?: number
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

    // 从证书文件获取详细信息。GET 必须保持只读，提醒同步仅由续签脚本或 POST 执行。
    try {
      const [{ stdout: expiry }, { stdout: subject }, { stdout: issuer }, { stdout: serial }] = await Promise.all([
        execFileAsync('openssl', ['x509', '-in', CERT_FILE, '-noout', '-enddate'], { encoding: 'utf8' }),
        execFileAsync('openssl', ['x509', '-in', CERT_FILE, '-noout', '-subject'], { encoding: 'utf8' }),
        execFileAsync('openssl', ['x509', '-in', CERT_FILE, '-noout', '-issuer'], { encoding: 'utf8' }),
        execFileAsync('openssl', ['x509', '-in', CERT_FILE, '-noout', '-serial'], { encoding: 'utf8' }),
      ])

      const expiryDate = new Date(expiry.trim().replace(/^notAfter=/, ''))
      const now = new Date()
      if (Number.isNaN(expiryDate.getTime())) {
        throw new Error('证书到期时间无效')
      }
      const daysRemaining = Math.floor(
        (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )

      certInfo.expiry = expiryDate.toISOString()
      certInfo.subject = subject.trim().replace(/^subject=/, '')
      certInfo.issuer = issuer.trim().replace(/^issuer=/, '')
      certInfo.serialNumber = serial.trim().replace(/^serial=/, '')
      certInfo.daysRemaining = daysRemaining
      certInfo.isExpired = expiryDate.getTime() <= now.getTime()
      certInfo.certificateAvailable = true
      certInfo.certificateError = null
    } catch (error) {
      certInfo.expiry = null
      certInfo.daysRemaining = undefined
      certInfo.subject = undefined
      certInfo.issuer = undefined
      certInfo.serialNumber = undefined
      certInfo.isExpired = undefined
      certInfo.certificateAvailable = false
      certInfo.certificateError = '无法读取服务器证书'
      console.error('读取证书信息失败:', error)
    }

    // 获取 acme.sh 列表
    let acmeList = ''
    try {
      const { stdout } = await execFileAsync(ACME_SH, ['--list'], { encoding: 'utf8' })
      acmeList = stdout
    } catch (error) {
      console.error('获取 acme.sh 列表失败:', error)
    }

    // 获取更新日志（最后50行）
    let logs = ''
    try {
      const logData = await fs.readFile(SSL_LOG_FILE, 'utf-8')
      logs = logData.split('\n').slice(-50).join('\n')
    } catch {
      logs = '暂无更新日志'
    }

    return Response.json({
      status: certInfo,
      reminderSync: null,
      acmeList,
      logs,
      certPath: CERT_FILE,
      renewScript: RENEW_SCRIPT,
    })
  } catch (error) {
    console.error('获取 SSL 状态失败:', error)
    return Response.json(
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
    const { stdout, stderr } = await execFileAsync('bash', [RENEW_SCRIPT], {
      timeout: 300000,
      encoding: 'utf8',
      env: {
        ...process.env,
        REMINDER_SSL_APP_DIR: APP_DIR,
        REMINDER_SSL_STATUS_FILE: SSL_STATUS_FILE,
        REMINDER_SSL_LOG_FILE: SSL_LOG_FILE,
        REMINDER_SSL_CERT_FILE: CERT_FILE,
        REMINDER_SSL_ACME_SH: ACME_SH,
      },
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

    if (status.lastAction === 'failed' || (status.lastResult !== null && status.lastResult !== 0)) {
      return Response.json(
        { success: false, error: '证书更新失败', status, reminderSync },
        { status: 500 }
      )
    }

    return Response.json({
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
    console.error('证书更新失败:', error)
    return Response.json(
      {
        success: false,
        error: '证书更新失败',
      },
      { status: 500 }
    )
  }
}
