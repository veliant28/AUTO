const BRAND_COLORS: Record<string, string> = {
  A: 'from-blue-500 to-blue-700',
  B: 'from-emerald-500 to-emerald-700',
  C: 'from-cyan-500 to-cyan-700',
  D: 'from-indigo-500 to-indigo-700',
  E: 'from-violet-500 to-violet-700',
  F: 'from-orange-500 to-orange-700',
  G: 'from-teal-500 to-teal-700',
  H: 'from-rose-500 to-rose-700',
  I: 'from-sky-500 to-sky-700',
  J: 'from-fuchsia-500 to-fuchsia-700',
  K: 'from-pink-500 to-pink-700',
  L: 'from-lime-500 to-lime-700',
  M: 'from-amber-500 to-amber-700',
  N: 'from-purple-500 to-purple-700',
  O: 'from-red-500 to-red-700',
  P: 'from-yellow-500 to-yellow-700',
  Q: 'from-green-500 to-green-700',
  R: 'from-gray-500 to-gray-700',
  S: 'from-slate-500 to-slate-700',
  T: 'from-stone-500 to-stone-700',
  U: 'from-neutral-500 to-neutral-700',
  V: 'from-zinc-500 to-zinc-700',
  W: 'from-blue-600 to-blue-800',
  X: 'from-red-600 to-red-800',
  Y: 'from-emerald-600 to-emerald-800',
  Z: 'from-violet-600 to-violet-800',
};

export function getBrandColor(brand: string | null): string {
  const first = brand?.charAt(0)?.toUpperCase() || '?';
  return BRAND_COLORS[first] || 'from-primary/40 to-primary/20';
}

export function getBrandInitial(_brand: string | null): string {
  return 'S';
}
