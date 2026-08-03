export type ActorRole = "ADMIN" | "MEMBER" | string;

export interface AuthActor {
  userId: string;
  role: ActorRole;
  displayName: string;
}

export interface AuthStatusResponse {
  otpConfigured: boolean;
  authenticated: boolean;
  actor: AuthActor | null;
}

export interface ApiErrorPayload {
  error?: string | { message?: string };
  message?: string;
  statusMessage?: string;
  data?: ApiErrorPayload;
  errors?: Array<{ message?: string } | string>;
}

export interface ApiError extends Error {
  statusCode: number;
  data?: unknown;
}
