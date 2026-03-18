export function csvCell(value: unknown): string {
  let s = String(value ?? "").replace(/"/g, '""');
  // Prevent CSV formula injection (Excel/Google Sheets execute cells starting with = + - @ |)
  if (/^[=+\-@|]/.test(s)) {
    s = "'" + s;
  }
  return `"${s}"`;
}
