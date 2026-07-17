"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { MEDICINE_ATTACHMENT_TYPES, MEDICINE_CATEGORIES, MEDICINE_UNITS, getMedicineAttachmentLabel, getMedicineStatusLabel, type MedicineAttachmentType, type MedicineStatus } from "@/lib/medicines";

type MedicineItem = {
  id: string;
  name: string;
  category: string;
  tags: string | null;
  quantityTotal: number | null;
  quantityRemaining: number | null;
  unit: string;
  lowStockThreshold: number | null;
  locationText: string | null;
  contentText: string | null;
  openedAt: string | null;
  expiresAt: string | null;
  expirationReminderDays: number;
  notes: string | null;
  status: MedicineStatus;
};

type MedicineFormState = {
  name: string;
  category: string;
  tags: string;
  quantityTotal: string;
  quantityRemaining: string;
  unit: string;
  lowStockThreshold: string;
  locationText: string;
  contentText: string;
  openedAt: string;
  expiresAt: string;
  expirationReminderDays: string;
  notes: string;
};

const emptyForm: MedicineFormState = {
  name: "",
  category: "其他",
  tags: "",
  quantityTotal: "",
  quantityRemaining: "",
  unit: "盒",
  lowStockThreshold: "",
  locationText: "",
  contentText: "",
  openedAt: "",
  expiresAt: "",
  expirationReminderDays: "30",
  notes: "",
};

const statusOptions: Array<{ value: "all" | MedicineStatus; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "normal", label: "正常" },
  { value: "expiring_soon", label: "即将过期" },
  { value: "expired", label: "已过期" },
  { value: "low_stock", label: "库存偏低" },
  { value: "empty", label: "已用完" },
];

const medicineAttachmentTypes = [
  MEDICINE_ATTACHMENT_TYPES.photo,
  MEDICINE_ATTACHMENT_TYPES.location,
  MEDICINE_ATTACHMENT_TYPES.content,
] as const;

type PendingAttachmentFiles = Record<MedicineAttachmentType, File[]>;

function createEmptyAttachmentFiles(): PendingAttachmentFiles {
  return {
    [MEDICINE_ATTACHMENT_TYPES.photo]: [],
    [MEDICINE_ATTACHMENT_TYPES.location]: [],
    [MEDICINE_ATTACHMENT_TYPES.content]: [],
  };
}

const attachmentDescriptions: Record<MedicineAttachmentType, string> = {
  [MEDICINE_ATTACHMENT_TYPES.photo]: "药盒、药瓶、药袋外观",
  [MEDICINE_ATTACHMENT_TYPES.location]: "药箱、抽屉、冰箱格子等位置",
  [MEDICINE_ATTACHMENT_TYPES.content]: "说明书、用法用量、注意事项或医嘱",
};

function toFileList(files: FileList | null | undefined) {
  return files ? Array.from(files) : [];
}

