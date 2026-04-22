# Reminder App

一个基于 Next.js 16 + Prisma 7 + SQLite 的到期提醒应用。

## 技术栈

- Next.js 16 (App Router)
- Prisma 7
- SQLite (本地开发数据库)
- Vitest

## 环境要求

- Node.js >= 22
- npm >= 10

## 新机器 3 步启动

```bash
# 1) 安装依赖
npm install

# 2) 初始化数据库（迁移 + seed）
npm run db:init

# 3) 启动开发服务
npm run dev
```

打开 http://localhost:3000

## 常用命令

```bash
# 开发
npm run dev

# 测试
npm test

# Prisma
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run prisma:studio

# 数据库快捷命令
npm run db:init    # migrate dev + seed
npm run db:reset   # reset + seed（会清空数据）
```

## 环境变量

默认使用项目根目录 `.env`：

```env
DATABASE_URL="file:./dev.db"
APP_BASE_URL="http://localhost:3000"
APP_NAME="到期提醒"
SESSION_SECRET="dev-session-secret-change-me"
OTP_SECRET_ENCRYPTION_KEY="0123456789abcdef0123456789abcdef"
NODE_ENV="development"
```

## 项目结构（简）

```text
app/                 Next.js 页面与路由
lib/                 公共库（含 Prisma 客户端）
prisma/
  schema.prisma      数据模型
  migrations/        迁移文件
  seed.ts            种子数据脚本
tests/               测试
```

## 说明

- Prisma 7 连接配置在 `prisma.config.ts`，而不是 `schema.prisma` 的 `datasource.url`。
- 当前 seed 会初始化 `AppSetting`（id=1）默认配置。
