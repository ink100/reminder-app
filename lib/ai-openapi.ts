type Method = "get" | "post" | "put" | "patch" | "delete";
type Schema = Record<string, unknown>;

type OperationSpec = {
  method: Method;
  operationId: string;
  summary: string;
  body?: Schema;
  query?: Array<{ name: string; schema?: Schema; description?: string }>;
  security?: Array<Record<string, string[]>>;
  contentType?: string;
  description?: string;
  response?: Schema;
  successStatus?: 200 | 201;
};

const object = (properties: Record<string, Schema>, required: string[] = []): Schema => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});
const string = (extra: Schema = {}): Schema => ({ type: "string", ...extra });
const boolean: Schema = { type: "boolean" };
const integer = (extra: Schema = {}): Schema => ({ type: "integer", ...extra });
const unknownObject: Schema = { type: "object", additionalProperties: true };

const reminderBody = object({
  title: string({ minLength: 1, maxLength: 200 }),
  description: string({ nullable: true }),
  activationCode: string({ nullable: true }),
  activationContact: string({ nullable: true, maxLength: 200 }),
  dueAt: string({ format: "date-time" }),
  priority: string({ enum: ["low", "medium", "high"], default: "medium" }),
  category: string({ nullable: true }),
  remindBeforeDays: integer({ minimum: 0, maximum: 30, default: 3 }),
  remindBeforeHours: integer({ minimum: 0, maximum: 168, default: 0 }),
  overdueRemindEnabled: { type: "boolean", default: true },
  recurrenceType: string({ enum: ["daily", "weekly", "monthly", "yearly"], nullable: true }),
  recurrenceInterval: integer({ minimum: 1, maximum: 30, nullable: true }),
}, ["title", "dueAt"]);
const medicineBody = object({
  name: string({ minLength: 1, maxLength: 80 }),
  category: string({ enum: ["感冒发烧", "肠胃消化", "皮肤外用", "过敏鼻炎", "外伤护理", "儿童用药", "慢病常备", "营养保健", "其他"], default: "其他" }),
  tags: string({ nullable: true }),
  quantityTotal: { type: "number", minimum: 0, nullable: true },
  quantityRemaining: { type: "number", minimum: 0, nullable: true },
  unit: string({ enum: ["片", "粒", "袋", "支", "瓶", "盒", "ml", "g", "次", "其他"], default: "盒" }),
  lowStockThreshold: { type: "number", minimum: 0, nullable: true },
  locationText: string({ nullable: true }),
  contentText: string({ nullable: true }),
  openedAt: string({ format: "date-time", nullable: true }),
  expiresAt: string({ format: "date-time", nullable: true }),
  expirationReminderDays: integer({ minimum: 0, maximum: 3650, default: 30 }),
  notes: string({ nullable: true }),
}, ["name"]);
const storeAccountBody = object({
  shopName: string(), phone: string(), remoteCode: string(), remotePassword: string(), isOtherAccount: boolean,
  expiresAt: string({ format: "date-time" }), activationCode: string(),
}, ["shopName", "phone", "remoteCode", "remotePassword", "isOtherAccount", "expiresAt", "activationCode"]);
const groupBody = object({ name: string(), description: string({ nullable: true }), enabled: boolean }, ["name"]);
const groupPatchBody = object({ name: string(), description: string({ nullable: true }), enabled: boolean });
const channelBody = object({
  type: string(), name: string(), config: unknownObject, enabled: boolean, is_default: boolean,
}, ["type", "name"]);
const templateBody = object({
  name: string(), channel_type: string(), content: string(), enabled: boolean,
  group_id: string({ nullable: true }), is_default: boolean,
}, ["name", "channel_type", "content"]);
const templatePatchBody = object({
  name: string(), channel_type: string(), content: string(), enabled: boolean,
  group_id: string({ nullable: true }), is_default: boolean,
});
const settingsBody = object({
  appName: string({ minLength: 1, maxLength: 100 }),
  timezone: string({ minLength: 1, maxLength: 100 }),
  emailNotificationsEnabled: boolean,
  notificationEmail: string({ format: "email", nullable: true }),
  smtpHost: string({ maxLength: 200 }),
  smtpPort: integer({ minimum: 1, maximum: 65535 }),
  smtpUser: string({ maxLength: 200 }),
  smtpPass: string({ maxLength: 2000, writeOnly: true }),
  smtpFromEmail: string({ format: "email", maxLength: 200 }),
  smtpFromName: string({ maxLength: 200 }),
  clearSmtpPass: boolean,
  reminderEmailEnabled: boolean,
  reminderEmailInterval: integer({ minimum: 60, maximum: 86400 }),
  notifyStartHour: integer({ minimum: 0, maximum: 23 }),
  notifyEndHour: integer({ minimum: 0, maximum: 23 }),
}, ["appName", "timezone", "emailNotificationsEnabled", "smtpHost", "smtpPort", "smtpUser", "smtpPass", "smtpFromEmail", "smtpFromName", "clearSmtpPass"]);
const r2Settings = object({
  endpoint: string(),
  accessKey: string({ writeOnly: true }),
  secretKey: string({ writeOnly: true }),
  accessKeyConfigured: boolean,
  secretKeyConfigured: boolean,
  bucket: string(),
  publicUrl: string(),
  cacheControl: string(),
});

