import { desc, eq } from "drizzle-orm";
import { db, hbgApplications } from "@workspace/db";

export const HBG_APPLICATIONS = [
  {
    id: "hbg-core",
    name: "HBG CORE",
    version: "1.0.0",
    status: "active",
    capabilities: ["action-router", "context", "memory"],
  },
  {
    id: "hbg-auth",
    name: "HBG-AUTH",
    version: "1.0.0",
    status: "active",
    capabilities: ["identity", "roles", "permissions", "development-sessions"],
  },
  {
    id: "terminador",
    name: "TERMINADOR IA",
    version: "1.0.0",
    status: "active",
    capabilities: ["operator", "code-tools", "audit"],
  },
  {
    id: "vibra",
    name: "VIBRA PRO",
    version: "1.0.0",
    status: "active",
    capabilities: ["music"],
  },
  {
    id: "instinto",
    name: "INSTINTO",
    version: "1.0.0",
    status: "active",
    capabilities: ["notes", "creativity"],
  },
];

export async function ensureApplicationRegistry(): Promise<void> {
  for (const application of HBG_APPLICATIONS) {
    await db
      .insert(hbgApplications)
      .values(application)
      .onConflictDoUpdate({
        target: hbgApplications.id,
        set: {
          name: application.name,
          version: application.version,
          status: application.status,
          capabilities: application.capabilities,
          updatedAt: new Date(),
        },
      });
  }
}

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