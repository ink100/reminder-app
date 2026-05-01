# Reminder App 从 0 到 1 部署 SOP

这份文档面向“第一次接手项目的人”，目标是：
- 从一台空白 Linux 服务器
- 部署出可访问的 Reminder App
- 启动库存监控与定时任务
- 避免把数据库和隐私配置提交到 GitHub

## 0. 适用场景

默认假设：
- 系统：Ubuntu / Debian
- 你有 sudo 权限
- 服务器能访问 GitHub 和外网
- 项目路径：`/home/agentuser/reminder-app`
- 业务端口：`63456`

## 1. 准备阶段

### 1.1 安装基础环境

先确认 Node / npm：

```bash
node -v
npm -v
```

如果没有 Node 22，可用 nvm 或系统包管理器安装。

### 1.2 获取代码

```bash
cd /home/agentuser
git clone git@github.com:ink100/reminder-app.git
cd reminder-app
```

如果目录已存在：

```bash
cd /home/agentuser/reminder-app
git pull
```

## 2. 配置环境变量

在项目根目录创建 `.env`：

```bash
cp .env.example .env
```

推荐填写：

```env
DATABASE_URL="file:./dev.db"
APP_BASE_URL="http://43.166.3.129:63456"
APP_NAME="到期提醒"
SESSION_SECRET="替换成至少16位随机字符串"
OTP_SECRET_ENCRYPTION_KEY="替换成至少32位随机字符串"
NODE_ENV="production"

# 如需邮件通知
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_USER="your_smtp_user"
SMTP_PASS="your_smtp_password"
SMTP_FROM_EMAIL="bot@example.com"
SMTP_FROM_NAME="提醒助手"
```

### 2.1 生成随机密钥示例

```bash
openssl rand -hex 16
openssl rand -hex 32
```

把结果分别填入：
- `SESSION_SECRET`
- `OTP_SECRET_ENCRYPTION_KEY`

## 3. 安装依赖

```bash
npm install
```

## 4. 初始化数据库

首次部署执行：

```bash
npm run db:init
```

说明：
- 该命令会执行 Prisma migrate + seed
- 不会主动清空现有数据

禁止在生产环境乱执行：

```bash
npm run db:reset
```

因为这个命令会重建数据库。

## 5. 构建生产版本

```bash
npm run build
```

如果构建失败：
- 先看 TypeScript 报错
- 再看环境变量是否缺失
- 最后检查 Prisma schema / migration 是否同步

## 6. 启动服务

临时启动方式：

```bash
PORT=63456 npm run start
```

如果要后台启动，可以先临时用：

```bash
nohup env PORT=63456 npm run start > app.log 2>&1 &
```

然后检查监听：

```bash
ss -ltnp | grep 63456
```

检查 HTTP：

```bash
curl -I http://127.0.0.1:63456/
curl -I http://127.0.0.1:63456/inventory
```

## 7. 首次访问验证

浏览器打开：

```text
http://43.166.3.129:63456/inventory
```

首次进入流程：
1. 打开 `/inventory`
2. 如果还没配置 OTP，会直接显示二维码
3. 用验证器扫码
4. 输入动态码完成首次绑定
5. 后续再次访问 `/inventory` 时直接在该页输入 OTP 登录

## 8. 库存监控验证

登录后访问：

```text
http://43.166.3.129:63456/inventory
```

应该能看到：
- 群主店同款库存
- 每个商品的通知开关
- 最小 / 最大通知阈值
- 定时任务状态卡片

### 8.1 手工测试抓取脚本

```bash
npm run inventory:sync:owner
npm run inventory:check
```

预期：
- 能正常输出同步数量
- 没配置邮件时，`inventory:check` 可能显示 skip

## 9. 定时任务 SOP

当前建议的定时频率：
- 群主店：每 3 分钟
- 通知检查：每 1 分钟

如果你用 Hermes cron，任务分别是：
- 群主店同步：`npm run inventory:sync:owner`
- 通知检查：`npm run inventory:check`

如果你改用系统 crontab，也可以写成类似：

```cron
*/3 * * * * cd /home/agentuser/reminder-app && npm run inventory:sync:owner >> /tmp/inventory-owner.log 2>&1
* * * * * cd /home/agentuser/reminder-app && npm run inventory:check >> /tmp/inventory-check.log 2>&1
```

## 10. 版本更新 SOP

后续更新代码时，标准顺序：

```bash
cd /home/agentuser/reminder-app
git pull
npm install
npm run build
npm run db:init
```

如果你已经有运行中的服务：
1. 停掉旧进程
2. 确认端口释放
3. 启动新版本

例如：

```bash
ss -ltnp | grep 63456
kill <PID>
ss -ltnp | grep 63456 || true
PORT=63456 npm run start
```

## 11. 故障排查

### 11.1 访问 `/inventory` 先看到 OTP 登录卡片
这是正常的，说明页面已把 OTP 验证集成到库存通知入口。

### 11.2 构建通过但页面不对
检查：
- 是否启动了新构建版本
- 是否端口被旧进程占用
- 是否 APP_BASE_URL 写错

### 11.3 收不到邮件
检查：
- `/settings` 中是否开启邮箱通知
- 收件邮箱是否填写
- SMTP 配置是否可用
- `npm run inventory:check` 输出是否是 `skip: smtp config missing`

### 11.4 库存任务没更新
检查：
- 定时任务是否还在运行
- `/inventory` 中的任务状态是否成功
- 外部数据源是否可访问
- 服务器是否能访问当前仍启用的库存源

## 12. 安全与隐私要求

以下内容绝对不要提交到 GitHub：
- `.env`
- `dev.db`
- `prisma/dev.db`
- 任何 `.sqlite` / `.db` 文件
- SMTP 密码
- OTP 密钥

上线前一定确认 `.gitignore` 已覆盖这些文件。

## 13. 建议的交接清单

如果要把项目交给别人运维，至少交这些：
- GitHub 仓库地址
- 服务器登录方式
- `.env` 内容（通过安全方式交接）
- 当前端口号
- 生产数据库备份
- 定时任务清单
- SMTP 发信账号信息
- OTP 初始接管说明

## 14. 最后的验收清单

部署完成后逐条确认：

- [ ] `npm install` 成功
- [ ] `npm run db:init` 成功
- [ ] `npm run build` 成功
- [ ] `PORT=63456 npm run start` 成功
- [ ] `ss -ltnp | grep 63456` 能看到监听
- [ ] `/inventory` 可访问
- [ ] OTP 可初始化 / 可登录
- [ ] `/inventory` 页面正常
- [ ] 能看到库存通知配置
- [ ] 定时任务状态正常
- [ ] 邮件通知配置正常（如启用）

完成以上项，才算真正从 0 到 1 部署成功。
