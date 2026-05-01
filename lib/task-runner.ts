import { prisma } from "@/lib/prisma";

export type TaskRunRecord = {
  id: string;
  task: string;
  startedAt: string;
  finishedAt: string | null;
  success: boolean;
  summary: string | null;
};

/** 获取最近 50 条任务运行记录 */
export async function getTaskRunLogs(): Promise<TaskRunRecord[]> {
  return (await prisma.taskRunLog.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
  })).map((item) => ({
    id: item.id,
    task: item.task,
    startedAt: item.startedAt.toISOString(),
    finishedAt: item.finishedAt?.toISOString() ?? null,
    success: item.success,
    summary: item.summary,
  }));
}

/** 记录一次任务运行的开始 */
export async function startTaskRun(task: string): Promise<string> {
  const record = await prisma.taskRunLog.create({
    data: {
      task,
      startedAt: new Date(),
      success: false,
    },
  });
  return record.id;
}

/** 更新任务运行结果 */
export async function finishTaskRun(id: string, success: boolean, summary: string) {
  await prisma.taskRunLog.update({
    where: { id },
    data: {
      finishedAt: new Date(),
      success,
      summary,
    },
  });
}
