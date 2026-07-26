# Reminder App 多用户版本架构设计

> 状态：设计提案，尚未实施。实施前必须由产品负责人确认登录方式、注册策略、共享方式和历史数据归属。

## 1. 目标

将当前单管理员、单数据空间的 Reminder App 改造成安全的多用户应用，同时满足：

- 每个账号的数据默认完全隔离；
- 支持个人工作区，并为未来家庭/团队共享保留结构；
- 保留 OTP、Passkey、可信设备能力；
- 提醒、待办、药品、图片、附件、授权店铺、通知中心、Telegram 和 API Key 全链路隔离；
- 现有生产数据无损归入原管理员的历史工作区；
- 迁移期间旧生产功能可持续运行，可按阶段回滚；
- Web、调度器和通知 Worker 可独立扩展，避免重复通知。

## 2. 当前架构结论

当前系统不是“缺少 User 表”这么简单，而是全链路单用户：

- `AuthSession` 只表示是否登录，没有 `userId`、角色和工作区；
- OTP 存在全局 `AppSetting(id=1)`；
- Passkey 固定使用 `admin/管理员`，凭证没有用户归属；
- WebAuthn challenge 使用固定 ID，并发流程会相互覆盖；
- `TrustedDevice`、Telegram 绑定均无用户归属；
- 主要业务表没有 `workspace_id`；
- Supabase 运行时使用 service role，普通 RLS 不构成当前隔离边界；
- R2 对象使用全局 `files/...` 前缀并公开访问；
- 通知 API Key、通知队列、渠道、模板和台账均是全局数据；
- Next.js Web 进程同时运行提醒扫描、Telegram long polling 和通知派发。

因此，多用户版本必须同时改造身份、授权、数据、文件、通知和后台任务。

## 3. 已确认的上线前安全阻断项

这些问题不应等待多用户功能全部完成：

1. Passkey 注册 options 和 verify 路由当前没有会话校验，存在匿名注册凭证的风险；
2. R2 真实访问凭据存在于源码兜底配置中，必须轮换并从代码中删除；
3. R2 设置接口会向登录客户端返回完整 secret，并将 secret 明文保存；
4. Notification API Key 当前明文存储，并由管理接口完整返回；
5. WebAuthn challenge 是全局固定记录，存在并发覆盖和流程干扰；
6. OTP、Passkey、可信设备和敏感设置操作缺少统一的近期重新认证机制。

以上列为 Phase 0，必须先处理，再开放任何新用户入口。

## 4. 核心设计决策

### 4.1 使用“用户 + 工作区 + 成员关系”

即使 V1 只开放个人账号，也使用 Workspace 作为数据隔离边界：

- 每个新用户自动拥有一个 `personal` 工作区；
- V1 默认不开放跨用户共享，避免一次引入过多协作复杂度；
- 数据模型保留 Membership，后续可直接开放家庭/团队工作区；
- 所有业务数据以 `workspace_id` 隔离，`created_by` 只用于审计，不作为主要安全边界。

### 4.2 V1 采用平台邀请制注册

第一版不开放任意公网自助注册：

- 平台管理员创建开户邀请；
- V1 邀请只绑定邮箱和过期时间，不邀请用户加入他人的工作区；
- 邀请兑换后原子创建用户、该用户自己的 personal Workspace 和 owner Membership；
- 用户通过一次性邀请链接设置 Passkey/TOTP；
- 邀请 token 只保存哈希，单次使用并原子消费；
- 后续若需要公开注册，可在同一身份模型上增加注册审核、验证码和反滥用。

家庭/团队 Workspace 邀请是 V2 功能，届时使用单独的 `workspace_invitations`，不得复用开户邀请。这样 V1 的“用户彼此完全独立”与数据模型保持一致。

### 4.3 保留自建 Passkey/TOTP，但统一迁到 PostgreSQL 身份模型

推荐不在第一阶段更换现有登录产品形态，而是安全重构：

- 用户先由邮箱/登录名定位，再验证 TOTP；
- Passkey 凭证必须绑定 `user_id` 和稳定的 WebAuthn `userHandle`；
- discoverable Passkey 可实现无邮箱登录；
- Session、可信设备、challenge、恢复码统一放入 PostgreSQL；
- SQLite 认证库仅作为迁移源，切换成功后只读保留一段时间。

