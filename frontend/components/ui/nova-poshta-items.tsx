'use client'

import { Warehouse } from 'lucide-react'
import type {
  NovaPoshtaLookupSettlement,
  NovaPoshtaLookupWarehouse,
} from '@/lib/types/nova-poshta'

export function SettlementItem({ item }: { item: NovaPoshtaLookupSettlement }) {
  return (
    <>
      <div className="font-medium leading-tight">{item.label}</div>
      <div className="text-xs text-muted-foreground mt-0.5">
        {[item.area, item.region].filter(Boolean).join(' — ')}
        {item.warehouses_count && item.warehouses_count !== '0' ? (
          <span className="ml-2 inline-flex items-center gap-1">
            <Warehouse className="w-3 h-3" />×{item.warehouses_count}
          </span>
        ) : null}
      </div>
    </>
  )
}

export function WarehouseListItem({
  item,
}: {
  item: NovaPoshtaLookupWarehouse
}) {
  const isPostomat = item.type === 'Postomat'
  return (
    <>
      <div className="font-medium leading-tight flex items-center gap-2">
        {isPostomat ? (
          <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-1.5 py-0.5 rounded font-semibold shrink-0">
            Поштомат
          </span>
        ) : null}
        <span>{item.label}</span>
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">
        {item.description || item.full_description}
      </div>
    </>
  )
}

/**
 * Пункт выпадающего списка отделений — та же разметка, что в оформлении
 * заказа на витрине: бейдж номера (или «Почтомат») + адрес отделения.
 */
export function WarehouseDropdownItem({
  item,
  postomatLabel,
}: {
  item: NovaPoshtaLookupWarehouse
  postomatLabel: string
}) {
  const isPostomat = item.type === 'Postomat'
  const hasAddress = item.label.includes(':')
  const address = hasAddress
    ? item.label.slice(item.label.indexOf(':') + 1).trim()
    : ''
  const description = address || item.description || ''
  return (
    <>
      <div className="font-medium leading-tight flex items-center gap-2">
        {isPostomat ? (
          <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-1.5 py-0.5 rounded font-semibold shrink-0">
            {postomatLabel}
          </span>
        ) : (
          <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 px-1.5 py-0.5 rounded font-semibold shrink-0">
            №{item.number}
          </span>
        )}
        <span className="truncate">
          {hasAddress
            ? item.label.slice(0, item.label.indexOf(':'))
            : item.label}
        </span>
      </div>
      {description ? (
        <div className="text-xs text-muted-foreground mt-0.5 truncate">
          {description}
        </div>
      ) : null}
    </>
  )
}
