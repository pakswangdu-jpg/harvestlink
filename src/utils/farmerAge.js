const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function isNewFarmer(createdAt, now = Date.now()) {
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  const age = Number(now) - created;
  return Number.isFinite(age) && age >= 0 && age < ONE_WEEK_MS;
}