const paths: Record<string, OperationSpec[]> = {
  "/api/attachments": [{ method: "get", operationId: "listAttachments", summary: "分页列出附件", query: [{ name: "page", schema: integer({ minimum: 1 }) }, { name: "pageSize", schema: integer({ minimum: 1 }) }, { name: "search" }, { name: "type", schema: string({ enum: ["image", "file", "all"] }) }] }],
  "/api/attachments/{id}": [{ method: "delete", operationId: "deleteAttachment", summary: "删除附件" }],
  "/api/images": [
    { method: "get", operationId: "listImages", summary: "分页列出图片或文件", query: [{ name: "page", schema: integer({ minimum: 1 }) }, { name: "pageSize", schema: integer({ minimum: 1 }) }, { name: "search" }, { name: "type", schema: string({ enum: ["image", "file", "all"] }) }] },
    { method: "post", operationId: "uploadImage", summary: "上传图片或文件", contentType: "multipart/form-data", body: object({ file: { type: "string", format: "binary" } }, ["file"]), successStatus: 201 },
  ],
  "/api/images/{id}": [{ method: "delete", operationId: "deleteImage", summary: "删除图片" }],
  "/api/license/generate": [{ method: "post", operationId: "generateLicense", summary: "生成授权文件", body: object({ clientKey: string(), validDays: integer({ minimum: 1 }), reminderId: string() }, ["clientKey", "validDays"]) }],
  "/api/license/store-accounts": [
    { method: "get", operationId: "listLicenseStoreAccounts", summary: "列出店铺账号", query: [{ name: "q" }] },
    { method: "post", operationId: "createLicenseStoreAccount", summary: "创建店铺账号", body: storeAccountBody, successStatus: 201 },
  ],
  "/api/license/store-accounts/{id}": [
    { method: "put", operationId: "updateLicenseStoreAccount", summary: "更新店铺账号", body: storeAccountBody },
    { method: "delete", operationId: "deleteLicenseStoreAccount", summary: "删除店铺账号" },
  ],
  "/api/license/store-accounts/{id}/payment-qr": [
    { method: "get", operationId: "getLicenseStorePaymentQr", summary: "读取收款码" },
    { method: "post", operationId: "uploadLicenseStorePaymentQr", summary: "上传收款码", contentType: "multipart/form-data", body: object({ file: { type: "string", format: "binary" }, attachmentType: string({ enum: ["payment_qr_wechat", "payment_qr_alipay"] }) }, ["file", "attachmentType"]) },
    { method: "delete", operationId: "deleteLicenseStorePaymentQr", summary: "删除收款码", query: [{ name: "attachmentType", schema: string({ enum: ["payment_qr_wechat", "payment_qr_alipay"] }) }] },
  ],
  "/api/medicines": [
    { method: "get", operationId: "listMedicines", summary: "列出药品" },
    { method: "post", operationId: "createMedicine", summary: "创建药品", body: medicineBody, successStatus: 201 },
  ],
  "/api/medicines/{id}": [
    { method: "get", operationId: "getMedicine", summary: "读取药品" },
    { method: "put", operationId: "updateMedicine", summary: "更新药品", body: medicineBody },
    { method: "delete", operationId: "deleteMedicine", summary: "删除药品" },
  ],
  "/api/medicines/{id}/attachments": [
    { method: "get", operationId: "listMedicineAttachments", summary: "列出药品附件" },
    { method: "post", operationId: "uploadMedicineAttachment", summary: "上传药品附件", contentType: "multipart/form-data", body: object({ file: { type: "string", format: "binary" } }, ["file"]), successStatus: 201 },
  ],
  "/api/notification-center/channels": [
    { method: "get", operationId: "listNotificationChannels", summary: "列出通知渠道" },
    { method: "post", operationId: "createNotificationChannel", summary: "创建通知渠道", body: channelBody, successStatus: 201 },
  ],
  "/api/notification-center/dispatch": [{ method: "post", operationId: "dispatchNotificationQueue", summary: "派发通知队列" }],
  "/api/notification-center/groups": [
    { method: "get", operationId: "listNotificationGroups", summary: "列出通知分组" },
    { method: "post", operationId: "createNotificationGroup", summary: "创建通知分组", body: groupBody, successStatus: 201 },
  ],
  "/api/notification-center/groups/{id}": [{ method: "patch", operationId: "updateNotificationGroup", summary: "更新通知分组", body: groupPatchBody }],
  "/api/notification-center/groups/{id}/routes/{channelId}": [
    { method: "put", operationId: "setNotificationGroupRoute", summary: "设置分组渠道路由", body: object({ mode: string({ enum: ["custom", "disabled"] }), templateId: string({ nullable: true }), configOverride: unknownObject }, ["mode"]) },
    { method: "delete", operationId: "deleteNotificationGroupRoute", summary: "恢复分组渠道继承" },
  ],
  "/api/notification-center/templates": [
    { method: "get", operationId: "listNotificationTemplates", summary: "列出通知模板" },
    { method: "post", operationId: "createNotificationTemplate", summary: "创建通知模板", body: templateBody, successStatus: 201 },
  ],
  "/api/notification-center/templates/{id}": [{ method: "patch", operationId: "updateNotificationTemplate", summary: "更新通知模板", body: templatePatchBody }],
  "/api/push-ledger": [{ method: "get", operationId: "listPushLedger", summary: "列出推送台账", query: [{ name: "status" }, { name: "channel_type" }, { name: "q" }, { name: "limit", schema: integer({ minimum: 1, maximum: 200 }) }, { name: "offset", schema: integer({ minimum: 0 }) }] }],
  "/api/reminders": [
    { method: "get", operationId: "listReminders", summary: "列出所有未删除提醒" },
    { method: "post", operationId: "createReminder", summary: "创建提醒", body: reminderBody, successStatus: 201 },
  ],
  "/api/reminders/{id}": [
    { method: "get", operationId: "getReminder", summary: "读取提醒" },
    { method: "put", operationId: "updateReminder", summary: "更新提醒", body: reminderBody },
    { method: "delete", operationId: "deleteReminder", summary: "删除提醒" },
  ],
  "/api/reminders/{id}/complete": [{ method: "post", operationId: "completeReminder", summary: "完成提醒" }],
  "/api/reminders/{id}/restore": [{ method: "post", operationId: "restoreReminder", summary: "恢复提醒" }],
  "/api/scheduler/status": [{ method: "get", operationId: "getSchedulerStatus", summary: "读取调度器状态" }],
  "/api/settings": [
    { method: "get", operationId: "getAppSettings", summary: "读取应用设置" },
    { method: "put", operationId: "updateAppSettings", summary: "更新应用设置", body: settingsBody },
  ],
  "/api/settings/bot": [
    { method: "get", operationId: "getBotSettings", summary: "读取 Bot 设置" },
    { method: "put", operationId: "updateBotSettings", summary: "更新 Bot 设置", body: unknownObject },
    { method: "post", operationId: "testBotSettings", summary: "测试 Bot 设置", body: unknownObject },
  ],
  "/api/settings/bot/bindings": [
    { method: "get", operationId: "listBotBindings", summary: "列出 Bot 绑定" },
    { method: "post", operationId: "createBotBinding", summary: "创建 Bot 绑定", body: unknownObject },
  ],
  "/api/settings/r2": [
    { method: "get", operationId: "getR2Settings", summary: "读取 R2 设置", description: "AI Key 调用时 accessKey/secretKey 始终脱敏为空字符串；使用 configured 布尔字段判断是否已配置。", response: r2Settings },
    { method: "put", operationId: "updateR2Settings", summary: "更新 R2 设置", body: r2Settings },
    { method: "post", operationId: "testR2Settings", summary: "测试 R2 设置", body: r2Settings },
  ],
  "/api/settings/test-email": [{ method: "post", operationId: "sendTestEmail", summary: "发送测试邮件", body: unknownObject }],
  "/api/ssl": [
    { method: "get", operationId: "getSslStatus", summary: "读取 SSL 状态" },
    { method: "post", operationId: "manageSsl", summary: "管理 SSL" },
  ],
  "/api/todos": [
    { method: "get", operationId: "listTodos", summary: "列出待办" },
    { method: "post", operationId: "createTodo", summary: "创建待办", body: object({ title: string({ minLength: 1, maxLength: 200 }) }, ["title"]), successStatus: 201 },
  ],
  "/api/todos/{id}": [
    { method: "patch", operationId: "updateTodo", summary: "更新待办标题或完成状态", body: object({ title: string({ minLength: 1, maxLength: 200 }), completed: boolean }) },
    { method: "delete", operationId: "deleteTodo", summary: "删除待办" },
  ],
  "/api/upload": [
    { method: "get", operationId: "listReminderUploads", summary: "列出提醒附件", query: [{ name: "reminderId" }] },
    { method: "post", operationId: "uploadReminderFile", summary: "上传提醒附件", contentType: "multipart/form-data", body: object({ file: { type: "string", format: "binary" }, reminderId: string({ nullable: true }) }, ["file"]) },
  ],
  "/api/voice/transcriptions": [{ method: "post", operationId: "transcribeVoice", summary: "语音转文字", contentType: "multipart/form-data", body: object({ file: { type: "string", format: "binary" } }, ["file"]) }],
  "/api/voice/tts": [{ method: "post", operationId: "synthesizeVoice", summary: "文字转语音", body: object({ input: string({ minLength: 1, maxLength: 8000 }), voice: string({ default: "zh-CN-XiaoxiaoNeural" }), speed: { type: "number", minimum: 0.5, maximum: 2, default: 1 }, volume: { type: "number", minimum: -100, maximum: 100, default: 0 }, pitch: { type: "number", minimum: -50, maximum: 50, default: 0 } }, ["input"]) }],
  "/cancel/{id}": [{ method: "post", operationId: "cancelNotification", summary: "取消通知" }],
  "/channels": [
    { method: "get", operationId: "listChannels", summary: "列出通知渠道（兼容路由）" },
    { method: "post", operationId: "createChannel", summary: "创建通知渠道（兼容路由）", body: channelBody, successStatus: 201 },
  ],
  "/groups": [
    { method: "get", operationId: "listGroups", summary: "列出通知分组（兼容路由）" },
    { method: "post", operationId: "createGroup", summary: "创建通知分组（兼容路由）", body: groupBody, successStatus: 201 },
  ],
  "/notifications": [{ method: "get", operationId: "listNotifications", summary: "列出通知", query: [{ name: "status" }, { name: "group" }, { name: "limit", schema: integer({ minimum: 1, maximum: 200 }) }, { name: "offset", schema: integer({ minimum: 0 }) }] }],
  "/notifications/{id}": [{ method: "get", operationId: "getNotification", summary: "读取通知详情" }],
  "/notify": [{ method: "post", operationId: "sendNotification", summary: "发送通知", security: [{ ApiKeyAuth: [] }], body: object({ group: string(), event_type: string(), title: string(), summary: string(), source: string(), dedupe_key: string(), priority: integer({ minimum: 0, maximum: 3 }), payload: unknownObject }, ["group", "event_type", "title"]) }],
  "/queue/jobs": [{ method: "get", operationId: "listQueueJobs", summary: "列出通知队列任务", query: [{ name: "status" }, { name: "limit", schema: integer({ minimum: 1, maximum: 200 }) }] }],
  "/queue/retry/{job_id}": [{ method: "post", operationId: "retryQueueJob", summary: "重试通知队列任务" }],
  "/templates": [
    { method: "get", operationId: "listTemplates", summary: "列出通知模板（兼容路由）" },
    { method: "post", operationId: "createTemplate", summary: "创建通知模板（兼容路由）", body: templateBody, successStatus: 201 },
  ],
};

