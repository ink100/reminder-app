# 运维日常检查清单

这份清单用于部署完成后的日常巡检、故障排查和版本更新。

## 1. 服务可用性检查

### 1.1 端口监听
```bash
ss -ltnp | grep 63456
```

预期：
- 能看到 `next-server` 监听 `63456`

### 1.2 页面连通性
```bash
curl -I http://127.0.0.1:63456/auth
curl -I http://127.0.0.1:63456/inventory
```

说明：
- `/inventory` 未登录时跳 `/auth` 属于正常

## 2. 代码与版本检查

### 2.1 当前分支与提交
```bash
git status --short --branch
git log --oneline -3
```

目标：
- 确认当前在 `main`
- 确认没有意外未提交文件

## 3. 数据库检查

### 3.1 数据库文件是否存在
```bash
find . -maxdepth 2 \( -name '*.db' -o -name '*.sqlite' \)
```

### 3.2 迁移状态
```bash
npm run db:init
```

注意：
- 生产环境不要执行 `npm run db:reset`

## 4. 库存任务检查

### 4.1 手工执行一次
```bash
npm run inventory:sync:general
npm run inventory:sync:owner
npm run inventory:check
```

### 4.2 页面看任务状态
登录后打开：
- `/inventory`

确认：
- 普货店同步状态
- 群主店同步状态
- 库存通知检查状态

### 4.3 定时任务输出
如使用 Hermes cron，可检查：
```bash
cat ~/.hermes/cron/jobs.json
find ~/.hermes/cron/output -maxdepth 2 -type f | tail
```

## 5. 邮件通知检查

### 5.1 SMTP 配置是否存在
检查 `.env` 或 `/settings` 页面里的 SMTP 配置。

### 5.2 测试邮件
登录后台后，到设置页发送测试邮件。

### 5.3 通知脚本输出
```bash
npm run inventory:check
npm run reminders:send
```

关注是否出现：
- `skip: smtp config missing`
- `skip: email notifications disabled or recipient missing`

## 6. OTP 登录检查

### 6.1 登录页
访问：
- `/auth`

### 6.2 登录是否正常
确认：
- 首次绑定可用
- 已绑定时可正常输入 OTP 登录

## 7. 更新版本 SOP

标准步骤：

```bash
cd /home/agentuser/reminder-app
git pull
npm install
npm run build
npm run db:init
```

然后重启服务。

如果旧进程占端口：
```bash
ss -ltnp | grep 63456
kill <PID>
PORT=63456 npm run start
```

## 8. 备份清单

建议至少备份：
- `.env`
- `dev.db` / 实际数据库文件
- `~/.hermes/cron/jobs.json`
- 必要的日志输出

## 9. 故障优先排查顺序

如果出现线上异常，建议按这个顺序查：

1. 端口是否还在监听
2. `npm run build` 是否通过
3. `.env` 是否缺少关键变量
4. 数据库文件是否存在
5. 定时任务是否仍在运行
6. SMTP 是否配置正确
7. `/inventory` 页面里的任务状态是否异常

## 10. 安全检查

确认以下文件没有进 Git：
- `.env`
- `*.db`
- `*.sqlite`
- `.next`
- `node_modules`

可用命令：
```bash
git status --ignored
```

## 11. 每次发布后验收

发布后至少做一次：
- [ ] `/auth` 可访问
- [ ] OTP 登录正常
- [ ] `/inventory` 打开正常
- [ ] 普货店库存正常显示
- [ ] 群主店库存正常显示
- [ ] 定时任务状态正常
- [ ] 邮件通知流程可用（如果启用）