### 4.4 最终数据库访问不再使用 service role 作为普通 Web 请求角色

推荐最终形态：

- `migration_owner`：仅迁移任务使用；
- `reminder_app_runtime`：`NOBYPASSRLS`，Web 请求使用；
- `reminder_worker`：`NOBYPASSRLS`，后台 Worker 使用；
- 每个事务执行 `SET LOCAL app.user_id`、`SET LOCAL app.workspace_id`；
- RLS 从事务上下文读取当前用户和工作区；
- service role 仅保留给受控迁移或紧急运维，不进入普通业务调用链。

过渡期可继续使用 PostgREST Store，但所有 tenant-scoped Store 必须强制接收 WorkspaceContext；最终切换到直接 PostgreSQL 事务边界以获得可靠 RLS。

## 5. 身份与权限模型

### 5.1 users

- `id uuid primary key`
- `email_normalized text unique not null`
- `display_name text not null`
- `status active | invited | suspended | deleted`
- `platform_role none | admin`
- `security_version integer not null default 1`
- `email_verified_at timestamptz`
- `last_login_at timestamptz`
- `created_at / updated_at / deleted_at`

`platform_role` 仅用于平台运维，不等同于工作区 owner。

### 5.2 workspaces

- `id uuid primary key`
- `name text not null`
- `kind personal | household | team`
- `status active | suspended | deleted`
- `created_by uuid references users(id)`
- `created_at / updated_at / deleted_at`

### 5.3 workspace_memberships

- `workspace_id uuid`
- `user_id uuid`
- `role owner | admin | member | viewer`
- `status invited | active | suspended`
- `invited_by uuid`
- `joined_at timestamptz`
- primary key `(workspace_id, user_id)`

### 5.4 权限矩阵

- `owner`：工作区全部权限、成员和所有权管理、删除工作区；
- `admin`：业务数据、通知配置和成员管理，但不能删除最后一个 owner；
- `member`：业务数据增删改查，不能管理成员、API Key、平台配置；
- `viewer`：只读；
- `platform_admin`：平台后台权限，跨工作区访问必须使用单独的 support grant，并写审计日志。

代码不散落 `role === ...` 判断，统一使用权限名：

- `reminder.read/write/delete`
- `medicine.read/write/delete`
- `file.read/write/delete`
- `license.read/write/delete/reveal_credentials`
- `notification.read/manage/retry`
- `api_key.manage`
- `workspace.settings.manage`
- `member.manage`
- `audit.read`

### 5.5 auth_sessions

- `id uuid`
- `user_id uuid not null`
- `token_hash text unique not null`
- `active_workspace_id uuid`
- `auth_method totp | passkey | trusted_device | recovery`
- `auth_level normal | strong`
- `authenticated_at`
- `last_seen_at`
- `idle_expires_at`
- `absolute_expires_at`
- `security_version`
- `membership_version`
- `step_up_at`
- `ip_address / user_agent`
- `revoked_at / revoke_reason`

Session 解析后统一返回 `ActorContext`：

```ts
type ActorContext = {
  userId: string;
  sessionId: string;
  workspaceId: string;
  role: WorkspaceRole;
  permissions: Permission[];
  authLevel: "normal" | "strong";
};
```

每次请求都要重新验证 User、Workspace、Membership 的当前状态和版本；Session 中的 role/permissions 只能作为缓存提示，不能作为长期授权事实。切换 Workspace 必须由服务端验证 active Membership 后更新 Session。

敏感操作使用带 scope 和最大年龄的短时 step-up grant，例如 `credential.manage`、`member.manage`、`api_key.manage`。单独的 `auth_level=strong` 不足以代表“近期认证”。

### 5.6 user_totp_factors

- `id uuid`
- `user_id uuid`
- `secret_ciphertext text`
- `key_version integer`
- `enabled_at / revoked_at`
- `last_accepted_step bigint`

登录必须先识别用户，再验证该用户的 TOTP。保存 `last_accepted_step` 防止同一时间窗口 token 重放。

每个用户 V1 只允许一个 active TOTP。验证使用带条件的原子更新，防止并发接受相同 step。Secret 使用版本化信封加密；登录同时按账号、IP 和设备指纹限流，响应不得泄露账号是否存在。

### 5.7 webauthn_credentials

