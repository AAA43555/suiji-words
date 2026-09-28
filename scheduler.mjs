export const DAY_MS = 24 * 60 * 60 * 1000;

export function isDue(card, now = Date.now()) {
  return !Number.isFinite(Date.parse(card.dueAt)) || Date.parse(card.dueAt) <= now;
}

export function scheduleReview(card, grade, now = Date.now()) {
  const currentInterval = Math.max(0, Number(card.intervalDays) || 0);
  const reps = Math.max(0, Number(card.repetitions) || 0);
  const ease = Math.max(1.3, Number(card.ease) || 2.5);
  let intervalDays;
  let nextEase = ease;
  let nextReps = reps;

  if (grade === "again") {
    intervalDays = 10 / (24 * 60);
    nextEase = Math.max(1.3, ease - 0.2);
    nextReps = 0;
  } else if (grade === "hard") {
    intervalDays = Math.max(1, Math.round(currentInterval * 1.2));
    nextEase = Math.max(1.3, ease - 0.15);
    nextReps = reps + 1;
  } else if (grade === "good") {
    intervalDays = reps === 0 ? 1 : reps === 1 ? 3 : Math.max(1, Math.round(currentInterval * ease));
    nextEase = Math.min(3, ease + 0.05);
    nextReps = reps + 1;
  } else {
    throw new Error("Unknown review grade");
  }

  return {
    ...card,
    intervalDays,
    ease: nextEase,
    repetitions: nextReps,
    lapses: (Number(card.lapses) || 0) + (grade === "again" ? 1 : 0),
    dueAt: new Date(now + intervalDays * DAY_MS).toISOString(),
    lastReviewedAt: new Date(now).toISOString()
  };
}
