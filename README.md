# Reminder App

一个基于 Next.js 16 + Prisma 7 + SQLite 的轻量提醒系统，现已包含：
- OTP 登录保护
- 提醒事项管理
- SMTP 邮件提醒
- 库存监控页面
- 普货店 / 群主店库存同步
- 定时库存通知

## 1. 功能概览

当前项目主要包含两部分：

### 提醒系统
- OTP 首次绑定与登录
- 新建 / 编辑 / 删除提醒
- 周期提醒
- 邮件通知
- 单用户配置中心

### 库存监控系统
- 普货店库存抓取
- 群主店库存抓取
- 同款商品归并显示
- 以普货店作为主商品判断通知
- 每个商品独立配置：
  - 是否通知
  - 最小库存阈值
  - 最大库存阈值
- 页面显示 3 个定时任务状态：
  - 普货店同步
  - 群主店同步
  - 库存通知检查

## 2. 技术栈

- Next.js 16 (App Router)
- React 19
- Prisma 7
- SQLite
- Zod
- Nodemailer
- Vitest

## 3. 环境要求

- Node.js >= 22
- npm >= 10
- Linux 服务器（推荐 Ubuntu）

## 4. 本地开发快速启动

```bash
# 1) 安装依赖
npm install

# 2) 初始化数据库（迁移 + seed）
npm run db:init

# 3) 启动开发服务
npm run dev
```

默认访问：
- http://localhost:3000

首次访问受保护页面时，会进入 `/auth` 完成 OTP 初始化或登录。

## 5. 常用命令

```bash
# 开发
npm run dev

# 测试
npm test

# lint
npm run lint

# 生产构建
npm run build

# 生产启动
npm run start

# Prisma
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run prisma:studio

# 数据库快捷命令
npm run db:init
npm run db:reset   # 会清空数据，生产环境不要执行

# 原有提醒邮件任务
npm run reminders:send

# 库存相关任务
npm run inventory:sync:general
npm run inventory:sync:owner
npm run inventory:check
```

## 6. 环境变量

项目默认读取根目录 `.env`。

推荐直接复制模板：

```bash
cp .env.example .env
```

最小可运行示例：

```env
DATABASE_URL="file:./dev.db"
APP_BASE_URL="http://localhost:3000"
APP_NAME="到期提醒"
SESSION_SECRET="请替换为至少16位随机字符串"
OTP_SECRET_ENCRYPTION_KEY="请替换为至少32位随机字符串"
NODE_ENV="development"
```

如需启用邮件提醒，还需要：

```env
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_USER="your_smtp_user"
SMTP_PASS="your_smtp_password"
SMTP_FROM_EMAIL="bot@example.com"
SMTP_FROM_NAME="提醒助手"
```

说明：
- `DATABASE_URL` 默认可用 `file:./dev.db`
- `SESSION_SECRET` 必须自行替换
- `OTP_SECRET_ENCRYPTION_KEY` 必须自行替换
- 生产环境必须改 `APP_BASE_URL`

## 7. 目录结构

```text
app/                 Next.js 页面与 API 路由
components/          页面组件
lib/                 业务逻辑与公共库
prisma/
  schema.prisma      Prisma 数据模型
  migrations/        数据库迁移
  seed.ts            初始化脚本
scripts/             定时任务脚本
tests/               测试
```

## 8. 库存监控逻辑说明

### 数据源
- 普货店：`https://stock.makerich.club/`
- 群主店：`https://shop.bmoplus.com/user/api/index/commodity?categoryId=0`

### 归并逻辑
- 以普货店商品为主商品目录
- 群主店只做同款匹配参考
- 页面同一行显示：
  - 普货店库存
  - 群主店同款库存
- 通知逻辑只按普货店库存判断

### 定时任务建议
- 普货店同步：每 1 分钟
- 群主店同步：每 3 分钟
- 库存通知检查：每 1 分钟

## 9. 生产部署简述

如果你已经有一台 Linux 服务器，最短路径是：

```bash
git clone git@github.com:ink100/reminder-app.git
cd reminder-app
npm install
cp .env.example .env   # 如果仓库里有样例文件，可手工创建也行
npm run db:init
npm run build
PORT=63456 npm run start
```

然后访问：
- `http://你的IP:63456/auth`

更完整的从 0 到 1 SOP，请看：
- `docs/deploy-sop.md`

## 10. 隐私与安全

仓库默认不会提交以下内容：
- `.env`
- `*.db`
- `*.sqlite`
- `.next`
- `node_modules`

请注意：
- 不要把生产数据库提交到 GitHub
- 不要把 `.env` 提交到 GitHub
- 不要把 SMTP 密码或 OTP 密钥写进文档
- 修改生产环境前，先备份数据库文件

## 11. 维护建议

### 备份
至少备份这些：
- `.env`
- `dev.db` 或生产数据库文件
- `~/.hermes/cron/jobs.json`（如果你依赖系统外部 cron 信息）

### 升级流程
推荐顺序：

```bash
git pull
npm install
npm run build
# 如有 schema 变化，再执行
npm run db:init
```

注意：
- 生产环境不要随便运行 `npm run db:reset`
- 有真实数据时，优先备份后再做迁移

## 12. 备注

- Prisma 7 的 datasource URL 配置在 `prisma.config.ts`
- OTP 页面使用动态渲染，避免状态缓存错误
- 库存任务状态会从本机 `~/.hermes/cron/jobs.json` 读取并展示到 `/inventory`
