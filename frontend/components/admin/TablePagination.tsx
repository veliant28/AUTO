'use client'

import type { Table } from '@tanstack/react-table'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

/**
 * Футер пагинации для таблиц на TanStack — тот же вид, что у таблицы заказов:
 * слева диапазон строк, справа «Назад»/«Вперёд». Работает и с серверной
 * (manualPagination), и с клиентской пагинацией; при одной странице не рисуется.
 */
export function TablePagination<T>({ table }: { table: Table<T> }) {
  const t = useTranslations('admin')
  const { pageIndex, pageSize } = table.getState().pagination
  const pageCount = table.getPageCount()
  if (pageCount <= 1) return null

  // Для серверной пагинации число строк на странице известно из pageSize,
  // для клиентской — берём из модели строк до разбивки
  const total = table.options.manualPagination
    ? pageCount * pageSize
    : table.getPrePaginationRowModel().rows.length
  const from = pageIndex * pageSize + 1
  const to = Math.min((pageIndex + 1) * pageSize, total)

  return (
    <div className="flex items-center justify-between p-3 border-t">
      <span className="text-sm text-muted-foreground tabular-nums">
        {from}–{to} / {total}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
        >
          {t('pagination_prev')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!table.getCanNextPage()}
          onClick={() => table.nextPage()}
        >
          {t('pagination_next')}
        </Button>
      </div>
    </div>
  )
}
