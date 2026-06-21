'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { Trash2, RefreshCw, Printer, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface Props {
  /** Whether a waybill exists (edit mode) */
  isEdit: boolean
  /** Whether the waybill can be edited (can_edit flag) */
  canEdit: boolean
  /** Whether any async operation is in progress */
  isPending: boolean
  /** Loading state for sync */
  isSyncing: boolean
  /** Loading state for delete */
  isDeleting: boolean
  /** Loading state for print */
  isPrinting: boolean
  /** Additional disabled state (e.g. packaging/services mode) */
  disabled?: boolean
  /** Callbacks */
  onSave: () => void
  onDelete: () => void
  onSync: () => void
  onPrintHtml: () => void
  onPrintPdf: () => void
  onCancel: () => void
}

export default function OrderWaybillFooter({
  isEdit,
  canEdit,
  isPending,
  isSyncing,
  isDeleting,
  isPrinting,
  onSave,
  onDelete,
  onSync,
  onPrintHtml,
  onPrintPdf,
  onCancel,
  disabled = false,
}: Props) {
  const t = useTranslations('admin')
  const isBusy = isPending || isSyncing || isDeleting || isPrinting || disabled

  return (
    <div className="border-t px-4 py-3 bg-muted/20 flex flex-wrap items-start justify-between gap-3">
      {/* Left group */}
      <div className="flex items-center gap-2">
        {isEdit && canEdit && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="destructive"
                className="h-9 gap-1.5"
                onClick={onDelete}
                disabled={isBusy}
              >
                {isDeleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                {t('novaposhta_waybill_delete')}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('novaposhta_waybill_delete')}</TooltipContent>
          </Tooltip>
        )}

        {isEdit && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                className="h-9 gap-1.5"
                onClick={onSync}
                disabled={isBusy}
              >
                {isSyncing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {t('novaposhta_waybill_sync_short')}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('novaposhta_waybill_sync')}</TooltipContent>
          </Tooltip>
        )}

        {isEdit && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  className="h-9 gap-1.5"
                  onClick={onPrintHtml}
                  disabled={isBusy}
                >
                  {isPrinting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Printer className="w-4 h-4" />
                  )}
                  {t('novaposhta_print_html')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('novaposhta_print_html')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  className="h-9 gap-1.5"
                  onClick={onPrintPdf}
                  disabled={isBusy}
                >
                  {isPrinting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Printer className="w-4 h-4" />
                  )}
                  {t('novaposhta_print_pdf')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('novaposhta_print_pdf')}</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>

      {/* Right group */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          className="h-9"
          onClick={onCancel}
          disabled={isBusy}
        >
          {t('cancel')}
        </Button>
        <Button className="h-9 gap-1.5" onClick={onSave} disabled={isBusy}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          {isEdit ? t('novaposhta_save') : t('novaposhta_waybill_create')}
        </Button>
      </div>
    </div>
  )
}
