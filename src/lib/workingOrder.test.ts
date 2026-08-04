import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideWorkingOrder, isGaplessOrder } from "./workingOrder.ts";

/**
 * The regression these tests exist for: order_index came out 2, 4, 6 … 28 because a
 * counter was advanced inside a React state updater, which StrictMode invokes twice.
 * The double-invocation is simulated directly below.
 */

/** Applies a decision the way the component does — writing only when new. */
function visit(assigned: Map<number, number>, index: number): number {
  const { order, isNew } = decideWorkingOrder(assigned, index);
  if (isNew) assigned.set(index, order);
  return order;
}

describe("decideWorkingOrder", () => {
  it("numbers first visits 1, 2, 3 in sequence", () => {
    const assigned = new Map<number, number>();
    assert.equal(visit(assigned, 0), 1);
    assert.equal(visit(assigned, 1), 2);
    assert.equal(visit(assigned, 2), 3);
    assert.ok(isGaplessOrder(assigned));
  });

  it("records the order WORKED IN, not paper order", () => {
    const assigned = new Map<number, number>();
    // Student jumps: question 5, then 1, then 3.
    visit(assigned, 4);
    visit(assigned, 0);
    visit(assigned, 2);
    assert.equal(assigned.get(4), 1);
    assert.equal(assigned.get(0), 2);
    assert.equal(assigned.get(2), 3);
    assert.ok(isGaplessOrder(assigned));
  });

  it("does not renumber a revisited question", () => {
    const assigned = new Map<number, number>();
    visit(assigned, 0);
    visit(assigned, 1);
    // Back to the first question — it keeps order 1, because that is when it was
    // first worked. Renumbering would make "the order they worked in" meaningless.
    assert.equal(visit(assigned, 0), 1);
    assert.equal(assigned.size, 2);
    assert.ok(isGaplessOrder(assigned));
  });

  it("is idempotent under a StrictMode-style double invocation", () => {
    // THE REGRESSION. Calling the decision twice for the same question — as
    // StrictMode does to a state updater — must not consume two order numbers.
    const assigned = new Map<number, number>();

    const first = decideWorkingOrder(assigned, 0);
    const second = decideWorkingOrder(assigned, 0); // same pre-write state, twice
    assert.equal(first.order, 1);
    assert.equal(second.order, 1, "a repeated decision must not advance the counter");

    if (first.isNew) assigned.set(0, first.order);
    if (second.isNew) assigned.set(0, second.order);
    assert.equal(assigned.size, 1);

    // And the next question still gets 2, not 3.
    assert.equal(visit(assigned, 1), 2);
    assert.ok(isGaplessOrder(assigned));
  });

  it("stays gapless across a full 14-question paper worked in order", () => {
    const assigned = new Map<number, number>();
    for (let i = 0; i < 14; i += 1) visit(assigned, i);
    assert.equal(assigned.size, 14);
    assert.deepEqual([...assigned.values()], Array.from({ length: 14 }, (_, i) => i + 1));
    assert.ok(isGaplessOrder(assigned));
  });

  it("reports a doubled sequence as not gapless", () => {
    // What the bug actually produced, so the checker is known to catch it.
    const doubled = new Map([
      [0, 2],
      [1, 4],
      [2, 6],
    ]);
    assert.equal(isGaplessOrder(doubled), false);
  });
});
