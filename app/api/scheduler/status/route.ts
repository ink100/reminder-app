import { requireApiSession } from "@/lib/auth";
import { getSchedulerStatus } from "@/lib/scheduler";
import { getTaskRunLogs } from "@/lib/task-runner";

export async function GET() {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [tasks, logs] = await Promise.all([
    Promise.resolve(getSchedulerStatus()),
    getTaskRunLogs(),
  ]);

  return Response.json({ tasks, logs });
}
