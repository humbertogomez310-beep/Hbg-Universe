import assert from "node:assert/strict";
import test from "node:test";
import { VOICE_COMMAND_CATALOG } from "./voiceCommandCatalog.ts";

test("voice command catalog has separate groups for Universe, VIBRA and INSTINTO", () => {
  assert.deepEqual(VOICE_COMMAND_CATALOG.map((group) => group.id), ["general", "vibra", "instinto"]);
});

test("voice command catalog examples are non-empty and displayable", () => {
  for (const group of VOICE_COMMAND_CATALOG) {
    assert.ok(group.label.trim());
    assert.ok(group.description.trim());
    assert.ok(group.commands.length > 0);
    for (const command of group.commands) {
      assert.ok(command.label.trim());
      assert.ok(command.phrases.length > 0);
      assert.ok(command.phrases.every((phrase) => phrase.trim().length > 0));
    }
  }
});

test("VIBRA catalog includes the natural pause phrases that must be understood", () => {
  const vibra = VOICE_COMMAND_CATALOG.find((group) => group.id === "vibra");
  const pause = vibra?.commands.find((command) => command.label === "Pausar");
  assert.deepEqual(pause?.phrases, ["Pausa", "Páusalo", "Pon pausa", "Ponlo en pausa", "Detén la música"]);
});
