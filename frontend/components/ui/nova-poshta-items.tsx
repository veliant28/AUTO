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
        {[item.address, isPostomat ? `${item.area}, ${item.region}` : '']
          .filter(Boolean)
          .join(' — ')}
      </div>
    </>
  )
}
