import assert from "node:assert/strict";
import test from "node:test";
import {
  createTerminadorPlan,
  executeTerminadorPlan,
} from "./terminadorPlanner.ts";

test("a client confirmation flag cannot authorize an app state change", async () => {
  const plan = createTerminadorPlan({
    providerId: "test",
    originalText: "apaga la app Demo",
    normalizedText: "apaga la app demo",
    operations: [{
      type: "apps.set_status",
      target: "Demo",
      status: "disabled",
    }],
    module: "terminador",
    entities: [],
    confidence: 1,
    requiresClarification: false,
    explanation: "test",
  });
  let executions = 0;

  const result = await executeTerminadorPlan(
    plan,
    async () => {
      executions += 1;
    },
    { authorized: true },
  );

  assert.equal(result.tasks[0].state, "blocked");
  assert.match(result.tasks[0].reason, /autorización individual server-side/i);
  assert.equal(executions, 0);
});
