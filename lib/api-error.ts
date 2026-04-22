import { ZodError } from "zod";

type ApiErrorOptions = {
  defaultMessage?: string;
  notFoundMessage?: string;
  internalMessage?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNotFoundError(error: unknown) {
  return isObject(error) && error.code === "P2025";
}

function isJsonSyntaxError(error: unknown) {
  return error instanceof SyntaxError;
}

export function toApiErrorResponse(error: unknown, options: ApiErrorOptions = {}) {
  const defaultMessage = options.defaultMessage ?? "请求参数不合法";
  const notFoundMessage = options.notFoundMessage ?? "Not found";
  const internalMessage = options.internalMessage ?? "Internal server error";

  if (error instanceof ZodError || isJsonSyntaxError(error)) {
    return Response.json({ error: defaultMessage }, { status: 400 });
  }

  if (isNotFoundError(error)) {
    return Response.json({ error: notFoundMessage }, { status: 404 });
  }

  return Response.json({ error: internalMessage }, { status: 500 });
}
