'use client'

import React from 'react'
import { useSearchParams } from 'next/navigation'
import { Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import DashboardTab from './components/DashboardTab'
import WorkersTab from './workers/components/WorkersTab'
import { StaffPageContent } from './staff/page'
import ProtectionDashboard from './components/ProtectionDashboard'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

export default function AdminPage() {
  const { user, isAuthenticated } = useAuthStore()
  const t = useTranslations('admin')
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab') || 'dashboard'

  if (
    !isAuthenticated ||
    !['admin', 'manager', 'operator'].includes(user?.role ?? '')
  ) {
    return (
      <div className="container mx-auto py-20 px-4 text-center space-y-4">
        <Package className="w-16 h-16 mx-auto text-muted-foreground" />
        <h1 className="text-3xl font-bold">{t('access_denied')}</h1>
        <p className="text-muted-foreground">{t('access_denied_desc')}</p>
        <Button>{t('go_home')}</Button>
      </div>
    )
  }

  return (
    <div className="p-6">
      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'staff' && <StaffPageContent />}
      {tab === 'protection' && <ProtectionDashboard />}
      {tab === 'workers' && <WorkersTab />}
    </div>
  )
}
