// Number formatters mirroring the backend's fmt_* helpers in app/finance.py.
// Kept in sync so a nullish or non-finite ratio always renders "—" — the same
// convention a credit officer sees in the memo.

export function x1(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  return `${n.toFixed(2)}×`;
}

export function pct(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export function days(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  return `${Math.round(n)}d`;
}

export function eur(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  return `€${Math.round(n).toLocaleString("en-US")}`;
}
