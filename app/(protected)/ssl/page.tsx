'use client'

import { useState, useEffect } from 'react'
import {
  Shield,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Calendar,
  FileText,
  Copy,
  ExternalLink,
} from 'lucide-react'

interface SSLStatus {
  lastRenew: string | null
  lastResult: number | null
  expiry: string | null
  updated: string | null
  daysRemaining?: number
  subject?: string
  issuer?: string
  serialNumber?: string
  isExpired?: boolean
}

interface SSLData {
  status: SSLStatus
  acmeList: string
  logs: string
  certPath: string
  renewScript: string
}

export default function SSLPage() {
  const [data, setData] = useState<SSLData | null>(null)
  const [loading, setLoading] = useState(true)
  const [renewing, setRenewing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [renewResult, setRenewResult] = useState<{
    success: boolean
    message: string
    output?: string
  } | null>(null)

  const fetchSSLStatus = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/ssl')
      if (!response.ok) throw new Error('获取 SSL 状态失败')
      const result = await response.json()
      setData(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取 SSL 状态失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSSLStatus()
  }, [])

  const handleRenew = async () => {
    if (!confirm('确定要手动更新 SSL 证书吗？')) return

    try {
      setRenewing(true)
      setRenewResult(null)
      const response = await fetch('/api/ssl', { method: 'POST' })
      const result = await response.json()

      setRenewResult({
        success: result.success,
        message: result.message || result.error,
        output: result.output,
      })

      // 刷新状态
      if (result.success) {
        await fetchSSLStatus()
      }
    } catch (err) {
      setRenewResult({
        success: false,
        message: err instanceof Error ? err.message : '更新失败',
      })
    } finally {
      setRenewing(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const getStatusColor = (daysRemaining?: number) => {
    if (!daysRemaining) return 'text-gray-500'
    if (daysRemaining <= 0) return 'text-red-600'
    if (daysRemaining <= 30) return 'text-orange-500'
    return 'text-green-600'
  }

  const getStatusIcon = (daysRemaining?: number) => {
    if (!daysRemaining) return <Clock className="w-5 h-5 text-gray-500" />
    if (daysRemaining <= 0) return <XCircle className="w-5 h-5 text-red-600" />
    if (daysRemaining <= 30)
      return <AlertTriangle className="w-5 h-5 text-orange-500" />
    return <CheckCircle className="w-5 h-5 text-green-600" />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center gap-2 text-red-600">
          <XCircle className="w-5 h-5" />
          <span className="font-medium">错误</span>
        </div>
        <p className="mt-2 text-red-600">{error}</p>
        <button
          onClick={fetchSSLStatus}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          重试
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            SSL 证书管理
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            管理和监控 SSL 证书状态
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchSSLStatus}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button
            onClick={handleRenew}
            disabled={renewing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {renewing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Shield className="w-4 h-4" />
            )}
            {renewing ? '更新中...' : '手动更新证书'}
          </button>
        </div>
      </div>

      {/* 更新结果提示 */}
      {renewResult && (
        <div
          className={`p-4 rounded-lg ${
            renewResult.success
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {renewResult.success ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <XCircle className="w-5 h-5 text-red-600" />
            )}
            <span
              className={`font-medium ${
                renewResult.success ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {renewResult.message}
            </span>
          </div>
          {renewResult.output && (
            <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-auto max-h-40">
              {renewResult.output}
            </pre>
          )}
        </div>
      )}

      {/* 证书状态卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 状态卡片 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">证书状态</p>
              <p
                className={`text-2xl font-bold mt-1 ${getStatusColor(
                  data?.status.daysRemaining
                )}`}
              >
                {data?.status.isExpired ? '已过期' : '正常'}
              </p>
            </div>
            {getStatusIcon(data?.status.daysRemaining)}
          </div>
        </div>

        {/* 剩余天数 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">剩余天数</p>
              <p
                className={`text-2xl font-bold mt-1 ${getStatusColor(
                  data?.status.daysRemaining
                )}`}
              >
                {data?.status.daysRemaining ?? '-'}
              </p>
            </div>
            <Calendar className="w-5 h-5 text-gray-400" />
          </div>
        </div>

        {/* 到期时间 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">到期时间</p>
            <p className="text-lg font-medium mt-1">
              {data?.status.expiry
                ? formatDate(data.status.expiry)
                : '-'}
            </p>
          </div>
        </div>

        {/* 上次更新 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">上次更新</p>
            <p className="text-lg font-medium mt-1">
              {data?.status.lastRenew
                ? formatDate(data.status.lastRenew)
                : '-'}
            </p>
          </div>
        </div>
      </div>

      {/* 证书详细信息 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            证书详细信息
          </h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">
                域名 (Subject)
              </label>
              <div className="flex items-center gap-2 mt-1">
                <code className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm">
                  {data?.status.subject || '-'}
                </code>
                <button
                  onClick={() =>
                    copyToClipboard(data?.status.subject || '')
                  }
                  className="text-gray-400 hover:text-gray-600"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">
                颁发机构 (Issuer)
              </label>
              <p className="mt-1 text-sm">{data?.status.issuer || '-'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">
                序列号
              </label>
              <p className="mt-1 text-sm font-mono">
                {data?.status.serialNumber || '-'}
              </p>
            </div>
            <div>
              <label className="text-sm text-gray-500 dark:text-gray-400">
                证书路径
              </label>
              <p className="mt-1 text-sm font-mono">{data?.certPath || '-'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 定时任务配置 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            定时任务配置
          </h2>
        </div>
        <div className="p-6">
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Crontab 配置
              </span>
              <button
                onClick={() =>
                  copyToClipboard('0 3 1,15 * * /home/ubuntu/apps/reminder-app/scripts/ssl-renew.sh')
                }
                className="text-gray-400 hover:text-gray-600"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <code className="text-sm text-blue-600 dark:text-blue-400">
              0 3 1,15 * * /home/ubuntu/apps/reminder-app/scripts/ssl-renew.sh
            </code>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              每月 1 号和 15 号凌晨 3:00 自动检查并更新证书
            </p>
          </div>
        </div>
      </div>

      {/* 更新日志 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              更新日志
            </h2>
            <FileText className="w-5 h-5 text-gray-400" />
          </div>
        </div>
        <div className="p-6">
          <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-sm overflow-auto max-h-60 font-mono">
            {data?.logs || '暂无日志'}
          </pre>
        </div>
      </div>

      {/* acme.sh 列表 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            ACME 证书列表
          </h2>
        </div>
        <div className="p-6">
          <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-sm overflow-auto font-mono">
            {data?.acmeList || '无数据'}
          </pre>
        </div>
      </div>

      {/* 帮助信息 */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
        <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
          关于 SSL 证书管理
        </h3>
        <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
          <li>• 使用 ZeroSSL 颁发的 ECC 证书，有效期 90 天</li>
          <li>• 系统会自动在每月 1 号和 15 号检查并更新证书</li>
          <li>• 证书更新后会自动重载 Nginx 配置</li>
          <li>• 建议在证书剩余 30 天内完成更新</li>
          <li>• 支持通配符域名 *.daydreams.cn</li>
        </ul>
      </div>
    </div>
  )
}
