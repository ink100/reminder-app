# Reminder App Nuxt 4 + Element Plus 全量迁移实施计划

> **状态：** 待实施  
> **实施方式：** 严格按阶段、按 TDD 执行；每个任务应由独立 subagent 完成所列文件和验证，不得顺手修改任务外文件。  
> **目标版本：** Nuxt `4.2.2`、Vue `3.x`、Element Plus `2.14.3`。  
> **硬约束：** 本计划只迁移运行框架和 UI，不改变业务语义、URL、数据模型或生产数据；**禁止重置数据库**；**禁止读取、打印、复制或提交凭据**；旧 Next 服务在 Nuxt 新构建及旁路验收全部通过前必须持续运行；实施者不得执行 `prisma migrate reset`、`npm run db:reset`、删库、重建库或 seed 覆盖生产数据。

---

## 1. 目标、非目标与完成定义

### 1.1 目标

1. 将 20 个 `page.tsx`、39 个 React 组件和全部 Next 布局迁移为 Nuxt/Vue SFC，最终删除 React、React DOM、Next、Radix React、Lucide React 和 React 测试工具。
2. 以 Nuxt 4.2.2/Nitro 承载服务端，以 Vue 3 + Element Plus 2.14.3 承载 UI；生产端口仍为 `127.0.0.1:63456`。
3. 保留现有 69 个 route 文件所表达的 **101 个 method handler**，包括 `/api/**`、`/.well-known/ai-plugin.json`、`/notify`、`/channels`、`/groups`、`/templates`、`/notifications/**`、`/queue/**`、`/cancel/**`；路径、HTTP 方法、查询参数、请求体、响应体、状态码、响应头均保持兼容。
4. 保留认证 Session Cookie、WebAuthn ceremony Cookie 的名称和值格式、`Path`、`HttpOnly`、`SameSite`、`Secure`、`Max-Age` 语义；保留 OTP、Passkey、可信设备、邀请注册和权限规则。
5. 保留 AI/OpenAPI、Notification API Key、R2、SMTP、Telegram、License、scheduler 等能力；不得在客户端 bundle、测试快照、日志或错误响应中暴露 key/secret/token。
6. 保留 Prisma/现有数据库和所有业务数据；本迁移默认 **零 schema migration**。

### 1.2 非目标

- 不重构数据库模型，不改变 Prisma migration 历史，不重新归属数据。
- 不改变产品流程、权限矩阵、导航信息架构、文案含义或 API 契约。
- 不借迁移更换 WebAuthn RP ID/origin、Cookie 名称、Session 哈希算法、AI key 存储方式、scheduler 规则或通知去重策略。
- 不在迁移中升级 Nuxt/Element Plus 到目标版本之外的版本。

### 1.3 完成定义

- 路由清单测试证明 69 条路径/101 个方法全部注册，无重复、无遗漏。
- API 契约、认证、Cookie、WebAuthn、scheduler、核心业务和 Vue 组件测试全绿。
- 所有 20 个页面 URL 可直接访问和刷新；未登录、无权限和 404 行为兼容。
- `npm run lint && npm run typecheck && npm test && npm run build` 全绿。
- 仓库内不存在运行时代码中的 `next/*`、`react*`、`.tsx`、JSX 或 React 专属依赖；Nuxt 从根 `app/` 运行。
- 新构建先在旁路端口 `63457` 验证，旧服务继续占用 `63456`；通过后才切 systemd，切换后再做生产只读/可回滚 smoke test。

---

## 2. 目标架构与技术栈

### 2.1 技术栈

- UI：Vue 3 Composition API、Nuxt 4.2.2、Element Plus 2.14.3、`@element-plus/icons-vue`。
- 服务端：Nitro/H3 作为入口；业务 handler 使用 Web 标准 `Request`/`Response`，避免业务层依赖 H3。
- 状态/请求：优先 Nuxt `useFetch`/`$fetch` 和局部 composable；不新增全局 store，除非测试证明跨页状态确有必要。
- 表单/校验：复用现有 Zod validator；Element Plus `ElForm` 仅负责交互和展示。
- 数据：原 Prisma Client、PostgreSQL/LibSQL/Supabase/R2 接入保持不变。
- 测试：Vitest 4、`@vue/test-utils`、`@testing-library/vue`、`happy-dom` 或现有 jsdom；服务端契约测试继续使用 Vitest。
- 生产：Nitro Node server，systemd 管理，监听 `127.0.0.1:63456`。

### 2.2 分层

```text
Browser
  -> Nuxt pages/layouts/components (Vue + Element Plus)
  -> 原 URL 的 HTTP 请求
  -> server/middleware/00-route-dispatcher.ts
  -> server/http/route-registry.ts（显式 method + URLPattern）
  -> server/http/dispatcher.ts（H3 <-> Web Request/Response 边界）
  -> server/context/request-context.ts（AsyncLocalStorage）
  -> server/handlers/**（标准 Request/Response handler）
  -> lib/**（认证、业务、Prisma、scheduler、通知等框架无关逻辑）
```

### 2.3 Cookie/context/dispatcher 决策

- `server/context/request-context.ts` 创建 `AsyncLocalStorage<RequestContext>`；context 至少包含当前 `Request`、解析后的请求 Cookie、待写入的多值 `Set-Cookie`。每次 dispatcher 调用均以 `run(context, ...)` 隔离，禁止全局可变 Cookie 容器。
- `lib/http/cookies.ts` 暴露框架无关的 `getRequestCookie`、`setResponseCookie`、`deleteResponseCookie`；`lib/session.ts`、`lib/auth.ts`、`lib/webauthn-cookie.ts` 不再导入 `next/headers` 或 `next/server`。
- dispatcher 只处理 registry 命中的 method/path，其他请求必须 `return` 给 Nuxt 页面/静态资源；动态参数须 decode 一次并以 `{ params }` 传给 handler。
- 将 H3 event 转为标准 `Request` 时保留 method、绝对 URL、重复 query、headers 和流式 body；将标准 `Response` 写回 H3 时保留 status、statusText、headers、二进制/流式 body，并追加 context 中所有 `Set-Cookie`，不能错误地用逗号合并 Cookie。
- handler 签名统一为：

