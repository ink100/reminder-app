"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AlertDialog } from "@/components/ui/alert-dialog";

type TodoItem = {
  id: string;
  title: string;
  completedAt: string | null;
  createdAt: string;
};

export function TodoList({ initialTodos }: { initialTodos: TodoItem[] }) {
  const [todos, setTodos] = useState<TodoItem[]>(initialTodos);
  const [newTitle, setNewTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addTodo = useCallback(async () => {
    const title = newTitle.trim();
    if (!title) return;

    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      const { item } = await res.json();
      setTodos((prev) => [item, ...prev]);
      setNewTitle("");
      inputRef.current?.focus();
    }
  }, [newTitle]);

  const toggleTodo = useCallback(async (id: string, currentCompleted: boolean) => {
    const now = new Date().toISOString();
    setTodos((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, completedAt: currentCompleted ? null : now }
          : t
      )
    );

    await fetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !currentCompleted }),
    });
  }, []);

  const deleteTodo = useCallback(async (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/todos/${id}`, { method: "DELETE" });
  }, []);

  const startEdit = useCallback((todo: TodoItem) => {
    setEditingId(todo.id);
    setEditTitle(todo.title);
  }, []);

  const saveEdit = useCallback(async (id: string) => {
    const title = editTitle.trim();
    if (!title) return;

    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title } : t))
    );
    setEditingId(null);

    await fetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  }, [editTitle]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (editingId) {
          saveEdit(editingId);
        } else {
          addTodo();
        }
      }
      if (e.key === "Escape" && editingId) {
        setEditingId(null);
      }
    },
    [addTodo, saveEdit, editingId]
  );

  const pending = todos.filter((t) => !t.completedAt);
  const done = todos.filter((t) => t.completedAt);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-balance text-slate-900">
        📋 待办事项
      </h1>

      {/* Add input */}
      <div className="mb-6 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="添加新的待办事项…"
          className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          autoFocus
        />
        <button
          onClick={addTodo}
          disabled={!newTitle.trim()}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          新增
        </button>
      </div>

      {/* Empty state */}
      {pending.length === 0 && done.length === 0 ? (
        <p className="py-12 text-center text-sm text-pretty text-slate-400">
          暂无待办事项，添加一个吧。
        </p>
      ) : (
        <>
          {/* Pending section */}
          {pending.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-3 text-xs font-semibold uppercase text-slate-400">
                待处理 · {pending.length}
              </h2>
              <ul className="space-y-1.5">
                {pending.map((todo) => (
                  <TodoRow
                    key={todo.id}
                    todo={todo}
                    isEditing={editingId === todo.id}
                    editTitle={editTitle}
                    onEditTitleChange={setEditTitle}
                    onToggle={() => toggleTodo(todo.id, false)}
                    onDelete={() => deleteTodo(todo.id)}
                    onStartEdit={() => startEdit(todo)}
                    onSaveEdit={() => saveEdit(todo.id)}
                    onKeyDown={handleKeyDown}
                  />
                ))}
              </ul>
            </div>
          )}

          {/* Done section */}
          {done.length > 0 && (
            <div>
              <h2 className="mb-3 text-xs font-semibold uppercase text-slate-400">
                已完成 · {done.length}
              </h2>
              <ul className="space-y-1.5">
                {done.map((todo) => (
                  <TodoRow
                    key={todo.id}
                    todo={todo}
                    isEditing={editingId === todo.id}
                    editTitle={editTitle}
                    onEditTitleChange={setEditTitle}
                    onToggle={() => toggleTodo(todo.id, true)}
                    onDelete={() => deleteTodo(todo.id)}
                    onStartEdit={() => startEdit(todo)}
                    onSaveEdit={() => saveEdit(todo.id)}
                    onKeyDown={handleKeyDown}
                  />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TodoRow({
  todo,
  isEditing,
  editTitle,
  onEditTitleChange,
  onToggle,
  onDelete,
  onStartEdit,
  onSaveEdit,
  onKeyDown,
}: {
  todo: TodoItem;
  isEditing: boolean;
  editTitle: string;
  onEditTitleChange: (v: string) => void;
  onToggle: () => void;
  onDelete: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const isDone = !!todo.completedAt;

  return (
    <li
      className={cn(
        "group flex items-center gap-3 rounded-lg border px-4 py-2.5 transition-colors",
        isDone
          ? "border-slate-100 bg-slate-50/50"
          : "border-slate-200 bg-white hover:border-slate-300"
      )}
    >
      {/* Checkbox */}
      <button
        onClick={onToggle}
        aria-label={isDone ? "标记待办" : "标记完成"}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          isDone
            ? "border-blue-500 bg-blue-500 text-white"
            : "border-slate-300 hover:border-blue-400"
        )}
      >
        {isDone && (
          <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Title / Edit */}
      {isEditing ? (
        <input
          type="text"
          value={editTitle}
          onChange={(e) => onEditTitleChange(e.target.value)}
          onKeyDown={onKeyDown}
          className="flex-1 rounded border border-blue-400 bg-white px-2 py-0.5 text-sm text-slate-900 outline-none ring-2 ring-blue-500/20"
          autoFocus
          onBlur={onSaveEdit}
        />
      ) : (
        <span
          className={cn(
            "flex-1 cursor-pointer text-sm",
            isDone ? "text-slate-400 line-through" : "text-slate-700"
          )}
          onClick={onStartEdit}
        >
          {todo.title}
        </span>
      )}

      {/* Actions — show on hover */}
      {!isEditing && (
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {/* Undo button (only for done items) */}
          {isDone && (
            <button
              onClick={onToggle}
              aria-label="取消完成"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-amber-500"
            >
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </button>
          )}
          {/* Delete button — wrapped in AlertDialog */}
          <AlertDialog
            trigger={
              <button
                aria-label="删除"
                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
              >
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            }
            title="删除待办事项"
            description={`确定要删除「${todo.title}」吗？此操作不可撤销。`}
            confirmLabel="删除"
            onConfirm={onDelete}
          />
        </div>
      )}

      {/* Completed date */}
      {isDone && todo.completedAt && (
        <span className="hidden shrink-0 text-[11px] text-slate-400 group-hover:hidden sm:inline">
          {new Date(todo.completedAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
        </span>
      )}
    </li>
  );
}
