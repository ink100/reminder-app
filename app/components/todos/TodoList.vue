<script setup lang="ts">
type TodoItem = {
  id: string;
  title: string;
  completedAt: string | null;
  createdAt: string;
};

const props = defineProps<{ initialTodos: TodoItem[] }>();
const { apiFetch } = useApi();
const todos = ref([...props.initialTodos]);
const newTitle = ref("");
const editingId = ref<string | null>(null);
const editTitle = ref("");
const busyIds = ref(new Set<string>());

const pending = computed(() => todos.value.filter(item => !item.completedAt));
const completed = computed(() => todos.value.filter(item => item.completedAt));

async function addTodo() {
  const title = newTitle.value.trim();
  if (!title) return;
  try {
    const result = await apiFetch<{ item: TodoItem }>("/api/todos", { method: "POST", body: { title } });
    todos.value.unshift(result.item);
    newTitle.value = "";
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "新增失败");
  }
}

async function toggleTodo(todo: TodoItem) {
  if (busyIds.value.has(todo.id)) return;
  busyIds.value.add(todo.id);
  const previous = todo.completedAt;
  todo.completedAt = previous ? null : new Date().toISOString();
  try {
    const result = await apiFetch<{ item: TodoItem }>(`/api/todos/${todo.id}`, {
      method: "PATCH",
      body: { completed: !previous },
    });
    Object.assign(todo, result.item);
  } catch (error) {
    todo.completedAt = previous;
    ElMessage.error(error instanceof Error ? error.message : "更新失败");
  } finally {
    busyIds.value.delete(todo.id);
  }
}

function startEdit(todo: TodoItem) {
  editingId.value = todo.id;
  editTitle.value = todo.title;
}

async function saveEdit(todo: TodoItem) {
  if (editingId.value !== todo.id) return;
  const title = editTitle.value.trim();
  if (!title) {
    ElMessage.warning("标题不能为空");
    return;
  }
  editingId.value = null;
  const previous = todo.title;
  todo.title = title;
  try {
    const result = await apiFetch<{ item: TodoItem }>(`/api/todos/${todo.id}`, { method: "PATCH", body: { title } });
    Object.assign(todo, result.item);
  } catch (error) {
    todo.title = previous;
    ElMessage.error(error instanceof Error ? error.message : "保存失败");
  }
}

async function deleteTodo(todo: TodoItem) {
  try {
    await ElMessageBox.confirm(`确定要删除「${todo.title}」吗？此操作不可撤销。`, "删除待办事项", { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" });
    await apiFetch(`/api/todos/${todo.id}`, { method: "DELETE" });
    todos.value = todos.value.filter(item => item.id !== todo.id);
  } catch (error) {
    if (error !== "cancel" && error !== "close") ElMessage.error(error instanceof Error ? error.message : "删除失败");
  }
}
</script>

<template>
  <section class="todo-page">
    <h1>📋 待办事项</h1>
    <div class="add-row">
      <ElInput v-model="newTitle" autofocus clearable maxlength="200" placeholder="添加新的待办事项…" aria-label="新待办标题" @keyup.enter="addTodo" />
      <ElButton type="primary" :disabled="!newTitle.trim()" @click="addTodo">新增</ElButton>
    </div>

    <ElEmpty v-if="!todos.length" description="暂无待办事项，添加一个吧。" />
    <template v-else>
      <div v-for="section in [{ label: '待处理', items: pending }, { label: '已完成', items: completed }]" :key="section.label" class="todo-section">
        <template v-if="section.items.length">
          <h2>{{ section.label }} · {{ section.items.length }}</h2>
          <div class="todo-list">
            <div v-for="todo in section.items" :key="todo.id" class="todo-row" :class="{ done: !!todo.completedAt }">
              <ElCheckbox :model-value="!!todo.completedAt" :disabled="busyIds.has(todo.id)" :aria-label="todo.completedAt ? '取消完成' : '标记完成'" @change="toggleTodo(todo)" />
              <ElInput v-if="editingId === todo.id" v-model="editTitle" maxlength="200" aria-label="编辑待办标题" autofocus @keyup.enter="saveEdit(todo)" @keyup.esc="editingId = null" @blur="saveEdit(todo)" />
              <button v-else class="todo-title" type="button" @click="startEdit(todo)">{{ todo.title }}</button>
              <span v-if="todo.completedAt" class="completed-date">{{ new Date(todo.completedAt).toLocaleDateString('zh-CN') }}</span>
              <ElButton text aria-label="编辑" @click="startEdit(todo)">编辑</ElButton>
              <ElButton text type="danger" aria-label="删除" @click="deleteTodo(todo)">删除</ElButton>
            </div>
          </div>
        </template>
      </div>
    </template>
  </section>
</template>

<style scoped>
.todo-page{max-width:760px;margin:auto}.todo-page h1{margin:0 0 24px;font-size:24px}.add-row{display:flex;gap:10px;margin-bottom:28px}.todo-section{margin-top:24px}.todo-section h2{color:#64748b;font-size:13px;text-transform:uppercase}.todo-list{display:grid;gap:8px}.todo-row{display:flex;align-items:center;gap:10px;min-width:0;padding:10px 14px;border:1px solid #e2e8f0;border-radius:10px;background:#fff}.todo-row.done{background:#f8fafc}.todo-title{flex:1;min-width:0;padding:6px 0;border:0;background:none;text-align:left;color:#334155;cursor:pointer;overflow-wrap:anywhere}.done .todo-title{text-decoration:line-through;color:#94a3b8}.completed-date{font-size:11px;color:#94a3b8}@media(max-width:600px){.completed-date{display:none}.todo-row{padding:8px}.todo-row :deep(.el-button){padding:6px}}
</style>