- `id uuid`
- `user_id uuid not null`
- `credential_id text unique not null`
- `public_key text not null`
- `sign_count bigint`
- `user_handle text not null`
- `transports jsonb`
- `device_type / backed_up`
- `device_name`
- `created_at / last_used_at / revoked_at`

注册凭证必须满足：

- 当前用户已经登录；
- 对新增/删除凭证执行近期强认证；
- 只排除当前用户已有凭证；
- `userVerification = required`；
- challenge 绑定当前用户和 ceremony cookie。

邀请开户期间不是普通登录态，而是受限 `enrollment_session`：仅能绑定邀请中的用户，完成初始 Factor 注册，不能访问任何业务 API。Factor 创建、用户激活、personal Workspace/Membership 激活、邀请消费和正式 Session 签发必须在一个事务中完成。

现有 Legacy Passkey 不能伪造新的 userHandle。迁移时先继续使用 `allowCredentials` 兼容登录；若成功认证响应返回可验证的旧 userHandle，则安全捕获，否则要求 Legacy Owner 重新注册新 Passkey后再撤销旧凭证。计数器更新使用 compare-and-swap，并对异常回退触发克隆告警。

### 5.8 webauthn_challenges

- 随机 `id`
- `challenge_hash`
- `flow register | authenticate | step_up`
- `user_id` 可空
- `ceremony_session_id`
- `expires_at / used_at / created_at`

禁止固定 `current/auth` ID。验证和消费必须在事务中原子完成。

### 5.9 trusted_devices

- `id uuid`
- `user_id uuid not null`
- `token_hash text unique`
- `token_family_id uuid`
- `security_version integer`
- `device_name / ip_address / user_agent`
- `expires_at / last_used_at / revoked_at`

恢复时轮换 token。可信设备创建的 Session 为 `auth_level=normal`；管理 Passkey、TOTP、成员和 API Key 时必须 step-up。

### 5.10 workspace_invitations 与 audit_events

V1 实际启用的是 `account_invitations`；`workspace_invitations` 留给 V2 团队共享。另建 `recovery_codes`，只保存带 pepper 的 hash，每条单次原子消费。禁止删除用户最后一个可用 Factor；恢复操作触发全 Session/TrustedDevice 撤销、安全通知、审计和冷却期。

V2 Workspace 邀请记录再绑定邮箱、工作区、角色、邀请人、token hash、过期和消费状态。

审计至少记录：

- 登录成功/失败；
- OTP、Passkey、可信设备变更；
- 成员和角色变更；
- API Key 创建、撤销；
- 敏感凭据查看；
- 数据导出、批量删除；
- 平台管理员 support grant。

## 6. 数据归属设计

以下表增加非空 `workspace_id`，并按需要增加 `created_by`、`updated_by`：

- `reminders`
- `todos`
- `images`
- `attachments`
- `medicines`
- `license_store_accounts`
- `tenant_settings`
- `telegram_bindings`
- `telegram_bind_codes`
- `telegram_webhook_updates`
- `notification_events`
- `notification_groups`
- `notifications`
- `notification_channels`
- `notification_templates`
- `notification_group_routes`
- `notification_api_keys`
- `queue_jobs`
- `send_logs`
- `push_ledgers`
- 租户级 `task_schedules/task_executions`
- `outbox_events`
- `user_preferences`
- `workspace_credentials/credential_versions`
- `r2_object_operations`

平台级表保持独立：

- `platform_settings`
- `platform_secrets`
- `platform_bots`
- `feature_flags`
- `support_grants`
- schema migration 表

### 6.1 防止跨工作区外键

父表增加 `unique(workspace_id, id)`，子表使用复合外键：

```sql
foreign key (workspace_id, reminder_id)
references reminders(workspace_id, id)
```

必须覆盖：

- Attachment → Reminder/Medicine/LicenseStoreAccount；
- Medicine → expiration Reminder；
- LicenseStoreAccount → Reminder；
- Notification → Event/Group；
- GroupRoute → Group/Channel/Template；
- QueueJob → Notification/Channel/Template；
- SendLog/PushLedger → QueueJob/Notification。

所有现有 `SECURITY DEFINER` RPC 必须进入清单并重写：从事务上下文取得 Workspace，内部同时匹配 `workspace_id + id`，验证 Permission，固定安全 `search_path`，显式 revoke/grant。未经审计的旧 RPC 不得授予 runtime/worker 角色。

