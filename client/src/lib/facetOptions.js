// Dependent ("faceted") filter lists for the dashboard's tables.
//
// Every column filter lists only the values that exist in the rows the table can
// currently show. If the table has only P1 and P3 rows, the Platform filter offers
// P1 and P3 — not P2. The columns narrow each other too: pick a KAM and the
// Platform / SPOC / … lists shrink to what that KAM's rows contain.
//
// For each column, its list is built from the rows that pass every OTHER column's
// filter (and the search box, and anything else that narrows the table — `keep`).
// A column's own selection is left out of its own list on purpose: otherwise,
// ticking P1 would leave P1 as the only choice and you could never tick P3 back in.
//
//   rows        every row of the table, before any filter
//   fieldOf     { filterKey: "rowField" } — which row property each filter reads
//   filters     the current selections: { filterKey: null (everything) | [values] }
//   matches     matchesFilter(value, selection) from HeaderFilterMenu
//   optionsFor  optionsFor(rows, field) from HeaderFilterMenu (keeps each list's usual order)
//   keep        optional: (row) => boolean for the search box, a "not empty" switch, …
//
// Returns { filterKey: [values] }.
export function facetOptions({ rows, fieldOf, filters, matches, optionsFor, keep }) {
  const keys = Object.keys(fieldOf);
  const base = keep ? rows.filter(keep) : rows;
  const out = {};
  for (const key of keys) {
    const pool = base.filter((row) => keys.every((other) => other === key || matches(row[fieldOf[other]], filters[other])));
    out[key] = optionsFor(pool, fieldOf[key]);
  }
  return out;
}