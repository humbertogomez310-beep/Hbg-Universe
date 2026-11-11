import { desc, eq } from "drizzle-orm";
import { db, hbgApplications } from "@workspace/db";

export async function listApplications() {
  return db
    .select()
    .from(hbgApplications)
    .orderBy(desc(hbgApplications.updatedAt));
}

export async function getApplication(id: string) {
  const result = await db
    .select()
    .from(hbgApplications)
    .where(eq(hbgApplications.id, id))
    .limit(1);
  return result[0];
}

export function isProtectedApplication(application: {
  id: string;
  name: string;
  capabilities: unknown;
}): boolean {
  const capabilities = Array.isArray(application.capabilities)
    ? application.capabilities.filter(
        (capability): capability is string => typeof capability === "string",
      )
    : [];
  return (
    application.id === "hbg-auth" ||
    application.id === "hbg-core" ||
    ["HBG-AUTH", "HBG CORE"].includes(application.name.trim().toUpperCase()) ||
    capabilities.includes("operator")
  );
}