```ts
export type RouteHandler = (
  request: Request,
  context: { params: Record<string, string> },
) => Response | Promise<Response>;
```

### 2.4 迁移期目录策略

- Phase 1–8 在 `nuxt.config.ts` 使用 `srcDir: "nuxt-app"`，避免与现有 Next `app/` 冲突；旧服务照常从 `.next` 运行。
- Phase 9 删除旧 Next `app/` 后，将 `nuxt-app/` 原子移动为根 `app/`，移除 `srcDir`。最终目录遵循 Nuxt 4：`app/pages`、`app/layouts`、`app/components`、`app/composables`、`app/middleware`、`app/assets`。
- 服务端从第一天放在根 `server/`，共享业务继续放根 `lib/`；Prisma、scripts 和现有数据库文件不搬动。

---

## 3. 全局执行规则与 subagent 边界

1. 每个 subagent 开始前只读取其任务列出的源文件、相关测试和依赖；结束时报告 RED/GREEN 命令及输出摘要。
2. RED 必须先失败且失败原因是缺少待实现能力；若意外通过，应增强测试而不是直接实现。GREEN 只跑最小集合，通过后再跑阶段回归。
3. 共享热点文件仅由阶段 owner 修改：`package.json`/lockfile（Phase 1 和 Phase 9 owner）、`nuxt.config.ts`（Phase 1/9 owner）、`server/http/route-registry.ts`（Phase 2/3 owner）、导航（Phase 4 owner）。页面 subagent 不修改这些文件。
4. 页面 subagent 只拥有指定 `app/pages/**`、`app/components/<module>/**`、`tests/components/<module>/**`；后端 subagent 只拥有指定 handler/context 文件。
5. 禁止执行或建议执行 `npm run db:reset`、`prisma migrate reset`、`prisma db push --force-reset`、生产 seed、`rm dev.db`。若测试需要数据库，使用隔离临时库/transaction rollback，且先断言 URL 不是生产 URL。
6. 不运行会打印环境的命令（如 `env`、`printenv`、`systemctl show --all`），不 `cat .env*`，不把 Cookie/Authorization/API key/AI key/R2/SMTP secret 放入 fixture、截图、日志或 commit。日志断言只检查字段名/掩码。
7. 不在新构建验收前 stop/restart 当前 `reminder-app.service`；旁路服务必须使用 `63457`，且 scheduler、Telegram polling 和通知 worker默认关闭，防止双发。
8. 本计划的实施可按任务提交，但本计划文件创建阶段本身 **不 commit**；任何实施提交都不得包含数据库文件、`.env*`、构建产物或凭据。

---

## 4. Phase 0：冻结契约与安全基线

### Task 0.1：建立路由、页面和响应契约清单

**新增：**
- `tests/contracts/route-manifest.test.ts`
- `tests/contracts/page-url-manifest.test.ts`
- `tests/fixtures/contracts/route-manifest.json`
- `tests/fixtures/contracts/page-urls.json`

**读取但不修改：** `app/**/route.ts`、`app/**/page.tsx`、`app/**/layout.tsx`。

路由 fixture 必须记录 69 个路径模板和 101 个 method；页面 fixture 必须记录：`/`、`/auth`、`/invite/:token`、`/account`、`/members`、`/settings`、`/images`、`/medicines`、`/medicines/:id`、`/ssl`、`/voice`、`/bot`、`/reminders`、`/reminders/new`、`/reminders/:id/edit`、`/todos`、`/push-ledger`、`/notification-center`、`/license-key` 以及 protected 首页实际映射。

**RED：**
```bash
npm test -- tests/contracts/route-manifest.test.ts tests/contracts/page-url-manifest.test.ts
```
预期：fixture/manifest helper 尚不存在而失败。

**GREEN：**
```bash
npm test -- tests/contracts/route-manifest.test.ts tests/contracts/page-url-manifest.test.ts
```
预期：精确断言 `69 routes / 101 handlers / 20 page.tsx sources`，且无 path+method 重复。

### Task 0.2：录制 API 黑盒兼容基线

**新增：**
- `tests/contracts/api-contract.test.ts`
- `tests/contracts/cookie-contract.test.ts`
- `tests/contracts/error-contract.test.ts`
- `tests/helpers/redacted-http.ts`

只记录 schema、状态码、header 名和 Cookie 属性，敏感值统一替换为 `<redacted>`；不得把真实响应 token、key、Cookie 值写入 fixture。至少覆盖 200/201/204、400/401/403/404/409/429、JSON、文件/图片、OpenAPI 和 WebAuthn options。

**RED：**
```bash
npm test -- tests/contracts/api-contract.test.ts tests/contracts/cookie-contract.test.ts tests/contracts/error-contract.test.ts
```

**GREEN：**
```bash
npm test -- tests/contracts tests/lib/auth-commit-consistency.test.ts tests/lib/login-security.test.ts
```

### Task 0.3：生产数据只读基线与禁重置护栏

**新增：**
- `scripts/verify-migration-safety.ts`
- `tests/lib/migration-safety.test.ts`

脚本只允许读取：数据库 provider、migration 状态摘要、关键表计数和最新记录时间；输出不得含连接串、主机密码、记录正文或用户凭据。保存上线前后比对摘要到受限运维目录而非 git。若检测到 production URL，任何 reset/seed 标志必须立即退出非零。

**RED：**
```bash
npm test -- tests/lib/migration-safety.test.ts
```

