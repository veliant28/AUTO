// Avatar generation using local static files in "public/avatars".
// If an explicit avatarIndex is provided, that image is used. Otherwise,
// a deterministic index based on an optional seed (e.g., full name or email)
// is computed. When no seed is available, a random index (1‑100) is picked.
// The function returns a relative URL that Next.js serves from the public folder.

export function getAvatarUrl(avatarIndex?: number | null, seed?: string): string {
  // Simple deterministic hash for strings – produces a 32‑bit unsigned integer.
  const hash = (s: string): number => {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    return h;
  };

  const index = avatarIndex ??
    (seed ? (hash(seed) % 100) + 1 : Math.floor(Math.random() * 100) + 1);

  return `/avatars/${index}.svg`;
}

export function getInitials(name?: string, email?: string): string {
  const str = name || email || '?';
  const parts = str.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return str.slice(0, 2).toUpperCase();
}
