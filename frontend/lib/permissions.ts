import type { AuthUser } from '@/store/authStore'

/**
 * Проверка права по codename (список приходит с бэкенда в /auth/login и /users/me).
 * Единый источник прав — чекбоксы на странице /admin/roles.
 */
export function can(
  user: Pick<AuthUser, 'permissions'> | null,
  perm: string,
): boolean {
  return !!user?.permissions?.includes(perm)
}

export function canAny(
  user: Pick<AuthUser, 'permissions'> | null,
  perms: string[],
): boolean {
  return perms.some((p) => can(user, p))
}

/**
 * Для кнопок/действий: если права нет — синий info-тост о доступе и false.
 * Кнопка не скрывается, чтобы пользователь видел, что действие существует.
 */
export function requirePerm(
  user: Pick<AuthUser, 'permissions'> | null,
  perm: string,
  opts: { toast: { info: (msg: string) => void }; t: (key: string) => string },
): boolean {
  if (can(user, perm)) return true
  opts.toast.info(opts.t('access_denied_action'))
  return false
}
