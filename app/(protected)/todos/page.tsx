import { prisma } from "@/lib/prisma";
import { TodoList } from "@/components/todos/todo-list";

export const dynamic = "force-dynamic";

export default async function TodosPage() {
  const todos = await prisma.todo.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const items = todos.map((t) => ({
    id: t.id,
    title: t.title,
    completedAt: t.completedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
  }));

  return <TodoList initialTodos={items} />;
}
