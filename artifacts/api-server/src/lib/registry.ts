import { desc, eq } from "drizzle-orm";
import { db, hbgApplications } from "@workspace/db";
import { recordAudit } from "./audit";

const DEFAULT_APPLICATIONS: (typeof hbgApplications.$inferInsert)[] = [
  {
    id: "hbg-core",
    name: "HBG CORE",
    version: "0.0.0",
    status: "active",
    capabilities: ["core", "voice", "memory", "operator"],
  },
  {
    id: "hbg-auth",
    name: "HBG AUTHORITY",
    version: "0.0.0",
    status: "active",
    capabilities: [
      "authority",
      "authentication",
      "permissions",
      "audit",
      "code-tools",
      "development-sessions",
      "operator",
    ],
  },
  {
    id: "universo",
    name: "UNIVERSO HBG",
    version: "0.0.0",
    status: "active",
    capabilities: ["dashboard", "pwa", "operator"],
  },
  {
    id: "instinto",
    name: "INSTINTO",
    version: "0.0.0",
    status: "active",
    capabilities: ["notes", "lyrics", "projects", "offline"],
  },
  {
    id: "vibra",
    name: "VIBRA PRO",
    version: "0.0.0",
    status: "active",
    capabilities: ["audio", "library", "playlists", "offline"],
  },
  {
    id: "terminador",
    name: "TERMINADOR IA",
    version: "0.0.0",
    status: "active",
    capabilities: ["automation", "registry", "operator"],
  },
];

export async function ensureDefaultApplications() {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(hbgApplications)
      .values(DEFAULT_APPLICATIONS)
      .onConflictDoNothing({ target: hbgApplications.id })
      .returning();

    for (const application of inserted) {
      await recordAudit(
        {
          action: "registry.application.seeded",
          resource: `application:${application.id}`,
          result: "success",
          metadata: {
            applicationId: application.id,
            name: application.name,
            version: application.version,
            capabilities: application.capabilities,
          },
        },
        tx,
      );
    }

    return inserted;
  });
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
    application.id === "universo" ||
    application.id === "terminador" ||
    ["HBG-AUTH", "HBG CORE"].includes(application.name.trim().toUpperCase()) ||
    capabilities.includes("operator")
  );
}
