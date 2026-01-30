export function grcFormat(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, "")}G`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}k`;
  return n.toString();
}