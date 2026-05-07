const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  emptyAnnotations,
  readAnnotations,
  writeOrderAnnotation,
  writeLineItemAnnotation,
} = require("../lib/zepto_review_annotations");

test("readAnnotations returns the empty shape when the file does not exist", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "zepto-annotations-"));
  const filePath = path.join(tempDir, "missing.json");

  const annotations = await readAnnotations(filePath);

  assert.deepEqual(annotations, emptyAnnotations());
});

test("writeOrderAnnotation creates and merges annotations by order id", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "zepto-annotations-"));
  const filePath = path.join(tempDir, "annotations.json");

  await writeOrderAnnotation(filePath, "order-1", {
    expense_category: "groceries",
    ready_for_splitwise: false,
  });
  await writeOrderAnnotation(filePath, "order-2", {
    split_type: "shared",
  });
  const merged = await writeOrderAnnotation(filePath, "order-1", {
    notes: "needs split review",
  });

  assert.equal(merged.orders["order-1"].expense_category, "groceries");
  assert.equal(merged.orders["order-1"].notes, "needs split review");
  assert.equal(merged.orders["order-2"].split_type, "shared");
  assert.ok(merged.updatedAt);
});

test("readAnnotations normalizes orders and line items while dropping unknown keys", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "zepto-annotations-"));
  const filePath = path.join(tempDir, "annotations.json");
  await fs.writeFile(
    filePath,
    JSON.stringify({
      updatedAt: "2026-05-06T12:00:00.000Z",
      ignored: true,
      orders: {
        "order-1": {
          expense_category: "groceries",
          review_status: "needs_review",
          review_reason: "amount mismatch",
          unknown_order_key: "drop me",
        },
      },
      lineItems: {
        "order-1::INV-1::0": {
          expense_category: "personal",
          split_type: "shared",
          review_status: "approved",
          review_reason: "snack",
          unknown_line_key: "drop me too",
        },
      },
    }),
  );

  const annotations = await readAnnotations(filePath);

  assert.deepEqual(annotations, {
    updatedAt: "2026-05-06T12:00:00.000Z",
    orders: {
      "order-1": {
        expense_category: "groceries",
        review_status: "needs_review",
        review_reason: "amount mismatch",
      },
    },
    lineItems: {
      "order-1::INV-1::0": {
        expense_category: "personal",
        split_type: "shared",
        review_status: "approved",
        review_reason: "snack",
      },
    },
  });
});

test("writeOrderAnnotation preserves existing line-item annotations", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "zepto-annotations-"));
  const filePath = path.join(tempDir, "annotations.json");

  await writeLineItemAnnotation(filePath, "order-1::INV-1::0", {
    expense_category: "personal",
  });
  const merged = await writeOrderAnnotation(filePath, "order-1", {
    review_status: "approved",
  });

  assert.equal(merged.orders["order-1"].review_status, "approved");
  assert.equal(merged.lineItems["order-1::INV-1::0"].expense_category, "personal");
});

test("writeLineItemAnnotation creates and merges normalized line-item patches", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "zepto-annotations-"));
  const filePath = path.join(tempDir, "annotations.json");

  await writeOrderAnnotation(filePath, "order-1", {
    expense_category: "groceries",
  });
  await writeLineItemAnnotation(filePath, "order-1::INV-1::0", {
    split_type: "shared",
    unknown_key: "drop",
  });
  const merged = await writeLineItemAnnotation(filePath, "order-1::INV-1::0", {
    notes: "only this item",
    review_reason: "manual split",
  });

  assert.equal(merged.orders["order-1"].expense_category, "groceries");
  assert.deepEqual(merged.lineItems["order-1::INV-1::0"], {
    split_type: "shared",
    notes: "only this item",
    review_reason: "manual split",
  });
  assert.ok(merged.updatedAt);
});

test("writeOrderAnnotation persists category suppression overrides", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "zepto-annotations-"));
  const filePath = path.join(tempDir, "annotations.json");

  await writeOrderAnnotation(filePath, "order-1", {
    suppress_suggested_category: true,
  });

  const annotations = await readAnnotations(filePath);

  assert.equal(annotations.orders["order-1"].suppress_suggested_category, true);
});
