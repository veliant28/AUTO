/** Общие типы и хелперы журнала заявок (страница, модалка, диалоги). */

export const AUTOMATED_CATEGORY_CODES = [
  'b2b_registration',
  'timesheet_manual',
  'ban_unban',
]

export const STATUSES = ['new', 'in_progress', 'resolved', 'rejected'] as const

export interface RequestActorInfo {
  user_id: number
  full_name?: string | null
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  role?: string | null
}

export interface RequestListItem {
  id: number
  number: string
  category_id: number
  category_name: string
  category_code: string
  status: string
  title: string
  created_at: string | null
  created_by: RequestActorInfo | null
  assignee: RequestActorInfo | null
  deadline: string | null
  deadline_state: string
  minutes_left: number | null
  minutes_late: number | null
}

export interface RequestCategory {
  id: number
  name: string
  code: string
  allowed_roles: string[] | null
  take_roles: string[] | null
  description: string | null
  response_minutes: number | null
  resolve_minutes: number | null
  is_active: boolean
  sort_order: number
}

export interface RequestListResponse {
  items: RequestListItem[]
  total: number
  page: number
  page_size: number
  counts: Record<string, number>
  progress: number
}

export interface AssigneeOption {
  id: number
  name: string
  email: string
  role: string | null
}

/** «Фамилия Имя» → full_name → email → #id */
export function actorLabel(actor: RequestActorInfo | null | undefined): string {
  if (!actor) return '—'
  return (
    [actor.last_name, actor.first_name].filter(Boolean).join(' ') ||
    actor.full_name ||
    actor.email ||
    `#${actor.user_id}`
  )
}
