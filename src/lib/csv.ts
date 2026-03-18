export function csvCell(value: unknown): string {
  const s = String(value ?? "").replace(/"/g, '""');
  return `"${s}"`;
}
