// Shared CSV export used by every exportable table across the dashboard.
// Callers pass whatever rows are CURRENTLY ON SCREEN — i.e. already run
// through that table's search box, column filters, and sort — so the
// exported file always matches what the user is looking at, not the
// full unfiltered dataset.

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// headers: array of column labels for the first row.
// rows: array of arrays, same column order as headers.
export function downloadCsv(filename, headers, rows) {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvCell).join(","));
  }
  // Leading BOM so Excel opens the file as UTF-8 (otherwise ₹ and other
  // non-ASCII characters render as garbled text on Windows).
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}