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