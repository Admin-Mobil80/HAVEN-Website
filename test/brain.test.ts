import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { BedrockRuntimeClient, ContentBlock, ConverseCommandInput } from "@aws-sdk/client-bedrock-runtime";
import { BrainUnavailableError, LIMITS, parseResponse, resetModelQuirks, think, type BrainInput } from "../src/agent/brain.js";

type Reply = ContentBlock[] | Error | "hang";
type Sent = { input: ConverseCommandInput; signal?: AbortSignal };

// Fake Bedrock: answers per modelId from a queue; "hang" never resolves until aborted.
function fakeBedrock(replies: Record<string, Reply[]>) {
  const sent: Sent[] = [];
  const client = {
    send(cmd: { input: ConverseCommandInput }, opts?: { abortSignal?: AbortSignal }) {
      sent.push({ input: cmd.input, signal: opts?.abortSignal });
      const next = replies[cmd.input.modelId!]?.shift();
      if (!next) return Promise.reject(new Error("no canned reply"));
      if (next === "hang") {
        return new Promise((_, reject) => opts?.abortSignal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
      }
      if (next instanceof Error) return Promise.reject(next);
      return Promise.resolve({ output: { message: { role: "assistant", content: next } }, stopReason: "tool_use" });
    },
  };
  return { client: client as unknown as BedrockRuntimeClient, sent };
}

const toolUse = (input: unknown): ContentBlock[] => [{ toolUse: { toolUseId: "t1", name: "respond", input: input as never } }];

const INPUT: BrainInput = {
  persona: "You are Digital Priya, an AI. Never claim to be the real Priya.",
  context: "Memories: has knee physio on Tuesdays.",
  turns: [
    { speaker: "avatar", text: "Hi Amma! How was physio?" },
    { speaker: "elder", text: "Tiring, kanna." },
  ],
  elderText: "I met Saroja at the temple today.",
};

const M1 = "model-a";
const M2 = "model-b";

beforeEach(() => resetModelQuirks());

test("parses the respond tool call and sends one well-formed Converse request", async () => {
  const { client, sent } = fakeBedrock({
    [M1]: [toolUse({ say: "Saroja! Achha Amma, tell me more.", remember: [{ type: "person", content: "Met Saroja at the temple; they used to sing together" }], concern: "none" })],
  });
  const out = await think(INPUT, { client, modelIds: [M1, M2] });
  assert.equal(out.say, "Saroja! Achha Amma, tell me more.");
  assert.deepEqual(out.remember, [{ type: "person", content: "Met Saroja at the temple; they used to sing together" }]);
  assert.equal(out.send_to_priya, undefined);
  assert.equal(out.concern, undefined, "none is normalised away");
  assert.equal(out.modelId, M1);
  assert.ok(out.latencyMs >= 0);

  assert.equal(sent.length, 1);
  const req = sent[0].input;
  assert.equal(req.modelId, M1);
  assert.deepEqual(req.system, [{ text: INPUT.persona }]);
  assert.deepEqual(req.inferenceConfig, { maxTokens: 300, temperature: 0.4 });
  assert.deepEqual(req.toolConfig?.toolChoice, { tool: { name: "respond" } });
  assert.equal(req.toolConfig?.tools?.length, 1);
  const spec = req.toolConfig!.tools![0].toolSpec!;
  assert.equal(spec.name, "respond");
  const schema = spec.inputSchema!.json as { properties: Record<string, { enum?: string[] }>; required: string[] };
  assert.deepEqual(Object.keys(schema.properties).sort(), ["concern", "remember", "say", "send_to_priya"]);
  assert.deepEqual(schema.properties.concern.enum, ["none", "not_eating", "poor_sleep", "low_mood", "lonely", "pain", "confused"]);
  assert.equal(req.messages?.length, 1);
  assert.equal(req.messages![0].role, "user");
  const text = req.messages![0].content![0].text!;
  assert.match(text, /knee physio on Tuesdays/);
  assert.match(text, /You: Hi Amma! How was physio\?/);
  assert.match(text, /Elder: Tiring, kanna\./);
  assert.match(text, /I met Saroja at the temple today\./);
  assert.ok(sent[0].signal, "an abort signal is passed for the timeout");
});

test("returns send_to_priya and a known concern", async () => {
  const { client } = fakeBedrock({
    [M1]: [toolUse({ say: "I'll ask you before sending it, Amma.", remember: [], send_to_priya: "The jasmine has bloomed", concern: "Not Eating" })],
  });
  const out = await think(INPUT, { client, modelIds: [M1] });
  assert.equal(out.send_to_priya, "The jasmine has bloomed");
  assert.equal(out.concern, "not_eating");
});

test("falls back to JSON in a plain-text answer when the model ignores toolChoice", async () => {
  const { client } = fakeBedrock({
    [M1]: [[{ text: '<reasoning>user wants chat</reasoning>```json\n{"say":"Achha Amma, so nice.","remember":"[{\\"type\\":\\"event\\",\\"content\\":\\"Visited the temple\\"}]","concern":"lonely"}\n```' }]],
  });
  const out = await think(INPUT, { client, modelIds: [M1] });
  assert.equal(out.say, "Achha Amma, so nice.");
  assert.deepEqual(out.remember, [{ type: "event", content: "Visited the temple" }]);
  assert.equal(out.concern, "lonely");
});

test("unwraps arguments nested inside a function-call shaped JSON answer", async () => {
  const { client } = fakeBedrock({
    [M1]: [[{ text: 'Sure. {"name":"respond","arguments":"{\\"say\\":\\"Hello Amma.\\",\\"remember\\":[]}"}' }]],
  });
  assert.equal((await think(INPUT, { client, modelIds: [M1] })).say, "Hello Amma.");
});

test("uses plain prose as say with no actions", async () => {
  const { client } = fakeBedrock({ [M1]: [[{ text: "Arre Amma, that sounds lovely. Tell me more!" }]] });
  const out = await think(INPUT, { client, modelIds: [M1] });
  assert.equal(out.say, "Arre Amma, that sounds lovely. Tell me more!");
  assert.deepEqual(out.remember, []);
  assert.equal(out.send_to_priya, undefined);
  assert.equal(out.concern, undefined);
});

test("clips and validates every field so bad output stays in bounds", async () => {
  const long = "word ".repeat(120);
  const { client } = fakeBedrock({
    [M1]: [
      toolUse({
        say: "One. Two! Three? Four.",
        remember: [
          { type: "story", content: long },
          { type: "gossip", content: "Neighbour got a new car" },
          { type: "person", content: "  " },
          { type: "event", content: "Neighbour got a new car" },
          "not an object",
          { type: "routine", content: "Walks at 6", private: "true" },
          { type: "event", content: "Fourth valid item" },
        ],
        send_to_priya: long,
        concern: "dying",
      }),
    ],
  });
  const out = await think(INPUT, { client, modelIds: [M1] });
  assert.equal(out.say, "One. Two!");
  assert.equal(out.remember.length, LIMITS.rememberItems);
  assert.ok(out.remember[0].content.length <= LIMITS.memoryChars);
  assert.deepEqual(out.remember[1], { type: "other", content: "Neighbour got a new car" }, "unknown type becomes other");
  assert.deepEqual(out.remember[2], { type: "routine", content: "Walks at 6", private: true }, "blank and duplicate items are dropped");
  assert.ok(out.send_to_priya!.length <= LIMITS.sendChars);
  assert.equal(out.concern, undefined);

  const { client: c2 } = fakeBedrock({ [M1]: [toolUse({ say: "x".repeat(1000), remember: null, send_to_priya: "none" })] });
  const out2 = await think(INPUT, { client: c2, modelIds: [M1] });
  assert.equal(out2.say.length, LIMITS.sayChars);
  assert.deepEqual(out2.remember, []);
  assert.equal(out2.send_to_priya, undefined);
});

test("tries the fallback model when the first one errors", async () => {
  const { client, sent } = fakeBedrock({
    [M1]: [Object.assign(new Error("Too many requests"), { name: "ThrottlingException" })],
    [M2]: [toolUse({ say: "Hello Amma.", remember: [] })],
  });
  const out = await think(INPUT, { client, modelIds: [M1, M2] });
  assert.equal(out.modelId, M2);
  assert.deepEqual(
    sent.map((s) => s.input.modelId),
    [M1, M2],
  );
});

test("tries the fallback model when the first one times out, and aborts the slow call", async () => {
  const { client, sent } = fakeBedrock({ [M1]: ["hang"], [M2]: [toolUse({ say: "Hello Amma.", remember: [] })] });
  const t0 = Date.now();
  const out = await think(INPUT, { client, modelIds: [M1, M2], timeoutMs: 50 });
  assert.equal(out.modelId, M2);
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(sent[0].signal?.aborted, true);
});

test("an empty say from a model counts as a failure", async () => {
  const { client } = fakeBedrock({ [M1]: [toolUse({ say: "  ", remember: [] })], [M2]: [toolUse({ say: "Hi.", remember: [] })] });
  assert.equal((await think(INPUT, { client, modelIds: [M1, M2] })).modelId, M2);
});

test("retries a model without toolChoice when it rejects the field", async () => {
  const { client, sent } = fakeBedrock({
    [M1]: [
      Object.assign(new Error("This model doesn't support the toolConfig.toolChoice.tool field."), { name: "ValidationException" }),
      toolUse({ say: "Hi Amma.", remember: [] }),
      toolUse({ say: "Hi again.", remember: [] }),
    ],
  });
  const out = await think(INPUT, { client, modelIds: [M1] });
  assert.equal(out.modelId, M1);
  assert.equal(sent.length, 2);
  assert.ok(sent[0].input.toolConfig?.toolChoice);
  assert.equal(sent[1].input.toolConfig?.toolChoice, undefined);
  await think(INPUT, { client, modelIds: [M1] });
  assert.equal(sent[2].input.toolConfig?.toolChoice, undefined, "remembered for later calls");
});

test("throws BrainUnavailableError listing every attempt when all models fail", async () => {
  const { client } = fakeBedrock({ [M1]: [new Error("AccessDenied")], [M2]: ["hang"] });
  await assert.rejects(think(INPUT, { client, modelIds: [M1, M2], timeoutMs: 30 }), (err: unknown) => {
    assert.ok(err instanceof BrainUnavailableError);
    assert.deepEqual(
      err.attempts.map((a) => a.modelId),
      [M1, M2],
    );
    assert.match(err.attempts[0].error, /AccessDenied/);
    assert.match(err.attempts[1].error, /timeout/);
    return true;
  });
  await assert.rejects(think(INPUT, { client, modelIds: [] }), BrainUnavailableError);
});

test("uses BEDROCK_MODEL_ID and BEDROCK_FALLBACK_MODEL_ID by default", async () => {
  const saved = { a: process.env.BEDROCK_MODEL_ID, b: process.env.BEDROCK_FALLBACK_MODEL_ID };
  process.env.BEDROCK_MODEL_ID = M1;
  process.env.BEDROCK_FALLBACK_MODEL_ID = M2;
  try {
    const { client, sent } = fakeBedrock({ [M1]: [new Error("down")], [M2]: [toolUse({ say: "Hi.", remember: [] })] });
    await think(INPUT, { client });
    assert.deepEqual(
      sent.map((s) => s.input.modelId),
      [M1, M2],
    );
  } finally {
    if (saved.a === undefined) delete process.env.BEDROCK_MODEL_ID;
    else process.env.BEDROCK_MODEL_ID = saved.a;
    if (saved.b === undefined) delete process.env.BEDROCK_FALLBACK_MODEL_ID;
    else process.env.BEDROCK_FALLBACK_MODEL_ID = saved.b;
  }
});

test("only the last turns are sent, each clipped", async () => {
  const { client, sent } = fakeBedrock({ [M1]: [toolUse({ say: "Hi.", remember: [] })] });
  const turns = Array.from({ length: 20 }, (_, i) => ({ speaker: "elder" as const, text: `turn ${i} ${"x".repeat(400)}` }));
  await think({ ...INPUT, turns }, { client, modelIds: [M1] });
  const text = sent[0].input.messages![0].content![0].text!;
  assert.doesNotMatch(text, /turn 11 /);
  assert.match(text, /turn 12 /);
  assert.match(text, /turn 19 /);
  assert.doesNotMatch(text, /x{301}/);
});

test("gpt-oss gets a reasoning budget and low effort; Nova never gets reasoning_effort", async () => {
  const NOVA = "apac.amazon.nova-lite-v1:0";
  const OSS = "openai.gpt-oss-120b-1:0";
  const { client, sent } = fakeBedrock({ [NOVA]: [new Error("ThrottlingException")], [OSS]: [toolUse({ say: "Hello Amma!" })] });
  const out = await think(INPUT, { client, modelIds: [NOVA, OSS] });
  assert.equal(out.modelId, OSS);
  assert.deepEqual(sent[0].input.inferenceConfig, { maxTokens: 300, temperature: 0.4 });
  assert.equal(sent[0].input.additionalModelRequestFields, undefined, "Nova rejects reasoning_effort");
  assert.ok((sent[1].input.inferenceConfig?.maxTokens ?? 0) >= 1000, "reasoning tokens share maxTokens");
  assert.deepEqual(sent[1].input.additionalModelRequestFields, { reasoning_effort: "low" });
});

test("a reply with only reasoning reports its stop reason", () => {
  assert.throws(
    () => parseResponse({ output: { message: { role: "assistant", content: [{ reasoningContent: { reasoningText: { text: "thinking..." } } }] } }, stopReason: "max_tokens" } as never),
    /empty_response:max_tokens/,
  );
});