**GREEN：**
```bash
npm test -- tests/lib/migration-safety.test.ts
npx tsx scripts/verify-migration-safety.ts --mode=read-only
```

---

## 5. Phase 1：Nuxt/Vue/Element Plus 基座（仍保留 Next）

### Task 1.1：安装并锁定迁移期依赖

**修改：** `package.json`、`package-lock.json`、`tsconfig.json`、`vitest.config.ts`、`eslint.config.mjs`。  
**新增：** `nuxt.config.ts`、`app.config.ts`（若 Nuxt 配置需要）、`tests/setup-vue.ts`。

- 精确固定 `nuxt@4.2.2`、`element-plus@2.14.3`；加入 `vue`、`@element-plus/icons-vue`、`@vue/test-utils`、`@testing-library/vue`、Vue Vite 插件。
- 迁移期保留 Next/React 依赖和 React test include；增加 Vue `.test.ts` 与 `.vue` 支持。
- 增加 scripts：`dev:nuxt`、`build:nuxt`、`preview:nuxt`、`typecheck`；此阶段 `start` 和生产 service 仍指向 Next。
- `nuxt.config.ts` 设置 `srcDir: "nuxt-app"`、SSR 开启、Nitro Node preset、运行时 host/port 由环境提供；任何 secret 只能在 server runtime config，禁止进入 `runtimeConfig.public`。

**RED：**
```bash
npm test -- tests/config/nuxt-config.test.ts
npm run typecheck
```

**GREEN：**
```bash
npm install
npm test -- tests/config/nuxt-config.test.ts
npm run typecheck
```

### Task 1.2：基础 app、Element Plus 插件与全局样式

**新增：**
- `nuxt-app/app.vue`
- `nuxt-app/plugins/element-plus.ts`
- `nuxt-app/assets/css/main.css`
- `nuxt-app/error.vue`
- `tests/components/app-bootstrap.test.ts`

Element Plus 必须按 Nuxt SSR 方式注册，避免 hydration mismatch；主题变量放 `main.css`，支持桌面/移动、focus-visible、reduced motion。`error.vue` 不显示堆栈、请求头或 secret。

**RED：**
```bash
npm test -- tests/components/app-bootstrap.test.ts
```

**GREEN：**
```bash
npm test -- tests/components/app-bootstrap.test.ts
npm run build:nuxt
```

---

## 6. Phase 2：标准 Request/Response dispatcher、Cookie context 与 registry

### Task 2.1：AsyncLocalStorage 请求上下文

**新增：**
- `server/context/request-context.ts`
- `lib/http/cookies.ts`
- `tests/server/request-context.test.ts`
- `tests/server/cookies.test.ts`

测试必须并发运行两个请求，证明 Cookie 不串请求；覆盖同名覆盖、delete、多个 `Set-Cookie`、Path/HttpOnly/SameSite/Secure/Max-Age。

**RED：**
```bash
npm test -- tests/server/request-context.test.ts tests/server/cookies.test.ts
```

**GREEN：**
```bash
npm test -- tests/server/request-context.test.ts tests/server/cookies.test.ts
```

### Task 2.2：H3/Web 边界 dispatcher

**新增：**
- `server/http/types.ts`
- `server/http/dispatcher.ts`
- `server/middleware/00-route-dispatcher.ts`
- `tests/server/dispatcher.test.ts`

覆盖 JSON、空 body、multipart、二进制下载、stream、重复 query/header、动态参数、404 fall-through、method mismatch、handler exception 和多 Cookie。异常沿用现有 `lib/api-error.ts` 映射，不泄露 stack/secret。

**RED：**
```bash
npm test -- tests/server/dispatcher.test.ts
```

**GREEN：**
```bash
npm test -- tests/server/dispatcher.test.ts tests/lib/api-error.test.ts
```

### Task 2.3：显式 route registry

**新增：**
- `server/http/route-registry.ts`
- `server/http/compile-route.ts`
- `tests/server/route-registry.test.ts`

registry 禁止文件系统运行时扫描，按静态 import 显式注册。必须覆盖以下组：

- 公共：`GET /.well-known/ai-plugin.json`；`POST /notify`；`GET|POST /channels`、`/groups`、`/templates`；`GET /notifications`、`GET /notifications/:id`；`GET /queue/jobs`、`POST /queue/retry/:job_id`、`POST /cancel/:id`。
- 认证/邀请：`/api/auth/status`、`logout`、OTP login/setup/verify-setup、Passkey login/register/list/delete/verify、trusted devices/restore、`/api/invite/:token/**`。
- 业务：reminders、todos、medicines/attachments、attachments、images、upload、voice。
- 管理：members/invitations、license/store accounts/payment QR、settings/OTP/R2/bot/email、SSL、scheduler status。
- 通知中心：api-keys、channels、groups、group routes、templates、dispatch、push-ledger。
- 元数据：`GET /api/openapi.json`。

**RED：**
```bash
npm test -- tests/server/route-registry.test.ts tests/contracts/route-manifest.test.ts
```

**GREEN：**
```bash
npm test -- tests/server/route-registry.test.ts tests/contracts/route-manifest.test.ts
```
预期：registry 与 frozen fixture 双向相等，仍为 69/101。

---

## 7. Phase 3：迁移全部后端 handler 与框架耦合 lib

### Task 3.1：认证基础库去 Next 化

**修改：** `lib/session.ts`、`lib/auth.ts`、`lib/webauthn-cookie.ts`、`lib/webauthn.ts`、`lib/webauthn-ceremonies.ts`、`lib/trusted-device.ts`、`lib/member-api-auth.ts`、`lib/admin-api.ts`、`lib/ai-openapi.ts`（仅在确有 Next import 时）。  
**新增/迁移：** `server/handlers/api/auth/**`、`server/handlers/api/invite/**`。