Attachment V1 改成明确的 `owner_type + owner_id`，且恰好关联一个业务父资源；上传前验证父资源属于当前 Workspace。若保留通用附件，则必须有独立的 Workspace 根资源语义，不能允许三个父 ID 全空或同时多选。

### 6.2 索引与唯一约束

所有高频索引以 `workspace_id` 开头，例如：

- `(workspace_id, deleted_at, due_at)`
- `(workspace_id, status, next_execute_at)`
- `(workspace_id, created_at desc)`

全局唯一规则改为工作区唯一：

- Group：`unique(workspace_id, name)`；
- 默认渠道：每工作区、每渠道类型一个；
- 默认模板：每工作区、每渠道类型一个；
- 通知去重：`unique(workspace_id, source, event_type, dedupe_key)`。

## 7. RLS 与 Repository 设计

采用三层隔离：

1. API 层：从 Session 得到 ActorContext，禁止信任 body/query 中的 workspaceId；
2. Repository 层：构造时必须传 ActorContext，自动注入 workspace 条件；
3. PostgreSQL RLS：运行角色为 NOBYPASSRLS，策略验证当前事务工作区及 Membership。

禁止：

- `findUnique({ id })` 直接访问租户数据；
- update/delete 只按裸 ID；
- 普通 Web 请求使用 service role；
- 平台管理员复用普通租户 API 跨工作区访问。

平台支持访问必须走 `/api/platform/...`，创建短时 support grant，页面持续显示当前模拟目标并写审计。

### 7.1 数据库角色与请求事务

- Direct-PG Repository 必须在开放第二个用户前完成；PostgREST service-role Store 只能用于单租户兼容阶段；
- 使用 transaction pool 时，每个操作都在同一事务执行 `BEGIN → SET LOCAL → SQL → COMMIT/ROLLBACK`；
- 事务结束后上下文自动清除，禁止使用 session-level `SET`；
- tenant 表启用并 `FORCE ROW LEVEL SECURITY`，表 owner 与 runtime role 分离；
- `current_setting('app.workspace_id', true)` 为空时策略必须返回 false，而不是抛错或放行；
- 同时定义 `USING` 和 `WITH CHECK`，防止读隔离正确但写入其他 Workspace。

示意策略：

```sql
alter table public.reminders enable row level security;
alter table public.reminders force row level security;

create policy reminders_workspace_access on public.reminders
for all to reminder_app_runtime
using (
  workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid
  and app_has_workspace_permission(workspace_id, 'reminder.read')
)
with check (
  workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid
  and app_has_workspace_permission(workspace_id, 'reminder.write')
);
```

Membership 自身不能通过递归 RLS 查询验证自己；使用固定 `search_path`、最小权限的安全函数读取 Membership，并对 role/status/version 做检查。support grant 也通过安全函数进入策略，不靠 API 自觉过滤。

### 7.2 Worker 服务身份

增加 `app.actor_type=user|scheduler|notification_worker|maintenance_worker|platform_support`。Worker 不是 Workspace Member：

- Scheduler 只能通过受限 claim 函数领取到期 schedule ID，不能任意浏览业务表；
- 领取后事务绑定单个 Workspace，并只拥有该 task type 所需权限；
- Notification Worker 只能领取 QueueJob、读取对应版本化渠道凭据并回写结果；
- Maintenance Worker 使用单独角色和受限函数处理孤儿、过期数据；
- 不同 Worker 不共用一个宽权限数据库账号；
- 所有状态更新携带 `lease_owner + expected_status + lease未过期` 条件，防止 stale worker 覆盖新 Worker。

## 8. 设置拆分

当前 `app_settings(id=1)` 必须拆分：

### platform_settings / platform_secrets

- R2 endpoint、bucket、平台访问凭据；
- 默认邮件服务；
- 平台 Telegram Bot Token；
- SSL/证书和系统调度配置；
- 仅 platform admin 和服务角色可访问。

### tenant_settings

- 工作区名称、时区；
- 默认提醒时间；
- 通知时段；
- 租户级功能开关；
- `workspace_id` 唯一。

### user_preferences

- 显示名；
- 当前工作区；
- UI 偏好；
- 用户默认时区。

OTP/Passkey 不再放入 settings 表。

## 9. R2 文件设计

