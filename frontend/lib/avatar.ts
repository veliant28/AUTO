const DICEBEAR_BASE = 'https://api.dicebear.com/9.x';

export type AvatarStyle =
  | 'initials'
  | 'identicon'
  | 'avataaars'
  | 'avataaars-neutral'
  | 'bottts'
  | 'bottts-neutral'
  | 'lorelei'
  | 'lorelei-neutral'
  | 'thumbs'
  | 'adventurer'
  | 'adventurer-neutral'
  | 'big-ears'
  | 'big-ears-neutral'
  | 'big-smile'
  | 'croodles'
  | 'croodles-neutral'
  | 'dylan'
  | 'fun-emoji'
  | 'glass'
  | 'icons'
  | 'micah'
  | 'miniavs'
  | 'notionists'
  | 'notionists-neutral'
  | 'open-peeps'
  | 'personas'
  | 'pixel-art'
  | 'rings'
  | 'shapes';

export function getAvatarUrl(name: string, style: AvatarStyle = 'initials'): string {
  const seed = encodeURIComponent(name || 'user');
  return `${DICEBEAR_BASE}/${style}/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
}

export function getInitials(name: string, email?: string): string {
  const str = name || email || '?';
  const parts = str.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return str.slice(0, 2).toUpperCase();
}