- 用 `lib/http/cookies.ts` 替代 `next/headers`；用标准 Request 获取 IP/User-Agent。
- Cookie 名称与属性逐字兼容；WebAuthn RP ID、expected origin、challenge 消费、counter CAS、rate limit 不变。
- 登录创建 DB session 与发 Cookie 的提交顺序必须保持现有一致性；失败不得留下半成品 session。

**RED：**
```bash
npm test -- tests/contracts/cookie-contract.test.ts tests/lib/auth-commit-consistency.test.ts tests/lib/webauthn-ceremonies.test.ts tests/lib/login-security.test.ts
```

**GREEN：**
```bash
npm test -- tests/lib/session-actor.test.ts tests/lib/multi-user-auth.test.ts tests/lib/passkey-registration-auth.test.ts tests/lib/passkey-factor-deletion.test.ts tests/lib/passkey-anonymous-rate-limit.test.ts tests/lib/webauthn-counter.test.ts tests/lib/invitation-passkey.test.ts tests/lib/invitation-acceptance.test.ts tests/contracts/cookie-contract.test.ts
```

### Task 3.2：核心业务 API handlers

**新增：**
- `server/handlers/api/reminders/**`
- `server/handlers/api/todos/**`
- `server/handlers/api/medicines/**`
- `server/handlers/api/attachments/**`
- `server/handlers/api/images/**`
- `server/handlers/api/upload.ts`
- `server/handlers/api/voice/**`

从对应 `app/api/**/route.ts` 搬迁并改标准签名；不改 store/validator 业务规则。文件接口必须保持 MIME、Content-Disposition、大小限制和鉴权。

**RED：**
```bash
npm test -- tests/contracts/api-contract.test.ts tests/server/core-handlers.test.ts
```

**GREEN：**
```bash
npm test -- tests/server/core-handlers.test.ts tests/lib/reminders-store.test.ts tests/lib/reminder-complete.test.ts tests/lib/reminder-delete.test.ts tests/lib/reminder-restore-route.test.ts tests/lib/medicines.test.ts tests/lib/r2-cleanup.test.ts
```

### Task 3.3：管理、设置、通知与外部兼容 handlers

**新增：**
- `server/handlers/api/admin/**`
- `server/handlers/api/license/**`
- `server/handlers/api/settings/**`
- `server/handlers/api/ssl.ts`
- `server/handlers/api/scheduler/status.ts`
- `server/handlers/api/notification-center/**`
- `server/handlers/api/push-ledger.ts`
- `server/handlers/external/**`
- `server/handlers/well-known/ai-plugin.ts`
- `server/handlers/api/openapi.ts`

外部兼容组必须保持非 `/api` URL。AI/OpenAPI 输出不得包含真实 key；设置接口继续执行现有脱敏，不得因 Vue 需要而返回 secret。scheduler 初始化只能在单一生产进程启用，测试/旁路实例禁用。

**RED：**
```bash
npm test -- tests/server/admin-handlers.test.ts tests/server/external-handlers.test.ts tests/contracts/api-contract.test.ts
```

**GREEN：**
```bash
npm test -- tests/server/admin-handlers.test.ts tests/server/external-handlers.test.ts tests/lib/admin-member-routes.test.ts tests/lib/license-store-atomic-routes.test.ts tests/lib/license-store-route-security.test.ts tests/lib/notification-routing.test.ts tests/lib/ai-api-auth.test.ts tests/lib/ai-openapi.test.ts
```

### Task 3.4：全后端差分回归

在隔离测试环境向 Next baseline 与 Nuxt candidate 发送相同的无敏感 fixture，比较 status、content-type、body schema 和 Cookie 属性；写操作必须使用临时数据库并回滚，不允许连接生产库。

**命令：**
```bash
npm test -- tests/contracts tests/server tests/lib
npm run build:nuxt
```

通过门槛：所有 registry entry 至少有 method/path/status 覆盖；认证和外部 API 必须有成功与失败覆盖。

---

## 8. Phase 4：Nuxt 基础布局、Element Plus 导航与页面守卫

### Task 4.1：应用 Shell 与响应式导航

**源：** `components/layout/app-shell.tsx`、`top-nav.tsx`、`side-nav.tsx`、`mobile-nav.tsx`、`lib/navigation.ts`。  
**新增：**
- `nuxt-app/layouts/default.vue`
- `nuxt-app/layouts/public.vue`
- `nuxt-app/components/layout/AppShell.vue`
- `nuxt-app/components/layout/TopNav.vue`
- `nuxt-app/components/layout/SideNav.vue`
- `nuxt-app/components/layout/MobileNav.vue`
- `nuxt-app/composables/useNavigation.ts`
- `tests/components/layout.test.ts`

使用 `ElContainer/ElAside/ElHeader/ElMain/ElMenu/ElDrawer`；保留现有 URL、角色可见性、当前项、移动端菜单、登出入口。禁止只靠隐藏菜单实现授权。

**RED：**
```bash
npm test -- tests/components/layout.test.ts tests/lib/role-authorization-ui.test.ts
```

**GREEN：**
```bash
npm test -- tests/components/layout.test.ts tests/lib/role-authorization-ui.test.ts
```

### Task 4.2：认证 middleware 与请求 composable

**新增：**
- `nuxt-app/middleware/auth.ts`
- `nuxt-app/middleware/guest.ts`
- `nuxt-app/composables/useAuth.ts`
- `nuxt-app/composables/useApi.ts`
- `nuxt-app/types/api.ts`
- `tests/components/auth-middleware.test.ts`

SSR 和 client navigation 都调用现有 `/api/auth/status`；未登录访问 protected URL 跳 `/auth` 并安全保存相对 return URL；已登录访问 `/auth` 回首页。`useApi` 默认 same-origin、携带 Cookie、统一解析现有错误 envelope，不记录 body/headers。