### 9.1 新对象 key

```text
v2/workspaces/{workspaceId}/{resourceType}/{resourceId}/{yyyy}/{mm}/{objectId}.{ext}
```

`workspaceId` 和 `resourceId` 必须来自服务端 ActorContext 和已验证父记录，不能相信表单输入。

### 9.2 访问策略

- 新的敏感附件默认 private；
- 下载通过短时 signed URL 或鉴权代理；
- 公共图片单独标记 `visibility=public`，不与敏感附件共用默认策略；
- 数据库保存 bucket/key/checksum/status，不把 public URL 当唯一真相；
- 上传成功但数据库失败时补偿删除；
- 删除使用可重试状态机和孤儿对象巡检；
- 增加工作区存储配额。

### 9.3 旧对象迁移

新上传立即使用 v2 key；旧对象保持兼容读取，由后台按工作区 copy、校验 checksum、更新记录，宽限期后再删除旧 key。禁止一次性破坏性重命名。

## 10. 通知中心与外部 API

### 10.1 API Key v2

格式：`nak_<keyId>_<secret>`，数据库只保存 secret hash 和 prefix。

字段：

- `workspace_id`
- `name`
- `key_prefix / secret_hash`
- `scopes`
- `allowed_group_ids`
- `expires_at / revoked_at`
- `last_used_at / last_used_ip`
- `created_by`

明文只在创建时展示一次。Workspace 从 Key 记录推导，调用方不可指定其他 Workspace。

`allowed_group_ids` 实际使用 `notification_api_key_groups(workspace_id, key_id, group_id)` 关联表和复合外键，不使用无法约束跨 Workspace 的数组字段。

### 10.2 通知链路

Event → Notification → QueueJob → SendLog/PushLedger 每层都直接保存 `workspace_id`，不能只通过父表推断。

去重键落独立列并建立数据库唯一约束，避免先查后插的并发重复。

Event、Notification、QueueJob、Ledger 和 outbox 在同一 PostgreSQL 事务中创建；唯一键冲突时返回已有通知。每条 route 生成稳定 idempotency key。对外投递语义明确为 **at-least-once**：对支持幂等键的第三方传递稳定 key；不支持的渠道接受极小概率重复并提供人工核对，不能宣称数据库唯一约束可实现绝对 exactly-once。

渠道 secret 与普通 config 分离：

- config 保存非敏感路由配置；
- credential 表保存加密 secret 或 secret reference；
- QueueJob 只冻结 credential version/reference，不复制明文 secret；
- 日志和台账对目标、请求和响应分级脱敏。

## 11. Telegram 设计

V1 推荐平台共享一个 Bot：

- Bot Token 属于平台 secret；
- `telegram_bindings` 绑定 `workspace_id + user_id + bot_id + chat_id`；
- 绑定码使用密码学随机数，只保存 hash，绑定 user/workspace/session，短 TTL、单次消费；
- 优先改为 Telegram webhook，并设置 secret token；
- `update_id` 持久化去重；
- 通知路由明确选择发送到哪个成员或工作区频道。

暂不支持租户自带 Bot，除非后续明确存在白标需求。

## 12. 调度器与 Worker 架构

不再由 Next.js Web 进程运行所有定时器，拆分为：

- `reminder-web.service`：UI/API；
- `reminder-scheduler.service`：产生到期任务和 outbox；
- `reminder-notification-worker.service`：领取并派发通知；
- `reminder-maintenance-worker.service`：清理、归档、R2 孤儿修复。

数据模型：

- `task_schedules(workspace_id, task_type, timezone, next_run_at, config, enabled)`；
- `task_executions(workspace_id, schedule_id, scheduled_for, lease_owner, lease_expires_at, heartbeat_at, status)`；
- `outbox_events(workspace_id, idempotency_key, payload, status)`。

关键约束：

- `unique(schedule_id, scheduled_for)`；
- `unique(workspace_id, idempotency_key)`；
- PostgreSQL `FOR UPDATE SKIP LOCKED` 领取；
- lease + heartbeat + stale lease 回收；
- 每工作区并发和渠道限流；
- 到期扫描只创建幂等 outbox，不直接发送。

需额外定义 DST、时区修改、错过执行的 catch-up/coalescing 策略、Workspace 公平调度、graceful shutdown 和死信告警。TaskExecution 只有在 outbox 与执行状态同事务提交后才算成功。

