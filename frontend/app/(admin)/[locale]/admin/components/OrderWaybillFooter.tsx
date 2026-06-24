'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { Trash2, Printer, Clock, Loader2, ArrowLeft } from 'lucide-react'
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
  /** Loading state for delete */
  isDeleting: boolean
  /** Loading state for print */
  isPrinting: boolean
  /** Additional disabled state (e.g. packaging/services mode) */
  disabled?: boolean
  /** Whether tracking view is active */
  isTrackingView?: boolean
  /** Callbacks */
  onSave: () => void
  onDelete: () => void
  onPrintMarkings: () => void
  onPrintTtn: () => void
  onCancel: () => void
  onTracking?: () => void
}

export default function OrderWaybillFooter({
  isEdit,
  canEdit,
  isPending,
  isDeleting,
  isPrinting,
  onSave,
  onDelete,
  onPrintMarkings,
  onPrintTtn,
  onCancel,
  onTracking,
  isTrackingView = false,
  disabled = false,
}: Props) {
  const t = useTranslations('admin')
  const isBusy = isPending || isDeleting || isPrinting || disabled

  return (
    <div className="flex-shrink-0 p-4 pt-3 flex flex-wrap items-start justify-between gap-3">
      {/* Left group */}
      <div className="flex items-center gap-2">
        {isTrackingView ? (
          <Button variant="outline" onClick={onTracking} disabled={isBusy}>
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            {t('novaposhta_tracking_back')}
          </Button>
        ) : (
          <>
            {isEdit && onTracking && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    className="gap-1.5"
                    onClick={onTracking}
                    disabled={isBusy}
                  >
                    <Clock className="w-4 h-4" />
                    {t('novaposhta_tracking')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('novaposhta_tracking')}</TooltipContent>
              </Tooltip>
            )}

            {isEdit && canEdit && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="destructive"
                    className="gap-1.5"
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
                <TooltipContent>
                  {t('novaposhta_waybill_delete')}
                </TooltipContent>
              </Tooltip>
            )}

            {isEdit && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="default"
                      className="gap-1.5 bg-gray-500 hover:bg-gray-600 text-white"
                      onClick={onPrintMarkings}
                      disabled={isBusy}
                    >
                      {isPrinting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Printer className="w-4 h-4" />
                      )}
                      {t('novaposhta_print_markings')}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t('novaposhta_print_markings')}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      className="gap-1.5"
                      onClick={onPrintTtn}
                      disabled={isBusy}
                    >
                      {isPrinting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Printer className="w-4 h-4" />
                      )}
                      {t('novaposhta_print_ttn')}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('novaposhta_print_ttn')}</TooltipContent>
                </Tooltip>
              </>
            )}
          </>
        )}
      </div>

      {/* Right group */}
      {!isTrackingView && (
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isBusy}>
            {t('cancel')}
          </Button>
          <Button className="gap-1.5" onClick={onSave} disabled={isBusy}>
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? t('novaposhta_save') : t('novaposhta_waybill_create')}
          </Button>
        </div>
      )}
    </div>
  )
}