**RED/GREEN：**
```bash
npm test -- tests/components/auth-middleware.test.ts
```
先在文件不存在/行为缺失时确认 RED，实现后同命令 GREEN。

---

## 9. Phase 5：认证与账户页面

### Task 5.1：登录页（OTP、Passkey、可信设备）

**源：** `app/auth/page.tsx`、`components/auth/auth-entry.tsx`、`otp-login-form.tsx`、`passkey-login.tsx`。  
**新增：**
- `nuxt-app/pages/auth.vue`
- `nuxt-app/components/auth/AuthEntry.vue`
- `nuxt-app/components/auth/OtpLoginForm.vue`
- `nuxt-app/components/auth/PasskeyLogin.vue`
- `tests/components/auth-login.test.ts`

使用 Element Plus form/tabs/alert；WebAuthn 仍调用 `@simplewebauthn/browser` 且仅在 client 执行。保持 429、无账号泄露错误和 return URL 防开放重定向。

**RED/GREEN：**
```bash
npm test -- tests/components/auth-login.test.ts tests/lib/login-security.test.ts
```

### Task 5.2：邀请注册

**源：** `app/invite/[token]/page.tsx`、`components/auth/invitation-enrollment.tsx`。  
**新增：** `nuxt-app/pages/invite/[token].vue`、`nuxt-app/components/auth/InvitationEnrollment.vue`、`tests/components/invitation-enrollment.test.ts`。

覆盖 token 失效、TOTP setup/verify、Passkey options/verify、成功跳转；URL 中 token 不写日志/analytics。

**RED/GREEN：**
```bash
npm test -- tests/components/invitation-enrollment.test.ts tests/lib/invitation-acceptance.test.ts
```

### Task 5.3：账户安全

**源：** `app/(protected)/account/page.tsx`、`components/auth/passkey-register.tsx`、`otp-setup-card.tsx`、`components/settings/otp-reset-card.tsx`、`trusted-devices-card.tsx`、`passkey-manager.tsx`。  
**新增：**
- `nuxt-app/pages/account.vue`
- `nuxt-app/components/account/PasskeyManager.vue`
- `nuxt-app/components/account/PasskeyRegister.vue`
- `nuxt-app/components/account/OtpSetupCard.vue`
- `nuxt-app/components/account/OtpResetCard.vue`
- `nuxt-app/components/account/TrustedDevicesCard.vue`
- `tests/components/account-security.test.ts`

删除凭证/重置 OTP 使用 `ElMessageBox`，保留禁止删除最后 factor、自操作保护和近期认证规则。

**RED/GREEN：**
```bash
npm test -- tests/components/account-security.test.ts tests/lib/passkey-factor-deletion.test.ts tests/lib/self-security.test.ts
```
若仓库没有最后一个测试文件，新增 `tests/lib/self-security.test.ts` 后先见 RED。

---

## 10. Phase 6：业务页面按模块迁移

每个模块由独立 subagent 执行；只改其目录。通用验收：加载、空态、错误态、权限态、移动端、键盘操作、危险操作确认、原 URL 刷新。

### Task 6.1：首页与待办

**源：** `app/(protected)/page.tsx`、`app/(protected)/todos/page.tsx`、`components/todos/todo-list.tsx`。  
**新增：** `nuxt-app/pages/index.vue`、`nuxt-app/pages/todos.vue`、`nuxt-app/components/todos/TodoList.vue`、`tests/components/todos-vue.test.ts`。

**RED/GREEN：**
```bash
npm test -- tests/components/todos-vue.test.ts
```

### Task 6.2：提醒

**源：** `app/(protected)/reminders/**` 与 `components/reminders/*.tsx`。  
**新增：**
- `nuxt-app/pages/reminders/index.vue`
- `nuxt-app/pages/reminders/new.vue`
- `nuxt-app/pages/reminders/[id]/edit.vue`
- `nuxt-app/components/reminders/{RemindersDashboard,ReminderRow,ReminderStats,ReminderFilters,ReminderList,ReminderForm,DeletedReminderList}.vue`
- `tests/components/reminders-vue.test.ts`

保留筛选 query、重复规则、完成/删除/恢复、已删历史和编辑 URL。Element Plus date/time 控件必须显式处理时区与序列化，不能改变现有日期含义。

**RED：**
```bash
npm test -- tests/components/reminders-vue.test.ts
```
**GREEN：**
```bash
npm test -- tests/components/reminders-vue.test.ts tests/lib/reminder-validator.test.ts tests/lib/reminder-recurrence.test.ts tests/lib/completed-reminder-history.test.ts tests/lib/deleted-reminder-history.test.ts
```

### Task 6.3：药品与附件

**源：** `app/(protected)/medicines/**`、`components/medicines/*.tsx`。  
**新增：** `nuxt-app/pages/medicines/index.vue`、`nuxt-app/pages/medicines/[id].vue`、`nuxt-app/components/medicines/MedicineDashboard.vue`、`MedicineDetail.vue`、`tests/components/medicines-vue.test.ts`。

保留药品提醒同步、附件上传/删除/预览与访问权限。

**RED/GREEN：**
```bash
npm test -- tests/components/medicines-vue.test.ts tests/lib/medicines.test.ts tests/lib/medicine-reminder-sync.test.ts
```

### Task 6.4：图片、上传和文件预览

**源：** `app/(protected)/images/page.tsx`、`components/images/*.tsx`、`components/ui/file-upload.tsx`。  
**新增：** `nuxt-app/pages/images.vue`、`nuxt-app/components/images/ImageGallery.vue`、`ImageUploader.vue`、`nuxt-app/components/ui/FileUpload.vue`、`tests/components/file-preview-vue.test.ts`。

保持 accept/大小限制、object URL 回收、R2 清理和图片删除确认。

