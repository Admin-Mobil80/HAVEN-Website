import { test } from "node:test";
import assert from "node:assert/strict";
import { emergencyNumber } from "../src/domain/people.js";
import { guardReply } from "../src/domain/guards.js";
import { compilePersona } from "../src/domain/persona.js";
import { demoPresetHousehold } from "../src/domain/demoPreset.js";
import { alertBody } from "../src/mcp/tools/escalation.js";

test("the emergency number follows the household: 911 in the US, 112 otherwise", () => {
  assert.equal(emergencyNumber({ language: "en-US" }), "911");
  assert.equal(emergencyNumber({ language: "en-IN" }), "112");
  assert.equal(emergencyNumber({ language: "hi-IN" }), "112");

  const us = demoPresetHousehold("demo-us", new Date());
  assert.match(compilePersona(us), /call 911 now/);
  assert.doesNotMatch(compilePersona(us), /112/);
  assert.match(alertBody(us, { emergency: true, elderWords: "I fell" }), /call 911 in danger/);
  const out = guardReply("I have called an ambulance for you.", { childName: "Daniel", calledBy: "Mom", emergency: "911" });
  assert.match(out.text, /please call 911 now/);
});
