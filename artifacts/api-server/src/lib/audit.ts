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

const SECRET_KEY_PATTERN =
  /(secret|token|password|credential|authorization|cookie|private.?key)/i;

function safeMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!metadata) return {};
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => !SECRET_KEY_PATTERN.test(key))
      .map(([key, value]) => [
        key,
        typeof value === "string" && SECRET_KEY_PATTERN.test(value)
          ? "[REDACTED]"
          : value,
      ]),
  );
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