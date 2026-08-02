import { requireAdminApi } from "@/lib/admin-api";
import { getSchedulerStatus } from "@/lib/scheduler";
import { getTaskRunLogs } from "@/lib/task-runner";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  const session = auth.actor;

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [tasks, logs] = await Promise.all([
    Promise.resolve(getSchedulerStatus()),
    getTaskRunLogs(),
  ]);

  return Response.json({ tasks, logs });
}
