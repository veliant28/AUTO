'use client'

import type { Table } from '@tanstack/react-table'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

/**
 * Футер пагинации для таблиц на TanStack — тот же вид, что у таблицы товаров:
 * слева номер страницы, справа «Назад», номера страниц и «Вперёд».
 * Работает и с серверной (manualPagination), и с клиентской пагинацией;
 * при одной странице не рисуется.
 */
export function TablePagination<T>({ table }: { table: Table<T> }) {
  const t = useTranslations('admin')
  const { pageIndex } = table.getState().pagination
  const pageCount = table.getPageCount()
  if (pageCount <= 1) return null

  const page = pageIndex + 1
  const pages = Array.from({ length: Math.min(pageCount, 7) }, (_, i) => {
    if (pageCount <= 7) return i + 1
    if (page <= 4) return i + 1
    if (page >= pageCount - 3) return pageCount - 6 + i
    return page - 3 + i
  })

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-t">
      <span className="text-sm text-muted-foreground tabular-nums">
        {t('page_of', { page, total: pageCount })}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
        >
          {t('prev_page')}
        </Button>
        {pages.map((p) => (
          <Button
            key={p}
            variant={p === page ? 'default' : 'outline'}
            size="sm"
            onClick={() => table.setPageIndex(p - 1)}
          >
            {p}
          </Button>
        ))}
        <Button
          variant="outline"
          size="sm"
          disabled={!table.getCanNextPage()}
          onClick={() => table.nextPage()}
        >
          {t('next_page')}
        </Button>
      </div>
    </div>
  )
}
