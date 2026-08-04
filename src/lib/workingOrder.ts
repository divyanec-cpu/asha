/**
 * Working order: the sequence a student actually visited questions in.
 *
 * This exists because the same bug has now been written twice — in `TimedRunner`
 * and then in `PaperRunner`, the second time directly underneath a comment
 * warning about it. Both did roughly:
 *
 *     setAnswers((prev) => {
 *       if (prev[i].orderIndex !== null) return prev;
 *       counter.current += 1;              // <-- mutation inside the updater
 *       return prev.map(...counter.current...);
 *     });
 *
 * React StrictMode double-invokes state updaters in development specifically to
 * surface impure ones. On both invocations `prev` is still the pre-update state, so
 * the `!== null` guard passes twice and the counter advances twice. The recorded
 * order came out 2, 4, 6, … 28 instead of 1, 2, 3, … 14.
 *
 * It is a nasty class of bug: it only misbehaves in development, so it looks
 * "fixed" in production while actually being timing-dependent there too. And the
 * damage is silent — `order_index` feeds pacing analysis, so a doubled sequence is
 * not obviously wrong, just wrong.
 *
 * So the decision of what order to assign lives here as a pure function, and the
 * caller mutates outside the updater. The invariants worth holding are that orders
 * are gapless from 1, and that revisiting a question does NOT renumber it — the
 * first visit is what "the order they worked in" means.
 */

export type OrderDecision = {
  /** The order this question should carry. */
  readonly order: number;
  /** False when the question already had an order and must keep it. */
  readonly isNew: boolean;
};

/**
 * Decides the working order for a question, given what has been assigned so far.
 *
 * Pure: `assigned` is read, never written. The caller writes only when
 * `isNew` is true, and doing that outside a state updater is the whole point.
 */
export function decideWorkingOrder(
  assigned: ReadonlyMap<number, number>,
  index: number,
): OrderDecision {
  const existing = assigned.get(index);
  if (existing !== undefined) return { order: existing, isNew: false };
  return { order: assigned.size + 1, isNew: true };
}

/**
 * True when a set of assignments is a gapless 1..n with no duplicates.
 *
 * Used by tests, and cheap enough to assert in a dev build if this ever misbehaves
 * again.
 */
export function isGaplessOrder(assigned: ReadonlyMap<number, number>): boolean {
  const orders = [...assigned.values()].sort((a, b) => a - b);
  return orders.every((o, i) => o === i + 1);
}
