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

test("Code Tools block traversal, protected files, symlink escapes, and all writes", async () => {
  const workspaceRoot = path.resolve(process.cwd(), "../..");
  const fixtureName = `.terminador-code-tools-test-${process.pid}-${Date.now()}`;
  const fixturePath = path.join(workspaceRoot, fixtureName);
  const outsideDirectory = await mkdtemp(path.join(os.tmpdir(), "terminador-tools-"));
  const outsideFile = path.join(outsideDirectory, "outside.txt");

  try {
    await mkdir(fixturePath);
    await writeFile(outsideFile, "outside");
    await symlink(outsideDirectory, path.join(fixturePath, "outside-link"));
    await symlink(outsideFile, path.join(fixturePath, "file-link"));
    await writeFile(path.join(fixturePath, "inside.txt"), "inside");

    await assert.rejects(inspectFile("../package.json"), /traversal/i);
    await assert.rejects(inspectFile(".env.local"), /protegido/i);
    await assert.rejects(inspectFile(`${fixtureName}/outside-link/outside.txt`), /simbólicos/i);
    await assert.rejects(inspectFile(`${fixtureName}/file-link`), /simbólicos/i);
    await assert.rejects(
      writeWorkspaceFile(`${fixtureName}/file-link`, "changed"),
      /modificaciones.*bloqueadas/i,
    );
    await assert.rejects(deleteFile(`${fixtureName}/file-link`), /modificaciones.*bloqueadas/i);
    await assert.rejects(
      writeWorkspaceFile(`${fixtureName}/created.txt`, "inside"),
      /modificaciones.*bloqueadas/i,
    );
    await assert.rejects(
      deleteFile(`${fixtureName}/inside.txt`),
      /modificaciones.*bloqueadas/i,
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