**RED/GREEN：**
```bash
npm test -- tests/components/file-preview-vue.test.ts tests/lib/r2-cleanup.test.ts
```

### Task 6.5：语音

**源：** `app/(protected)/voice/page.tsx`、`components/voice/voice-converter.tsx`。  
**新增：** `nuxt-app/pages/voice.vue`、`nuxt-app/components/voice/VoiceConverter.vue`、`tests/components/voice-converter.test.ts`。

保持 TTS/transcription MIME、下载文件名、loading/cancel/error 行为。

**RED/GREEN：**
```bash
npm test -- tests/components/voice-converter.test.ts tests/server/core-handlers.test.ts
```

### Task 6.6：License Key 与店铺账号

**源：** `app/(protected)/license-key/**`、`components/license-key/*.tsx`。  
**新增：** `nuxt-app/pages/license-key.vue`、`nuxt-app/components/license-key/LicenseKeyForm.vue`、`LicenseStoreAccountTable.vue`、`PaymentQrManager.vue`、`tests/components/license-key-vue.test.ts`。

凭据字段默认遮罩且永不出现在 DOM 快照/日志；保留 payment QR 与原子更新语义。

**RED/GREEN：**
```bash
npm test -- tests/components/license-key-vue.test.ts tests/lib/license-store-atomic-routes.test.ts tests/lib/license-store-route-security.test.ts
```

---

## 11. Phase 7：通知与运维页面

### Task 7.1：通知中心与 Push Ledger

**源：** `app/(protected)/notification-center/**`、`app/(protected)/push-ledger/**`、`components/notification-center/*.tsx`。  
**新增：**
- `nuxt-app/pages/notification-center.vue`
- `nuxt-app/pages/push-ledger.vue`
- `nuxt-app/components/notification-center/NotificationDashboard.vue`
- `nuxt-app/components/notification-center/PushLedgerDashboard.vue`
- `tests/components/notification-center-vue.test.ts`

覆盖 channels/groups/routes/templates/API keys/dispatch/ledger；API key 仅创建时显示一次，列表与测试快照不得包含明文；重试保持幂等。

**RED/GREEN：**
```bash
npm test -- tests/components/notification-center-vue.test.ts tests/lib/notification-routing.test.ts tests/lib/notify-scopes.test.ts
```

### Task 7.2：成员管理

**源：** `app/(protected)/members/**`、`components/members/member-management.tsx`。  
**新增：** `nuxt-app/pages/members.vue`、`nuxt-app/components/members/MemberManagement.vue`、`tests/components/members-vue.test.ts`。

保留 ADMIN/MEMBER UI 权限、邀请、修改、撤权和自锁保护；403 不能只依赖前端。

**RED/GREEN：**
```bash
npm test -- tests/components/members-vue.test.ts tests/lib/member-management.test.ts tests/lib/admin-member-routes.test.ts tests/lib/role-authorization-ui.test.ts
```

### Task 7.3：设置、Bot、R2 与邮件测试

**源：** `app/(protected)/settings/**`、`app/(protected)/bot/**`、`components/settings/*.tsx`。  
**新增：**
- `nuxt-app/pages/settings.vue`
- `nuxt-app/pages/bot.vue`
- `nuxt-app/components/settings/SettingsForm.vue`
- `nuxt-app/components/settings/BotSettingsCard.vue`
- `nuxt-app/components/settings/R2SettingsCard.vue`
- `tests/components/settings-vue.test.ts`

secret 输入只允许“留空即不改”或专用替换流程；GET 不回显完整 secret，成功提示不拼接值。Telegram binding 与测试邮件行为不变。

**RED/GREEN：**
```bash
npm test -- tests/components/settings-vue.test.ts tests/lib/settings-validator.test.ts tests/lib/bootstrap-settings.test.ts tests/lib/telegram-bot.test.ts tests/lib/test-mail.test.ts
```

### Task 7.4：SSL 与 scheduler 运维状态

**源：** `app/(protected)/ssl/**`、`lib/ssl-reminder.ts`、`lib/scheduler.ts`、`lib/scheduler-init.ts`。  
**新增：** `nuxt-app/pages/ssl.vue`、`nuxt-app/components/operations/SslStatus.vue`、`SchedulerStatus.vue`、`tests/components/operations-vue.test.ts`。

页面呈现 SSL 检查和 scheduler status，不新增可泄露内部路径/凭据的字段。Nitro 启动插件只在 `NODE_ENV=production` 且显式 worker 开关开启时初始化一次：

**新增：** `server/plugins/scheduler.ts`、`tests/server/scheduler-plugin.test.ts`。

旁路端口运行必须设置 scheduler/Telegram/notification worker disabled，避免与旧 Next 进程重复派发。

**RED：**
```bash
npm test -- tests/components/operations-vue.test.ts tests/server/scheduler-plugin.test.ts
```
**GREEN：**
```bash
npm test -- tests/components/operations-vue.test.ts tests/server/scheduler-plugin.test.ts tests/lib/reminder-notifications.test.ts tests/lib/ssl-reminder.test.ts
```
若对应 lib 测试尚不存在，先补测试并观察 RED。

---

## 12. Phase 8：端到端兼容、构建与旁路验收

### Task 8.1：浏览器 E2E

**新增：** `playwright.config.ts`、`tests/e2e/auth.spec.ts`、`navigation.spec.ts`、`reminders.spec.ts`、`operations.spec.ts`、`accessibility.spec.ts`。

使用专用临时测试库和假外部服务，不访问生产数据，不使用真实 AI/R2/SMTP/Telegram key。覆盖登录、Passkey mock、邀请、角色导航、提醒 CRUD/恢复、上传、设置脱敏、移动端和直接 URL 刷新。

**RED：**
```bash
npx playwright test
```
**GREEN：**
```bash
npx playwright test
```

