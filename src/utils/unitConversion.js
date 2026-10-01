



















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

export function hasFixedConversion(unit) {
  return getFixedKgPerUnit(unit) != null;
}
