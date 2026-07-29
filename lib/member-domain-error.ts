export class MemberDomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: 400 | 404 | 409,
  ) {
    super(message);
    this.name = "MemberDomainError";
  }
}

export function memberErrorResponse(error: unknown, fallback: string) {
  if (error instanceof SyntaxError) return { body: { error: "Malformed JSON" }, status: 400 as const };
  if (error instanceof MemberDomainError) return { body: { error: error.message, code: error.code }, status: error.status };
  return { body: { error: fallback }, status: 500 as const };
}