### Task 8.2：全量质量门

```bash
npm run lint
npm run typecheck
npm test
npm run build:nuxt
```

检查 `.output` 中不含已知 secret 字面量（只允许用受控脚本读取 secret 的哈希，不得把 secret 作为命令行参数或输出）：

**新增：** `scripts/scan-build-secrets.ts`、`tests/lib/build-secret-scan.test.ts`。

```bash
npm test -- tests/lib/build-secret-scan.test.ts
npx tsx scripts/scan-build-secrets.ts .output
```

### Task 8.3：旁路启动（旧服务必须保持运行）

旧 Next 继续监听 `63456`，不得 stop/restart。新 Nuxt 使用 `63457`，所有会产生副作用的后台 worker 关闭：

```bash
HOST=127.0.0.1 PORT=63457 NITRO_HOST=127.0.0.1 NITRO_PORT=63457 \
  REMINDER_SCHEDULER_ENABLED=false TELEGRAM_BOT_ENABLED=false NOTIFICATION_WORKER_ENABLED=false \
  node .output/server/index.mjs
```

在另一个 shell 执行不含凭据的 smoke：

```bash
curl --fail --silent --show-error http://127.0.0.1:63457/api/auth/status >/dev/null
curl --fail --silent --show-error http://127.0.0.1:63457/api/openapi.json >/dev/null
curl --fail --silent --show-error http://127.0.0.1:63457/auth >/dev/null
```

随后运行 `BASE_URL=http://127.0.0.1:63457 npm run test:smoke`。日志只按状态码、request-id 检查，不打印 Authorization/Cookie/body。旁路验收未全绿时，停止 63457 candidate 即可，63456 旧服务不受影响。

---

## 13. Phase 9：移除 React/Next，Nuxt 归根目录

> 只有 Phase 8 全绿并保留可启动的 Next rollback release 后才能开始。

### Task 9.1：准备不可变 rollback release

- 记录当前已运行 Next 版本的 git SHA、lockfile checksum、systemd `ExecStart`/`WorkingDirectory` 和健康检查结果；不得记录环境值。
- 在 `/home/ubuntu/apps/reminder-app-releases/next-<sha>/` 保留可独立启动的 Next 源码、`.next` 和匹配依赖，权限仅给部署用户；凭据仍通过现有受限 systemd 环境注入，**不得复制 `.env` 到 release、不得把 secret 打包**。
- rollback release 必须指向同一生产数据库配置且只作回滚，不执行 migration/reset/seed。切换前在非生产端口证明该 release 可启动。

### Task 9.2：删除 React/Next 代码并移动 Nuxt app

**删除：**
- 旧 `app/` 中全部 Next `page.tsx`、`layout.tsx`、`route.ts`、Next metadata/favicon glue。
- 根 `components/**/*.tsx`（Vue 替代已完整存在后）。
- React 专属测试 `tests/components/**/*.test.tsx`（已有 Vue 等价测试后）。
- `next.config.ts`、`next-env.d.ts`、`postcss.config.mjs`（若仅为旧 Next/Tailwind 使用）。

**移动：** `nuxt-app/**` -> `app/**`。  
**修改：** `nuxt.config.ts` 删除 `srcDir`；`tsconfig.json` 使用 Nuxt 生成配置；`vitest.config.ts` 删除 React plugin；`eslint.config.mjs` 删除 Next/React 配置；`package.json`/`package-lock.json` 删除 `next`、`react`、`react-dom`、`@radix-ui/react-alert-dialog`、`lucide-react`、`@testing-library/react`、`@types/react*`、`@vitejs/plugin-react` 及其他确认无引用的 React/Tailwind-only 依赖。scripts 的 `dev/build/start` 切到 Nuxt/Nitro。

**RED：**
```bash
npm test -- tests/config/no-react-next.test.ts
```
预期：旧依赖/文件/import 仍存在。

**GREEN：**
```bash
npm install
npm test -- tests/config/no-react-next.test.ts
npm run lint && npm run typecheck && npm test && npm run build
```

`tests/config/no-react-next.test.ts` 必须扫描源码而非 `node_modules`/rollback release/build cache，并断言：无 `.tsx`、无 JSX、无 `from "next`、无 `from "react`、无 React 专属 dependency；`npm ls next react react-dom` 应确认它们不再是项目直接/运行依赖（若为工具的 optional/transitive 依赖，记录来源且不得进入 app bundle）。

### Task 9.3：最终 URL/route/build 复验

```bash
npm test -- tests/contracts/route-manifest.test.ts tests/contracts/page-url-manifest.test.ts tests/server/route-registry.test.ts
npm run build
HOST=127.0.0.1 PORT=63457 NITRO_HOST=127.0.0.1 NITRO_PORT=63457 \
  REMINDER_SCHEDULER_ENABLED=false TELEGRAM_BOT_ENABLED=false NOTIFICATION_WORKER_ENABLED=false \
  node .output/server/index.mjs
BASE_URL=http://127.0.0.1:63457 npm run test:smoke
```

旧 63456 服务在这一任务结束前仍保持运行。

---

## 14. Phase 10：systemd 切换、验证与回滚

### Task 10.1：修改 unit 与 unit 测试

**修改：** `scripts/reminder-app.service`、`tests/lib/systemd-service.test.ts`。  
**建议最终关键项：**

```ini
Description=Reminder App Nuxt/Nitro
WorkingDirectory=/home/ubuntu/apps/reminder-app
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=63456
Environment=NITRO_HOST=127.0.0.1
Environment=NITRO_PORT=63456
ExecStart=/usr/bin/node /home/ubuntu/apps/reminder-app/.output/server/index.mjs
SuccessExitStatus=143 SIGTERM
```

保留现有 `After/Wants`、IPv4 `NODE_OPTIONS`、User、Restart 策略和受限环境注入；不要把 secret 直接新增到 unit 文件。

