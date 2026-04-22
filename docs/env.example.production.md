# 生产环境变量模板

仓库根目录已经提供了可直接复制的 `.env.example`。

推荐生产环境操作方式：

```bash
cp .env.example .env
```

然后按本文说明把 `.env` 改成生产值。

```env
# 数据库
DATABASE_URL="file:./dev.db"

# 站点地址
APP_BASE_URL="http://你的服务器IP:63456"
APP_NAME="到期提醒"

# 安全密钥
SESSION_SECRET="替换成至少16位随机字符串"
OTP_SECRET_ENCRYPTION_KEY="替换成至少32位随机字符串"

# 运行环境
NODE_ENV="production"

# SMTP（如需邮件通知）
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_USER="your_smtp_user"
SMTP_PASS="your_smtp_password"
SMTP_FROM_EMAIL="bot@example.com"
SMTP_FROM_NAME="提醒助手"
```

## 字段说明

### DATABASE_URL
- 默认本项目使用 SQLite
- 常见写法：

```env
DATABASE_URL="file:./dev.db"
```

### APP_BASE_URL
必须写成你最终实际访问的地址，例如：

```env
APP_BASE_URL="http://43.166.3.129:63456"
```

如果将来挂域名，也要改成正式域名。

### SESSION_SECRET
要求：
- 至少 16 位
- 使用随机字符串

生成示例：

```bash
openssl rand -hex 16
```

### OTP_SECRET_ENCRYPTION_KEY
要求：
- 至少 32 位
- 使用随机字符串

生成示例：

```bash
openssl rand -hex 32
```

### SMTP 配置
如果你要启用：
- 提醒邮件
- 库存通知邮件

则必须正确填写 SMTP 项。

如果不启用邮件，这些字段可以先留空。

## 生产环境注意事项

1. `.env` 不要提交到 GitHub
2. 不要把真实 SMTP 密码写进文档
3. 更换服务器或迁移环境时，记得同步 `.env`
4. 修改 `APP_BASE_URL` 后，建议重启服务
5. 修改密钥前请确认现有登录/加密数据影响

## 推荐部署后检查

```bash
cat .env
npm run build
PORT=63456 npm run start
```

然后访问：
- `/auth`
- `/inventory`

确认页面和 OTP 登录正常。
