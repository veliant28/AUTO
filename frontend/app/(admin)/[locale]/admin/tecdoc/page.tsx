'use client'

import React, { useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast as sonnerToast } from 'sonner'
import api from '@/lib/api'
import DashboardTab from './DashboardTab'
import BatchTab from './BatchTab'
import ManualTab from './ManualTab'
import SettingsTab from './SettingsTab'

type Tab = 'dashboard' | 'batch' | 'manual' | 'settings'

function TecDocPageInner() {
  const t = useTranslations('admin')
  const searchParams = useSearchParams()
  const tab = (searchParams.get('tab') || 'dashboard') as Tab
  const prevRunning = React.useRef(false)

  const { data: batchState } = useQuery({
    queryKey: ['tecdoc-batch-status'],
    queryFn: async () => {
      const { data } = await api.get('/admin/tecdoc/batch/status')
      return data as {
        running: boolean
        task_id: string | null
        processed: number
        total: number
        size: number
      }
    },
    refetchInterval: (query) => (query.state.data?.running ? 3000 : false),
  })

  useEffect(() => {
    if (!batchState) return
    if (batchState.running && !prevRunning.current) {
      sonnerToast.loading(t('tecdoc_batch_progress'), { id: 'tecdoc-batch' })
    } else if (batchState.running) {
      sonnerToast.loading(
        `${t('tecdoc_batch_progress')}: ${batchState.processed} / ${batchState.total}`,
        { id: 'tecdoc-batch' },
      )
    } else if (!batchState.running && prevRunning.current) {
      sonnerToast.success(t('tecdoc_batch_completed'), {
        id: 'tecdoc-batch',
        duration: 5000,
      })
    }
    prevRunning.current = batchState.running
  }, [batchState, t])

  return (
    <div className="p-6">
      {tab === 'dashboard' && <DashboardTab t={t} />}
      {tab === 'batch' && <BatchTab t={t} />}
      {tab === 'manual' && <ManualTab t={t} />}
      {tab === 'settings' && <SettingsTab t={t} />}
    </div>
  )
}

export default function TecDocPage() {
  return <TecDocPageInner />
}
