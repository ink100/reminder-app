# 家庭多用户 V1 实施状态

## 当前已完成：身份归属基础层

- 新增 `User` 与 `UserTotpFactor`；当前历史管理员固定迁移为 `legacy-admin`、角色 `ADMIN`。
- `AuthSession`、`TrustedDevice`、`WebAuthnCredential` 均强制绑定 `userId`。
- 历史 Session、可信设备和 Passkey 无损归属到历史管理员。
- OTP 登录增加用户名，Session 记录认证方式并返回当前用户身份。
- Passkey 注册改为必须已登录，凭证注册、列表和删除仅作用于当前用户。
- TrustedDevice 创建、恢复、列表和撤销均按当前用户隔离。
- 匿名 OTP 初始化已关闭；迁移期间暂停高风险 OTP 重置。
- 提供可重复执行的 `npm run db:family-auth-v1`，迁移在事务内重建认证表、建立外键、校验行数和外键完整性。

## 当前发布边界

本阶段仍保持“一个家庭共享全部业务数据”，尚未开放第二名成员的邀请入口。这样可以先让现有管理员和所有历史认证记录获得明确用户归属，同时避免在角色授权和 WebAuthn ceremony 隔离完成前提前开放成员登录。

## 开放第二名成员前仍需完成

1. 随机、一次性、绑定浏览器 ceremony 与用户的 WebAuthn challenge。
2. 管理员成员邀请、受限 enrollment、每用户 TOTP 初始化。
3. `ADMIN` / `MEMBER` 的页面和 API 权限矩阵，尤其是系统设置、R2、Bot、API Key、SSL 和远程凭据。
4. OTP 按用户名和客户端来源限流，以及同一 TOTP 时间步防重放。
5. 当前用户信息和角色展示、成员管理页、切换账号入口。
6. 第二用户负路径测试通过后，才允许生成邀请链接。

## 同设备规则

同一个浏览器配置文件只保持一个当前用户 Session。家庭成员需要同时保持登录时使用不同浏览器配置文件；V1 不在一个 Cookie 中保存多个 bearer session。
