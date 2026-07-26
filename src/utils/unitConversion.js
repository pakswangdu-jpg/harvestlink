// Which selling units have a universal, product-independent kg equivalent — a gram, kg, or
// ton is always the same weight no matter what's being sold; liter/mL assume roughly
// water-like density (a reasonable simplification for a farm marketplace — a genuinely
// dense/light liquid product, like honey or coconut oil, would need the same manual
// "weight of one unit" override every count/container unit below already requires).
//
// Every other unit depends entirely on what's actually being sold — a dozen of calamansi and
// a dozen of watermelons weigh wildly different amounts, and so does "one crate" of anything
// — so those are never guessed, always asked (see ProductForm.jsx's "How many kg is 1 X?"
// field). This deliberately excludes "dozen": a count of 12 isn't a weight by itself, only a
// multiplier on whatever's being counted, so it belongs with the ask-the-farmer units, not
// the fixed ones.
//
// Keys cover BOTH forms products.unit can actually hold for these units — the intended short
// abbreviation ("g"/"t"/"L", per supabase/schema.sql's units seed) AND the lowercased full
// name ("gram"/"ton"/"liter"), which is what a live install can still have stored if its
// units table predates that abbreviation being added (public.units.abbreviation is null for
// those rows there — confirmed by checking a real database — and ON CONFLICT DO NOTHING on
// re-seeding never retroactively fixes an already-existing row). Being liberal here means a
// product listed before vs. after that catalog fix converts identically either way.
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
