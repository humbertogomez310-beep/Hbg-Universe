export type HBGErrorCode =
  | "INVALID_MODULE"
  | "ACTION_HANDLER_FAILED"
  | "ACTION_TIMEOUT"
  | "ACTION_CANCELLED"
  | "MEMORY_SERIALIZATION_FAILED";

export class HBGError extends Error {
  readonly code: HBGErrorCode;

  constructor(code: HBGErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "HBGError";
    this.code = code;
    if (options && "cause" in options) {
      this.cause = options.cause;
    }
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Error desconocido en HBG CORE";
}

export function toActionError(error: unknown, requestId: string) {
  const message = errorMessage(error);
  return {
    success: false as const,
    error: message,
    code: "ACTION_HANDLER_FAILED",
    requestId,
  };
}