import assert from "node:assert/strict";
import { isDue, scheduleReview, DAY_MS } from "../scheduler.mjs";

const now = Date.parse("2026-09-28T09:00:00.000Z");
const card = { word: "vivid", dueAt: new Date(now).toISOString(), intervalDays: 0, repetitions: 0, ease: 2.5, lapses: 0 };
assert.equal(isDue(card, now), true);

const first = scheduleReview(card, "good", now);
assert.equal(first.intervalDays, 1);
assert.equal(Date.parse(first.dueAt), now + DAY_MS);
assert.equal(isDue(first, now), false);

const second = scheduleReview(first, "good", now + DAY_MS);
assert.equal(second.intervalDays, 3);

const forgotten = scheduleReview(second, "again", now);
assert.equal(forgotten.repetitions, 0);
assert.equal(forgotten.lapses, 1);
assert.equal(Date.parse(forgotten.dueAt), now + 10 * 60 * 1000);

const hard = scheduleReview(second, "hard", now);
assert.ok(hard.intervalDays >= 1);
assert.ok(Date.parse(hard.dueAt) > now);

assert.throws(() => scheduleReview(card, "wrong", now));
console.log("scheduler tests passed");