function parametersFor(path: string, operation: OperationSpec) {
  const parameters: Record<string, unknown>[] = [];
  for (const match of path.matchAll(/\{([^}]+)\}/g)) {
    parameters.push({ name: match[1], in: "path", required: true, schema: { type: "string" } });
  }
  for (const query of operation.query ?? []) {
    parameters.push({ name: query.name, in: "query", required: false, schema: query.schema ?? { type: "string" }, ...(query.description ? { description: query.description } : {}) });
  }
  return parameters;
}

export const AI_OPENAPI_DOCUMENT = {
  openapi: "3.0.3",
  info: {
    title: "Reminder App AI API",
    version: "1.0.0",
    description: "供受信任 AI 客户端使用的非身份业务 API。身份、邀请、OTP 与凭据重置接口刻意不在此文档中。",
  },
  servers: [{ url: "/", description: "当前 Reminder App 实例" }],
  security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
  paths: Object.fromEntries(Object.entries(paths).map(([path, operations]) => [
    path,
    Object.fromEntries(operations.map((operation) => [operation.method, {
      operationId: operation.operationId,
      summary: operation.summary,
      ...(operation.description ? { description: operation.description } : {}),
      security: operation.security,
      parameters: parametersFor(path, operation),
      ...(operation.body ? { requestBody: { required: true, content: { [operation.contentType ?? "application/json"]: { schema: operation.body } } } } : {}),
      responses: {
        [String(operation.successStatus ?? 200)]: {
          description: "成功",
          ...(operation.response ? { content: { "application/json": { schema: operation.response } } } : {}),
        },
        "400": { description: "请求不合法" },
        "401": { description: "未授权" },
        "403": { description: "无权限" },
        "404": { description: "资源不存在" },
      },
    }]))
  ])),
  components: {
    securitySchemes: {
      BearerAuth: { type: "http", scheme: "bearer", description: "具有 ai:all scope 的 AI API key" },
      ApiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key", description: "具有 ai:all scope 的 AI API key；/notify 也接受 legacy notifications:send key" },
    },
  },
} as const;

export const AI_PLUGIN_MANIFEST = {
  schema_version: "v1",
  name_for_human: "Reminder App",
  name_for_model: "reminder_app",
  description_for_human: "管理提醒、待办、药品与通知。",
  description_for_model: "Use the documented non-identity APIs to manage reminder app business resources. Never attempt identity, invitation, OTP, or credential-reset operations.",
  auth: { type: "service_http", authorization_type: "bearer", verification_tokens: {} },
  api: { type: "openapi", url: "/api/openapi.json", is_user_authenticated: false },
  logo_url: "/favicon.ico",
  contact_email: "support@localhost",
  legal_info_url: "/",
} as const;
