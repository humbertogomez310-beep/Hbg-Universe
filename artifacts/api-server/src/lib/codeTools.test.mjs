import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  deleteFile,
  inspectFile,
  listFiles,
  runSafeWorkspaceScript,
  writeFile as writeWorkspaceFile,
} from "./codeTools.ts";

test("Code Tools block traversal, protected files, symlink escapes, and unauthenticated writes", async () => {
  const workspaceRoot = path.resolve(process.cwd(), "../..");
  const fixtureName = `.terminador-code-tools-test-${process.pid}-${Date.now()}`;
  const fixturePath = path.join(workspaceRoot, fixtureName);
  const outsideDirectory = await mkdtemp(path.join(os.tmpdir(), "terminador-tools-"));
  const outsideFile = path.join(outsideDirectory, "outside.txt");

  try {
    await mkdir(fixturePath);
    await mkdir(path.join(fixturePath, "safe"));
    await writeFile(outsideFile, "outside");
    await writeFile(path.join(fixturePath, "safe", "internal.txt"), "internal");
    await symlink(outsideDirectory, path.join(fixturePath, "outside-link"));
    await symlink(outsideFile, path.join(fixturePath, "file-link"));
    await symlink(path.join(fixturePath, "safe"), path.join(fixturePath, "internal-link"));
    await writeFile(path.join(fixturePath, "inside.txt"), "inside");

    await assert.rejects(inspectFile("../package.json"), /traversal/i);
    await assert.rejects(inspectFile(".env.local"), /protegido/i);
    await assert.rejects(
      inspectFile("artifacts/api-server/src/lib/terminadorAuthorization.ts"),
      /protegido/i,
    );
    await assert.rejects(
      inspectFile("artifacts/api-server/src/routes/terminador.ts"),
      /protegido/i,
    );
    await assert.rejects(
      writeWorkspaceFile("artifacts/api-server/src/lib/terminadorAuthorization.ts", "tampered"),
      /protegido/i,
    );
    await assert.rejects(
      deleteFile("artifacts/api-server/src/lib/hbgAuth.ts"),
      /protegido/i,
    );
    await assert.rejects(inspectFile(`${fixtureName}/outside-link/outside.txt`), /simbólicos/i);
    await assert.rejects(inspectFile(`${fixtureName}/file-link`), /simbólicos/i);
    await assert.rejects(inspectFile(`${fixtureName}/internal-link/internal.txt`), /simbólicos/i);
    await assert.rejects(listFiles(`${fixtureName}/internal-link`), /simbólicos|cambió/i);
    await assert.rejects(
      writeWorkspaceFile(`${fixtureName}/file-link`, "changed"),
      /contexto autenticado/i,
    );
    await assert.rejects(deleteFile(`${fixtureName}/file-link`), /contexto autenticado/i);
    await assert.rejects(
      writeWorkspaceFile(`${fixtureName}/created.txt`, "inside"),
      /contexto autenticado/i,
    );
    await assert.rejects(
      deleteFile(`${fixtureName}/inside.txt`),
      /contexto autenticado/i,
    );

    const listed = await listFiles(fixtureName);
    assert.deepEqual(listed.map((entry) => entry.name).sort(), ["inside.txt"]);
    assert.equal(
      (await inspectFile(`${fixtureName}/inside.txt`)).content,
      "inside",
    );
    assert.equal(await readFile(path.join(fixturePath, "inside.txt"), "utf8"), "inside");
    assert.equal(await readFile(outsideFile, "utf8"), "outside");
  } finally {
    await rm(fixturePath, { recursive: true, force: true });
    await rm(outsideDirectory, { recursive: true, force: true });
  }
});

test("Code Tools never executes mutable workspace package scripts", async () => {
  await assert.rejects(
    runSafeWorkspaceScript("@workspace/api-server", "test"),
    /ejecución de comandos.*bloqueada/i,
  );
});


test(
  "Code Tools writes and deletes only with a live owner development session and an exact path grant",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const { randomUUID } = await import("node:crypto");
    const { eq } = await import("drizzle-orm");
    const {
      db,
      hbgDevelopmentSessions,
      hbgPermissionGrants,
      hbgSessions,
      hbgUsers,
      pool,
    } = await import("@workspace/db");
    const { hashSecret, permissionsFor } = await import("./hbgAuth.ts");
    const { createPermissionGrant } = await import("./permissionGrants.ts");

    const username = `code_tools_test_${randomUUID().replaceAll("-", "")}`;
    const [owner] = await db
      .insert(hbgUsers)
      .values({ username, role: "owner" })
      .returning();
    assert.ok(owner);

    const sessionTokenHash = hashSecret(randomUUID());
    const developmentSessionTokenHash = hashSecret(randomUUID());
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const resourcePath = `.code-tools-authorized-${randomUUID()}.txt`;
    const workspaceRoot = path.resolve(process.cwd(), "../..");
    const absolutePath = path.join(workspaceRoot, resourcePath);
    const context = {
      user: owner,
      role: "owner",
      permissions: permissionsFor(owner),
      isDevelopment: true,
      sessionTokenHash,
      sessionExpiresAt: expiresAt,
      developmentSessionTokenHash,
      developmentSessionExpiresAt: expiresAt,
    };

    try {
      await db.insert(hbgSessions).values({
        tokenHash: sessionTokenHash,
        userId: owner.id,
        expiresAt,
      });
      await db.insert(hbgDevelopmentSessions).values({
        tokenHash: developmentSessionTokenHash,
        userId: owner.id,
        purpose: "Code Tools integration test",
        expiresAt,
      });

      await assert.rejects(
        writeWorkspaceFile(resourcePath, "must not be written", context),
        (error) => error?.code === "PERMISSION_GRANT_REQUIRED",
      );

      await createPermissionGrant(context, {
        permission: "universe.code.modify",
        resourcePath,
        reason: "Integration test: exact-path write and delete.",
      });
      await writeWorkspaceFile(resourcePath, "authorized content", context);
      assert.equal(await readFile(absolutePath, "utf8"), "authorized content");

      await deleteFile(resourcePath, context);
      await assert.rejects(readFile(absolutePath, "utf8"), { code: "ENOENT" });
    } finally {
      await rm(absolutePath, { force: true });
      await db.delete(hbgPermissionGrants).where(eq(hbgPermissionGrants.ownerUserId, owner.id));
      await db.delete(hbgSessions).where(eq(hbgSessions.userId, owner.id));
      await db.delete(hbgDevelopmentSessions).where(eq(hbgDevelopmentSessions.userId, owner.id));
      await db.delete(hbgUsers).where(eq(hbgUsers.id, owner.id));
      await pool.end();
    }
  },
);