## 13. 现有数据迁移设计

### 13.0 权威数据源清单

迁移前先冻结一份逐表权威源清单，不能笼统把 SQLite 当作全部迁移源：

- SQLite：当前 Session、TrustedDevice、WebAuthn、TelegramBinding/BindCode 等仍在用的认证/绑定数据；
- Supabase：Reminder/Todo/Image/Medicine/Attachment/LicenseStoreAccount、AppSetting、Notification Center 等当前权威数据；
- R2：对象清单、大小、ETag/可计算 checksum、公开 URL 状态；
- 本地文件：SSL 状态、日志和运维脚本，不迁入普通 Workspace；
- 外部系统：Telegram update offset/webhook、在途发送状态。

每项标明 snapshot 时间、写入方、迁移读取源和校验方式。

### 13.1 Legacy Owner

迁移前必须提供：

- `LEGACY_OWNER_EMAIL`
- Legacy 工作区名称

迁移脚本创建：

- 首个 user，兼任 `platform_admin`；
- 一个 `personal/legacy` Workspace；
- owner Membership。

所有现有业务数据归入该 Workspace。

### 13.2 认证数据

- 现有 OTP Secret 归属 Legacy Owner；
- 现有 Passkey 先只读保留在 Legacy Credential Store，并仅允许 Legacy Owner 通过 `allowCredentials` 兼容认证；只有在成功认证响应中取得并验证旧 userHandle 后，才可迁入新表；否则要求 Legacy Owner 注册新 Passkey，验证可用后撤销旧凭证，禁止伪造 userHandle；
- 上线切换时撤销旧 Session 和 TrustedDevice，要求重新登录；
- 旧 SQLite 数据库完整备份并只读保留观察期。

### 13.3 业务数据

按依赖顺序回填：

1. reminders、todos、images；
2. medicines、license_store_accounts；
3. attachments；
4. notification groups/channels/templates/events；
5. notifications、queue jobs、send logs、push ledgers；
6. settings、Telegram bindings、task logs。

每阶段校验：

- 源记录数；
- 目标记录数；
- ID 和关键字段一致；
- 父子关系属于同一 Workspace；
- 无空 workspace_id；
- 无跨 Workspace 外键。

在线回填前先部署“单租户兼容版本”，使所有新写入自动带 Legacy Workspace；旧 RPC 同步改造。随后按高水位重复回填，使用 `CREATE INDEX CONCURRENTLY`、`NOT VALID`/`VALIDATE CONSTRAINT` 减少锁，最终在短停写窗口完成 NULL 校验和 NOT NULL 切换。禁止在旧代码仍持续写 NULL 时直接回填。

在途 QueueJob 按状态冻结、记录切换水位后再恢复。旧 R2 元数据无 checksum 时先计算并记录；公共旧 URL 在数据库切换后仍需完成对象删除/访问收紧和 CDN 缓存验收。

## 14. 灰度上线与回滚

### Phase 0：安全止血

- 修复匿名 Passkey 注册；
- 轮换并删除源码 R2 凭据；
- R2 secret 不再回传或明文保存；
- API Key 改为 hash、只展示一次；
- 敏感操作增加 step-up；
- 完整备份 Supabase、SQLite 和 R2 对象清单。

### Phase 1：增量 Schema

- 新增身份/Workspace 表；
- 业务表增加 nullable workspace_id；
- 创建 Legacy Owner/Workspace 并回填；
- 加 tenant-first 索引和复合外键；
- 校验完成后改为 NOT NULL。

### Phase 2：认证与权限骨架（不开放第二用户）

- 新 Session/Factor/Passkey/Challenge；
- 邀请/enrollment 流程仅在测试环境验证，生产入口保持 feature flag 关闭；
- ActorContext 和权限服务；
- 跨用户/跨 Workspace 负面测试；
- 旧登录入口仅保留给 Legacy Owner，随后关闭。

### Phase 3：Scoped Repository 与 RLS

- 先 shadow 记录缺少 workspace scope 的调用；
- 修复所有调用方；
- 切换 fail closed；
- 引入 NOBYPASSRLS runtime role；
- 禁止普通请求使用 service role。

### Phase 4：通知、Telegram、R2