function PendingAttachmentPicker({
  type,
  files,
  disabled,
  onAdd,
  onRemove,
}: {
  type: MedicineAttachmentType;
  files: File[];
  disabled: boolean;
  onAdd: (type: MedicineAttachmentType, files: File[]) => void;
  onRemove: (type: MedicineAttachmentType, index: number) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const label = getMedicineAttachmentLabel(type) ?? "药品附件";

  function addFiles(selected: FileList | null) {
    const selectedFiles = toFileList(selected);
    if (selectedFiles.length) onAdd(type, selectedFiles);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-800">{label}</p>
          <p className="mt-1 text-xs text-slate-500">{attachmentDescriptions[type]}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">{files.length} 张</span>
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => addFiles(event.target.files)} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => addFiles(event.target.files)} />
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button type="button" disabled={disabled} className="min-h-10 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white disabled:opacity-50" onClick={() => fileInputRef.current?.click()}>上传已有图片</button>
        <button type="button" disabled={disabled} className="min-h-10 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white disabled:opacity-50" onClick={() => cameraInputRef.current?.click()}>拍照上传</button>
      </div>
      {files.length ? (
        <div className="mt-3 space-y-2">
          {files.map((file, index) => (
            <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600">
              <span className="min-w-0 truncate">{file.name}</span>
              <button type="button" disabled={disabled} className="shrink-0 text-red-600 disabled:opacity-50" onClick={() => onRemove(type, index)}>移除</button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function toDateInput(value: string | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function formFromMedicine(item: MedicineItem): MedicineFormState {
  return {
    name: item.name,
    category: item.category,
    tags: item.tags ?? "",
    quantityTotal: item.quantityTotal?.toString() ?? "",
    quantityRemaining: item.quantityRemaining?.toString() ?? "",
    unit: item.unit,
    lowStockThreshold: item.lowStockThreshold?.toString() ?? "",
    locationText: item.locationText ?? "",
    contentText: item.contentText ?? "",
    openedAt: toDateInput(item.openedAt),
    expiresAt: toDateInput(item.expiresAt),
    expirationReminderDays: item.expirationReminderDays?.toString() ?? "30",
    notes: item.notes ?? "",
  };
}

function toPayload(form: MedicineFormState) {
  return {
    name: form.name,
    category: form.category,
    tags: form.tags,
    quantityTotal: form.quantityTotal === "" ? null : Number(form.quantityTotal),
    quantityRemaining: form.quantityRemaining === "" ? null : Number(form.quantityRemaining),
    unit: form.unit,
    lowStockThreshold: form.lowStockThreshold === "" ? null : Number(form.lowStockThreshold),
    locationText: form.locationText,
    contentText: form.contentText,
    openedAt: form.openedAt || null,
    expiresAt: form.expiresAt || null,
    expirationReminderDays: Number(form.expirationReminderDays || 30),
    notes: form.notes,
  };
}

function statusClass(status: MedicineStatus) {
  return {
    normal: "bg-emerald-50 text-emerald-700",
    expiring_soon: "bg-amber-50 text-amber-700",
    expired: "bg-red-50 text-red-700",
    low_stock: "bg-orange-50 text-orange-700",
    empty: "bg-slate-100 text-slate-600",
  }[status];
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("zh-CN") : "未填写";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1 text-sm font-medium text-slate-700"><span>{label}</span>{children}</label>;
}

export function MedicineDashboard() {
  const [items, setItems] = useState<MedicineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<MedicineItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<MedicineFormState>(emptyForm);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachmentFiles>(() => createEmptyAttachmentFiles());
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<"all" | MedicineStatus>("all");
  const [tag, setTag] = useState("");

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/medicines", { cache: "no-store" });
      const data = (await response.json()) as { items?: MedicineItem[]; error?: string };
      if (!response.ok || !data.items) throw new Error(data.error ?? "加载药品失败");
      setItems(data.items);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载药品失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadItems);
  }, [loadItems]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const tagKeyword = tag.trim().toLowerCase();
    return items.filter((item) => {
      const haystack = [item.name, item.category, item.tags, item.locationText, item.contentText].filter(Boolean).join(" ").toLowerCase();
      if (keyword && !haystack.includes(keyword)) return false;
      if (category !== "all" && item.category !== category) return false;
      if (status !== "all" && item.status !== status) return false;
      if (tagKeyword && !(item.tags ?? "").toLowerCase().includes(tagKeyword)) return false;
      return true;
    });
  }, [items, search, category, status, tag]);

  const stats = useMemo(() => ({
    total: items.length,
    opened: items.filter((item) => item.openedAt).length,
    expiring: items.filter((item) => item.status === "expiring_soon").length,
    expired: items.filter((item) => item.status === "expired").length,
    low: items.filter((item) => item.status === "low_stock" || item.status === "empty").length,
  }), [items]);

  function resetPendingAttachments() {
    setPendingAttachments(createEmptyAttachmentFiles());
  }

  function addPendingAttachments(type: MedicineAttachmentType, files: File[]) {
    setPendingAttachments((current) => ({ ...current, [type]: [...current[type], ...files] }));
  }

  function removePendingAttachment(type: MedicineAttachmentType, index: number) {
    setPendingAttachments((current) => ({ ...current, [type]: current[type].filter((_, itemIndex) => itemIndex !== index) }));
  }

  async function uploadPendingAttachments(medicineId: string) {
    const entries = medicineAttachmentTypes.flatMap((type) => pendingAttachments[type].map((file) => ({ type, file })));
    for (const entry of entries) {
      const formData = new FormData();
      formData.append("file", entry.file);
      formData.append("attachmentType", entry.type);
      const response = await fetch(`/api/medicines/${medicineId}/attachments`, { method: "POST", body: formData });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? `附件「${entry.file.name}」上传失败`);
    }
    return entries.length;
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    resetPendingAttachments();
    setFormOpen(true);
    setMessage(null);
  }

  function openEdit(item: MedicineItem) {
    setEditing(item);
    setForm(formFromMedicine(item));
    resetPendingAttachments();
    setFormOpen(true);
    setMessage(null);
  }

  async function saveMedicine(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(editing ? `/api/medicines/${editing.id}` : "/api/medicines", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(form)),
      });
      const data = (await response.json()) as { item?: MedicineItem; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error ?? "保存失败");
      const saved = data.item;
      setItems((current) => editing ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
      const uploadedCount = await uploadPendingAttachments(saved.id);
      resetPendingAttachments();
      setFormOpen(false);
      setMessage(uploadedCount ? `药品已保存，并上传了 ${uploadedCount} 张附件` : "药品已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function deleteMedicine(item: MedicineItem) {
    if (!confirm(`确定归档药品「${item.name}」吗？`)) return;
    const response = await fetch(`/api/medicines/${item.id}`, { method: "DELETE" });
    if (response.ok) setItems((current) => current.filter((entry) => entry.id !== item.id));
  }

  return (
    <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">家庭药箱</p>
          <h1 className="text-balance text-2xl font-bold text-slate-950">药品管理</h1>
          <p className="mt-1 text-sm text-slate-500">管理已开封但未用完的家庭人用药品、剩余量、位置、附件和过期提醒。</p>
        </div>
        <Button type="button" onClick={openCreate}>新增药品</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[['总数', stats.total], ['已开封', stats.opened], ['即将过期', stats.expiring], ['已过期', stats.expired], ['库存不足', stats.low]].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p></div>
        ))}
      </div>

      {message ? <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">{message}</p> : null}

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <input className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm" placeholder="搜索药名/位置/内容" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">全部分类</option>
          {MEDICINE_CATEGORIES.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
        </select>
        <select className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value as "all" | MedicineStatus)}>
          {statusOptions.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
        </select>
        <input className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm" placeholder="标签筛选" value={tag} onChange={(e) => setTag(e.target.value)} />
      </div>

      {formOpen ? (
        <form onSubmit={saveMedicine} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between"><h2 className="font-semibold text-slate-950">{editing ? "编辑药品" : "新增药品"}</h2><button type="button" className="text-sm text-slate-500" onClick={() => setFormOpen(false)}>关闭</button></div>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="药品名称"><input required className="min-h-11 w-full rounded-lg border border-slate-200 px-3" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="分类"><select className="min-h-11 w-full rounded-lg border border-slate-200 px-3" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{MEDICINE_CATEGORIES.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></Field>
            <Field label="标签"><input className="min-h-11 w-full rounded-lg border border-slate-200 px-3" placeholder="如：退烧,止痛" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></Field>
            <Field label="总数量"><input type="number" min="0" step="0.01" className="min-h-11 w-full rounded-lg border border-slate-200 px-3" value={form.quantityTotal} onChange={(e) => setForm({ ...form, quantityTotal: e.target.value })} /></Field>
            <Field label="剩余量"><input type="number" min="0" step="0.01" className="min-h-11 w-full rounded-lg border border-slate-200 px-3" value={form.quantityRemaining} onChange={(e) => setForm({ ...form, quantityRemaining: e.target.value })} /></Field>
            <Field label="单位"><select className="min-h-11 w-full rounded-lg border border-slate-200 px-3" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>{MEDICINE_UNITS.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></Field>
            <Field label="低库存阈值"><input type="number" min="0" step="0.01" className="min-h-11 w-full rounded-lg border border-slate-200 px-3" value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} /></Field>
            <Field label="开封时间"><input type="date" className="min-h-11 w-full rounded-lg border border-slate-200 px-3" value={form.openedAt} onChange={(e) => setForm({ ...form, openedAt: e.target.value })} /></Field>
            <Field label="过期日期"><input type="date" className="min-h-11 w-full rounded-lg border border-slate-200 px-3" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></Field>
            <Field label="提前提醒天数"><input type="number" min="0" max="3650" className="min-h-11 w-full rounded-lg border border-slate-200 px-3" value={form.expirationReminderDays} onChange={(e) => setForm({ ...form, expirationReminderDays: e.target.value })} /></Field>
            <Field label="存放位置"><input className="min-h-11 w-full rounded-lg border border-slate-200 px-3" placeholder="如：客厅药箱第二层" value={form.locationText} onChange={(e) => setForm({ ...form, locationText: e.target.value })} /></Field>
            <Field label="备注"><input className="min-h-11 w-full rounded-lg border border-slate-200 px-3" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>
          <Field label="药品内容（文字）"><textarea className="min-h-28 w-full rounded-lg border border-slate-200 p-3" placeholder="用法、注意事项、医嘱等；也可以在详情中上传内容照片" value={form.contentText} onChange={(e) => setForm({ ...form, contentText: e.target.value })} /></Field>
          <section className="space-y-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
            <div>
              <h3 className="font-semibold text-slate-950">{editing ? "编辑时补充附件" : "新建时上传附件"}</h3>
              <p className="mt-1 text-xs text-slate-500">可先选择已有图片，也可手机拍照；保存药品成功后会自动上传并关联到该药品。</p>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {medicineAttachmentTypes.map((type) => (
                <PendingAttachmentPicker
                  key={type}
                  type={type}
                  files={pendingAttachments[type]}
                  disabled={saving}
                  onAdd={addPendingAttachments}
                  onRemove={removePendingAttachment}
                />
              ))}
            </div>
          </section>
          <div className="flex justify-end gap-2"><Button type="button" className="bg-slate-100 text-slate-700 hover:bg-slate-200" onClick={() => setFormOpen(false)}>取消</Button><Button type="submit" disabled={saving}>{saving ? "保存中..." : "保存"}</Button></div>
        </form>
      ) : null}

      {loading ? <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-slate-500">加载药品...</div> : null}
      {!loading && filtered.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-slate-500">没有符合条件的药品</div> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {filtered.map((item) => (
          <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><h2 className="truncate text-lg font-semibold text-slate-950">{item.name}</h2><p className="mt-1 text-sm text-slate-500">{item.category}{item.tags ? ` · ${item.tags}` : ""}</p></div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(item.status)}`}>{getMedicineStatusLabel(item.status)}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600 sm:grid-cols-4">
              <p><span className="block text-xs text-slate-400">剩余量</span>{item.quantityRemaining ?? "-"}{item.unit}</p>
              <p><span className="block text-xs text-slate-400">过期日期</span>{formatDate(item.expiresAt)}</p>
              <p><span className="block text-xs text-slate-400">开封时间</span>{formatDate(item.openedAt)}</p>
              <p><span className="block text-xs text-slate-400">位置</span>{item.locationText || "未填写"}</p>
            </div>
            {item.contentText ? <p className="mt-3 line-clamp-2 text-sm text-slate-500">{item.contentText}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2"><Link className="inline-flex min-h-10 items-center rounded-lg bg-blue-600 px-3 text-sm font-medium text-white" href={`/medicines/${item.id}`}>查看明细</Link><Button type="button" className="bg-slate-100 text-slate-700 hover:bg-slate-200" onClick={() => openEdit(item)}>编辑</Button><Button type="button" className="bg-red-50 text-red-600 hover:bg-red-100" onClick={() => void deleteMedicine(item)}>归档</Button></div>
          </article>
        ))}
      </div>
    </div>
  );
}
