import { db, hbgAuditEvents } from "@workspace/db";

export interface AuditInput {
  actorUserId?: string;
  action: string;
  resource: string;
  result: "success" | "failure" | "denied";
  errorCode?: string;
  metadata?: Record<string, unknown>;
}

type AuditWriter = Pick<typeof db, "insert">;

const SECRET_METADATA_KEY_PATTERN =
  /(secret|token|password|passwd|credential|authorization|cookie|private.?key|api.?key|access.?key|bearer|session.?id)/i;
const SENSITIVE_VALUE_MARKER_PATTERN =
  /(secret|token|password|passwd|credential|authorization|cookie|private.?key|api.?key|access.?key|bearer)/i;

function sanitizeAuditValue(
  value: unknown,
  seen: WeakSet<object>,
): unknown {
  if (typeof value === "string") {
    return SENSITIVE_VALUE_MARKER_PATTERN.test(value) ? "[REDACTED]" : value;
  }
  if (
    value === null ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value !== "object") {
    return undefined;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (Buffer.isBuffer(value)) {
    return "[REDACTED_BINARY]";
  }
  if (seen.has(value)) {
    return "[CIRCULAR]";
  }

  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.map((item) => {
      const sanitized = sanitizeAuditValue(item, seen);
      return sanitized === undefined ? null : sanitized;
    });
    seen.delete(value);
    return result;
  }

  const result = Object.create(null) as Record<string, unknown>;
  for (const [key, nestedValue] of Object.entries(value)) {
    if (SECRET_METADATA_KEY_PATTERN.test(key)) continue;
    const sanitized = sanitizeAuditValue(nestedValue, seen);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  seen.delete(value);
  return result;
}

function safeMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!metadata) return {};
  const sanitized = sanitizeAuditValue(metadata, new WeakSet());
  return typeof sanitized === "object" && sanitized !== null && !Array.isArray(sanitized)
    ? sanitized as Record<string, unknown>
    : {};
}

export async function recordAudit(
  input: AuditInput,
  writer: AuditWriter = db,
): Promise<void> {
  await writer.insert(hbgAuditEvents).values({
    actorUserId: input.actorUserId,
    action: input.action,
    resource: input.resource,
    result: input.result,
    errorCode: input.errorCode,
    metadata: safeMetadata(input.metadata),
  });
}