- 通知链路传播 workspace_id；
- API Key v2；
- Telegram webhook 和用户绑定；
- 新上传使用 private v2 R2 key；
- 后台迁移旧对象。

### Phase 5：Worker 拆分

- 新 scheduler shadow 运行，只比较候选任务；
- Legacy Workspace 小流量启用新 outbox；
- 幂等验证通过后关闭 Next.js 进程内 timer；
- 再允许 Web 横向扩容。

### Phase 6：多用户 Release Gate

只有以下条件全部满足，才允许生产兑换第一个新用户邀请：

- 所有 tenant 表 workspace_id 非空，复合外键/RLS 已生效；
- 普通 Web 请求和 Worker 已停止使用 service role；
- 通知、Telegram、R2、设置和 API Key 已完成 Workspace 隔离；
- 全部跨 Workspace 负面测试通过；
- 回滚矩阵、备份恢复和切流演练通过；
- Legacy Owner 数据校验报告为零差异。

### 回滚原则

- Schema 先扩展，观察期内不删除旧列；
- 开放第二 Workspace 之前，可回滚到单租户兼容版本；
- 开放第二 Workspace 之后，禁止回滚到任何不理解 workspace_id 的旧版本，只能 forward-fix 或回滚到上一版多租户兼容版本；
- 紧急情况下先冻结写入、关闭新登录和所有旧调度器，再执行流量切换；
- 回滚通过 feature flag 和 Worker 切换，不清除已写入 workspace_id；
- 新旧派发器必须使用同一稳定幂等键；如果旧派发器不能生成该键，则切换期间禁止双运行；
- 旧 R2 对象在宽限期内保留；
- 旧认证库只读保留，不能双写成为长期状态。

## 15. 测试策略

必须新增：

- User A 无法读取、修改、删除 User B 的所有资源；
- 猜测 ID、关联 ID、附件 ID、通知 ID 均不能越权；
- owner/admin/member/viewer 权限矩阵；
- Passkey challenge 并发、过期、重放、跨用户混用；
- OTP 限流和时间步重放；
- TrustedDevice 轮换、撤销、安全版本失效；
- 邀请 token 单次消费和并发兑换；
- API Key scope、过期、撤销、限流、跨 Workspace group 注入；
- RLS 在漏加应用过滤时仍拒绝跨 Workspace；
- 复合外键拒绝跨 Workspace 父子关系；
- Scheduler 多 Worker 领取、lease 超时、重复执行；
- 通知 outbox 幂等和第三方成功/数据库失败场景；
- R2 上传补偿、私有下载授权、跨 Workspace key 访问；
- Legacy 数据迁移记录数、字段和关系全量核对。

## 16. 建议实施任务顺序

1. Phase 0 安全修复；
2. 创建身份和 Workspace Schema；
3. 建立 Legacy Owner 迁移脚本；
4. 重构 Session/OTP/Passkey/TrustedDevice；
5. 建立 ActorContext、PermissionService 和审计；
6. 业务表增加 workspace_id 和复合外键；
7. Scoped Repository 与全部 API 改造；
8. 设置拆分；
9. 通知中心和 API Key v2；
10. Telegram 用户绑定；
11. R2 v2 私有对象；
12. Scheduler/Worker 拆分；
13. RLS runtime role 切换；
14. 灰度、监控、回滚演练；
15. 执行多用户 Release Gate 后才开放邀请兑换；
16. 稳定观察期后关闭旧登录、旧 Store 和兼容路径。

每一项必须使用 TDD、独立代码审查、生产构建验证和单独提交，不能一次性大爆炸上线。

## 17. 实施前仍需确认的产品决策

1. V1 是否接受邀请制注册；
2. 普通用户是完全独立个人空间，还是立即开放家庭/团队共享；
3. 登录是否保留“邮箱 + TOTP”和 Passkey 两种方式；
4. 是否需要密码登录或邮件验证码登录；
5. `license_store_accounts` 的远程码/远程密码，哪些角色可以查看和复制；
6. 新上传文件是否全部改为私有，还是图片模块允许显式公开；
7. Telegram 使用平台共享 Bot，还是允许租户自带 Bot；
8. 平台管理员是否需要受控模拟用户功能；
9. Legacy Owner 的邮箱和工作区名称；
10. 是否需要套餐、存储额度、通知额度或付费能力。

在这些决策确认前，不开始业务代码改造。