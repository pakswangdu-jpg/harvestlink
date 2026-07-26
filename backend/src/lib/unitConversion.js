// Server-side twin of src/utils/unitConversion.js — duplicated (not imported across the
// frontend/backend boundary) because Render only builds and deploys the backend/ directory in
// isolation (see render.yaml's rootDir), so backend code must be fully self-contained. Keep
// this in sync with the frontend copy if either changes. See that file's own comment for the
// full reasoning behind which units are fixed vs. always asked, and why both the abbreviated
// and full-name spellings are covered for gram/kilogram/ton/mL/liter.
export const FIXED_KG_PER_UNIT = {
  g: 0.001,
  gram: 0.001,
  kg: 1,
  kilogram: 1,
  t: 1000,
  ton: 1000,
  mL: 0.001,
  ml: 0.001,
  L: 1,
  liter: 1,
  litre: 1,
};

export function getFixedKgPerUnit(unit) {
  return Object.prototype.hasOwnProperty.call(FIXED_KG_PER_UNIT, unit) ? FIXED_KG_PER_UNIT[unit] : null;
}