**RED：**
```bash
npm test -- tests/lib/systemd-service.test.ts
```
预期：仍断言 Next ExecStart 或缺 Nitro 断言而失败。

**GREEN：**
```bash
npm test -- tests/lib/systemd-service.test.ts
sudo systemd-analyze verify /home/ubuntu/apps/reminder-app/scripts/reminder-app.service
```

测试必须断言端口 63456、loopback、Nitro ExecStart、SIGTERM 成功状态、没有 `next start`，并断言 unit 文本不含常见 secret 变量的值。

### Task 10.2：原子切换

切换前最后门禁：

```bash
npm run lint && npm run typecheck && npm test && npm run build
npx tsx scripts/verify-migration-safety.ts --mode=read-only
BASE_URL=http://127.0.0.1:63457 npm run test:smoke
```

只有全部通过才允许：

1. 安装已验证 unit 到 `/etc/systemd/system/reminder-app.service`（先把旧 unit 备份到受限 rollback 目录，内容中不得新增凭据）。
2. `sudo systemctl daemon-reload`。
3. `sudo systemctl restart reminder-app.service`。这是首次停止旧 Next 进程；停旧与启新应在同一次 restart 中完成。
4. 用 `systemctl is-active reminder-app.service`、`ss` 仅检查 `127.0.0.1:63456`，然后执行 smoke。
5. 确认 scheduler/Telegram/notification worker 各只有一个 owner，无重复派发。

不要用会展示全部 Environment 的命令；`journalctl` 检查时不得复制含 Cookie/token/body 的行。

### Task 10.3：切换后验收

```bash
curl --fail --silent --show-error http://127.0.0.1:63456/api/auth/status >/dev/null
curl --fail --silent --show-error http://127.0.0.1:63456/api/openapi.json >/dev/null
BASE_URL=http://127.0.0.1:63456 npm run test:smoke
npx tsx scripts/verify-migration-safety.ts --mode=read-only
```

人工验收：OTP 登录、测试 Passkey、可信设备列表、提醒列表/创建后删除测试记录、图片只读打开、通知 ledger、成员权限、设置脱敏、SSL/scheduler 状态。涉及生产写入只创建明确标记的最小 smoke 记录并立即通过正常 API 删除，禁止直接 SQL 清理。

数据摘要应与切换前一致；允许的差异只能来自明确记录的 smoke 操作、session/审计/scheduler 正常写入。**绝不通过 reset 数据库解决差异。**

### Task 10.4：回滚触发条件与步骤

触发条件：服务无法启动、核心 API 状态码/响应不兼容、认证/Cookie/WebAuthn 失败、数据异常、scheduler/通知重复执行、错误率显著上升或发现 secret 泄露。

回滚步骤：

1. 立即停用 Nuxt unit 中会产生副作用的 worker；不要修改/回滚数据库，因为本迁移没有 schema/data migration。
2. 恢复 Phase 9.1 保存的旧 Next unit，使其 `ExecStart` 指向不可变 rollback release，端口仍为 63456；凭据继续由原受限机制注入。
3. `sudo systemctl daemon-reload && sudo systemctl restart reminder-app.service`。
4. 验证 old release health、认证、核心读取和唯一 scheduler owner。
5. 执行只读数据摘要并与切换前比对；保留 Nuxt 日志与构建供排查，但先做脱敏。
6. 未找到根因和新增回归测试前不得再次切换。

回滚过程中同样禁止 Prisma reset、DB reset、seed、删除数据库文件、还原数据库快照覆盖线上新数据；如果怀疑数据问题，先停止写入并由数据库负责人做增量审计。

---

## 15. 最终验证矩阵

- **框架：** Nuxt 4.2.2、Vue 3、Element Plus 2.14.3 精确锁定；React/Next 完全移除。
- **URL：** 20 个原页面来源对应 URL 全覆盖；69 route/101 handler 全覆盖。
- **HTTP：** method/path/query/body/status/header/content-type/download/stream/error envelope 兼容。
- **认证：** OTP、Passkey 登录与注册、邀请、trusted restore、logout、session revoke、角色权限全覆盖。
- **Cookie：** 名称、值格式、Path、SameSite、Secure、HttpOnly、Max-Age、多 Set-Cookie 与并发隔离全覆盖。
- **业务：** reminders/todos/medicines/attachments/images/voice/license 全覆盖。
- **运维：** members/settings/R2/bot/SMTP/SSL/scheduler/notification center/push ledger 全覆盖。
- **安全：** 无真实 credential fixture；client bundle、错误和日志无 AI/API/R2/SMTP/token/Cookie secret。
- **数据：** 无 schema reset、无 seed 覆盖；切换前后只读摘要一致。
- **部署：** 新构建先在 63457 旁路通过；旧 63456 一直运行至原子切换；Next rollback release 可启动。

## 16. 推荐实施顺序与并行关系

1. Phase 0 必须串行完成并冻结契约。
2. Phase 1 后，Phase 2 的 context/dispatcher 可与 Phase 4 的纯 UI shell 并行；registry owner 最后合并。
3. Phase 3 以认证、核心业务、管理/外部三组 subagent 并行，但 `route-registry.ts` 只由一个 integration owner 修改。
4. Phase 5–7 可按模块并行；每个 subagent 只拥有自身 Vue 页面/组件/测试。
5. Phase 8 必须在所有模块合并后串行执行。
6. Phase 9 删除旧代码只能由 cleanup owner 执行；不得让页面 subagent各自删除共享依赖。
7. Phase 10 只能由拥有 systemd 权限和回滚 release 的部署 owner 执行。

任何阶段 GREEN 失败都停在该阶段修复；不得用跳过测试、删除断言、重置数据库、泄露凭据或提前停旧服务来推进迁移。
