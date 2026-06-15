export function getAvatarUrl(avatarIndex?: number | null): string {
  const index = avatarIndex ?? Math.floor(Math.random() * 30) + 1
  const clamped = Math.max(1, Math.min(40, index))
  return `/avatars/${clamped}.svg`
}

export function getInitials(name?: string, email?: string): string {
  const str = name || email || '?';
  const parts = str.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return str.slice(0, 2).toUpperCase();
}
