const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  publicSettings,
  readAiSettings,
  runAiAction,
  writeAiSettings,
} = require("../lib/zepto_ai_assistant");

async function makeTempWorkspace() {
  return fs.mkdtemp(path.join(os.tmpdir(), "zepto-ai-"));
}

test("AI settings are local, masked, and preserve an existing API key", async () => {
  const baseDir = await makeTempWorkspace();

  const saved = await writeAiSettings(baseDir, {
    provider: "openai",
    model: "gpt-4.1-mini",
    apiKey: "sk-test-secret-value",
    redactPrivateFields: true,
  });
  assert.equal(saved.provider, "openai");
  assert.equal(saved.apiKey, "sk-test-secret-value");

  const updated = await writeAiSettings(baseDir, {
    model: "gpt-4.1",
  });
  assert.equal(updated.apiKey, "sk-test-secret-value");
  assert.equal(updated.model, "gpt-4.1");

  const publicView = publicSettings(await readAiSettings(baseDir));
  assert.equal(publicView.hasApiKey, true);
  assert.equal(publicView.apiKeyPreview, "sk-test...alue");
  assert.equal(publicView.apiKey, undefined);
});

test("AI actions require provider settings before sending local data", async () => {
  const baseDir = await makeTempWorkspace();
  await assert.rejects(
    runAiAction({
      baseDir,
      action: "categorize",
      dataset: { lineItems: [{ line_item_key: "line-1", item_description: "Milk" }] },
    }),
    /API key/i,
  );
});
