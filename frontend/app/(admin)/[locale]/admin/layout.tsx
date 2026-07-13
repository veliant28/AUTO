'use client'

import React, { useState, useEffect, useRef, Suspense } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  Menu,
  X,
  Ban,
  Loader2,
  Package,
  FileText,
  Shield,
  Database,
  RefreshCw,
  Plus,
  Save,
  Tag,
  Car,
  Settings,
  UserCog,
  FileDown,
  FolderTree,
  TrendingUp,
  Play,
  RotateCcw,
  Activity,
  Clock,
  Minus,
  SlidersHorizontal,
  Truck,
  Gift,
  ScanBarcode,
  MessageSquare,
  ShieldAlert,
  CalendarDays,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useAuthStore } from '@/store/authStore'
import api from '@/lib/api'
import { toast } from '@/lib/toast'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { getAvatarUrl, getInitials } from '@/lib/avatar'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import LanguageSwitcher from '@/components/ui/LanguageSwitcher'
import ThemeToggle from '@/components/ui/ThemeToggle'
import {
  AdminLocaleProvider,
  useAdminLocale,
} from './components/AdminLocaleContext'
import { useBrandName } from '@/hooks/useBrandName'
import FalconLogo from '@/components/ui/FalconLogo'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

const LOCALES = ['ru', 'en', 'ua']

function hasRole(user: { role: string } | null, ...roles: string[]) {
  if (!user) return false
  return roles.includes(user.role)
}

function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuthStore()
  const { activeLocale, setActiveLocale } = useAdminLocale()
  const ta = useTranslations('admin')
  const queryClient = useQueryClient()
  const isTecDoc = pathname.includes('/admin/tecdoc')
  const isFooter = pathname.includes('/admin/footer')
  const isSettings = pathname.includes('/admin/settings')
  const isNovaposhta = pathname.includes('/admin/novaposhta')
  const isSuppliers = pathname.includes('/admin/suppliers')
  const isProtection = pathname.includes('/admin/protection')
  const isImport = pathname.includes('/admin/import')
  const isPricing = pathname.includes('/admin/pricing')
  const isAdmin =
    pathname === '/admin' || /^\/(?:ru|en|ua)\/admin$/.test(pathname)
  const isOrders = pathname.includes('/admin/orders')
  const isReturns = pathname.includes('/admin/returns')
  const isLoyalty = pathname.includes('/admin/loyalty')
  const isStaff = pathname.includes('/admin/staff')
  const isStaffTab =
    isAdmin && (searchParams.get('tab') || 'dashboard') === 'staff'

  const adminTabs = [
    { key: 'dashboard', label: ta('workers_tab_dashboard') },
    { key: 'staff', label: ta('staff_title') },
    { key: 'protection', label: ta('protection_title') },
    { key: 'backup', label: ta('backup_title') },
    { key: 'workers', label: ta('workers_title') },
  ]

  const pageMeta: Record<string, { icon: any; titleKey: string }> = {
    '/admin': { icon: LayoutDashboard, titleKey: 'dashboard_title' },
    '/admin/orders': { icon: ShoppingCart, titleKey: 'orders_title' },
    '/admin/returns': { icon: RotateCcw, titleKey: 'returns_title' },
    '/admin/loyalty': { icon: Gift, titleKey: 'loyalty_title' },
    '/admin/waybills': { icon: ScanBarcode, titleKey: 'waybills_title' },
    '/admin/products': { icon: Package, titleKey: 'products_title' },
    '/admin/brands': { icon: Tag, titleKey: 'brands_title' },
    '/admin/categories': { icon: FolderTree, titleKey: 'categories_title' },
    '/admin/catalog': { icon: Car, titleKey: 'catalog_title' },
    '/admin/pricing': { icon: TrendingUp, titleKey: 'pricing_title' },
    '/admin/users': { icon: Users, titleKey: 'users_title' },
    '/admin/roles': { icon: Shield, titleKey: 'roles_title' },
    '/admin/tecdoc': { icon: Database, titleKey: 'tecdoc_title' },
    '/admin/settings': { icon: Settings, titleKey: 'settings_title' },
    '/admin/suppliers': { icon: Truck, titleKey: 'suppliers_title' },
    '/admin/protection': { icon: ShieldAlert, titleKey: 'protection_title' },
    '/admin/import': { icon: FileDown, titleKey: 'import_title' },
    '/admin/footer': { icon: FileText, titleKey: 'footer_title' },
    '/admin/novaposhta': { icon: Truck, titleKey: 'novaposhta_title' },
    '/admin/staff': { icon: Users, titleKey: 'staff_title' },
    '/admin/support': { icon: MessageSquare, titleKey: 'support_title' },
  }

  const pageMetaEntries = Object.entries(pageMeta).sort(
    (a, b) => b[0].length - a[0].length,
  )
  const currentMeta =
    pageMetaEntries.find(
      ([route]) => pathname.endsWith(route) || pathname.includes(route + '/'),
    ) || pageMetaEntries.find(([route]) => pathname.includes(route))
  const meta = currentMeta?.[1]
  const brandName = useBrandName()
  const [pricingTaskStatus, setPricingTaskStatus] = useState<string | null>(
    null,
  )
  const [refreshing, setRefreshing] = useState(false)
  const [restartDialogOpen, setRestartDialogOpen] = useState(false)
  const [restartCounts, setRestartCounts] = useState({ active: 0, reserved: 0 })
  useEffect(() => {
    if (restartDialogOpen) {
      setRestartCounts({
        active: (window as any).__workerActiveCount ?? 0,
        reserved: (window as any).__workerReservedCount ?? 0,
      })
    }
  }, [restartDialogOpen])
  const restartMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/admin/workers/restart')
      return data
    },
    onSuccess: () => {
      toast.success(ta('workers_restart_success'))
      setTimeout(() => (window as any).__refreshWorkers?.(), 3000)
    },
    onError: () => toast.error(ta('workers_restart_error')),
  })
  useEffect(() => {
    const id = setInterval(
      () => setPricingTaskStatus((window as any).__pricingTaskStatus || null),
      1000,
    )
    return () => clearInterval(id)
  }, [])
  const [pricingOtpDigits, setPricingOtpDigits] = useState<string[]>([
    '0',
    '0',
    '0',
  ])
  useEffect(() => {
    const id = setInterval(() => {
      const d = (window as any).__pricingOtpDigits
      if (d) setPricingOtpDigits([...d])
    }, 200)
    return () => clearInterval(id)
  }, [])

  // Staff TopBar state
  const [staffPeriod, setStaffPeriod] = useState<string>('month')
  const [staffCustomRange, setStaffCustomRange] = useState<any>(undefined)
  const [staffSelectedId, setStaffSelectedId] = useState<number | null>(null)
  useEffect(() => {
    const id = setInterval(() => {
      const win = window as any
      setStaffPeriod(win.__staffPeriod ?? 'month')
      setStaffCustomRange(win.__staffCustomRange)
      setStaffSelectedId(win.__staffSelectedStaffId ?? null)
    }, 200)
    return () => clearInterval(id)
  }, [])

  // Backup TopBar state
  const [backupTime, setBackupTime] = useState('02:00')
  const [backupTimeOpen, setBackupTimeOpen] = useState(false)
  const backupHoursRef = useRef<HTMLDivElement>(null)
  const backupMinutesRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (backupTimeOpen) {
      requestAnimationFrame(() => {
        backupHoursRef.current
          ?.querySelector<HTMLButtonElement>('[data-selected]')
          ?.scrollIntoView({ block: 'start', behavior: 'instant' })
        backupMinutesRef.current
          ?.querySelector<HTMLButtonElement>('[data-selected]')
          ?.scrollIntoView({ block: 'start', behavior: 'instant' })
      })
    }
  }, [backupTimeOpen])
  useEffect(() => {
    const id = setInterval(() => {
      const win = window as any
      if (win.__backupTime) setBackupTime(win.__backupTime)
    }, 200)
    return () => clearInterval(id)
  }, [])

  const tecdocTabs = [
    { key: 'dashboard', label: ta('tecdoc_dashboard') },
    { key: 'batch', label: ta('tecdoc_batch') },
    { key: 'manual', label: ta('tecdoc_manual') },
    { key: 'settings', label: ta('tecdoc_settings') },
  ]

  const protectionTabs = [
    { key: 'blacklist', label: ta('protection_blacklist') },
    { key: 'whitelist', label: ta('protection_whitelist') },
  ]

  const settingsNavTabs = [
    { key: 'settings', label: ta('settings_title') },
    { key: 'novaposhta', label: ta('novaposhta_title') },
    { key: 'suppliers', label: ta('suppliers_title') },
  ]

  const ordersNavTabs = [
    { key: 'orders', label: ta('orders_title') },
    { key: 'returns', label: ta('returns_title') },
  ]

  return (
    <header className="sticky top-0 z-30 h-16 border-b bg-card flex items-center justify-between px-4 lg:px-6">
      <div className="flex items-center gap-3 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
        >
          <Menu className="w-5 h-5" />
        </Button>
        {meta && (
          <div className="flex items-center gap-2 shrink-0">
            <meta.icon className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold truncate hidden sm:block">
              {ta(meta.titleKey)}
            </h1>
          </div>
        )}
        {isTecDoc &&
          tecdocTabs.map((t) => {
            const active = (searchParams.get('tab') || 'dashboard') === t.key
            return (
              <button
                key={t.key}
                onClick={() => {
                  const params = new URLSearchParams(searchParams.toString())
                  params.set('tab', t.key)
                  router.replace(`${pathname}?${params.toString()}`, {
                    scroll: false,
                  })
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {t.label.toUpperCase()}
              </button>
            )
          })}
        {isProtection &&
          protectionTabs.map((t) => {
            const active = (searchParams.get('tab') || 'blacklist') === t.key
            return (
              <button
                key={t.key}
                onClick={() => {
                  const params = new URLSearchParams(searchParams.toString())
                  params.set('tab', t.key)
                  router.replace(`${pathname}?${params.toString()}`, {
                    scroll: false,
                  })
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {t.label.toUpperCase()}
              </button>
            )
          })}
        {(isSettings || isNovaposhta || isSuppliers) &&
          settingsNavTabs.map((t) => {
            const active =
              (t.key === 'settings' && isSettings) ||
              (t.key === 'novaposhta' && isNovaposhta) ||
              (t.key === 'suppliers' && isSuppliers)
            return (
              <button
                key={t.key}
                onClick={() => {
                  const basePath = pathname.replace(
                    /\/admin\/(settings|novaposhta|suppliers).*/,
                    '/admin',
                  )
                  router.push(`${basePath}/${t.key}`)
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {t.label.toUpperCase()}
              </button>
            )
          })}
        {(isOrders || isReturns) &&
          ordersNavTabs.map((t) => {
            const active =
              (t.key === 'orders' && isOrders) ||
              (t.key === 'returns' && isReturns) ||
              (t.key === 'loyalty' && isLoyalty)
            return (
              <button
                key={t.key}
                onClick={() => {
                  const basePath = pathname.replace(
                    /\/admin\/(orders|returns|loyalty).*/,
                    '/admin',
                  )
                  router.push(`${basePath}/${t.key}`)
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {t.label.toUpperCase()}
              </button>
            )
          })}
        {isAdmin &&
          adminTabs.map((t) => {
            const active = (searchParams.get('tab') || 'dashboard') === t.key
            return (
              <button
                key={t.key}
                onClick={() => {
                  const params = new URLSearchParams(searchParams.toString())
                  params.set('tab', t.key)
                  router.replace(`${pathname}?${params.toString()}`, {
                    scroll: false,
                  })
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {t.label.toUpperCase()}
              </button>
            )
          })}
        {isFooter &&
          LOCALES.map((loc) => (
            <button
              key={loc}
              onClick={() => setActiveLocale(loc)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeLocale === loc
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {loc.toUpperCase()}
            </button>
          ))}
      </div>
      <div className="flex items-center gap-2">
        {isAdmin &&
          (searchParams.get('tab') || 'dashboard') === 'dashboard' && (
            <div className="border-r pr-2 self-stretch flex items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    onClick={() => {
                      queryClient.invalidateQueries({
                        queryKey: ['admin-dashboard'],
                      })
                      queryClient.invalidateQueries({
                        queryKey: ['admin-dashboard-orders'],
                      })
                      toast.info(ta('dashboard_refreshed'))
                    }}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{ta('dashboard_refresh')}</TooltipContent>
              </Tooltip>
            </div>
          )}
        {isAdmin &&
          (searchParams.get('tab') || 'dashboard') === 'protection' && (
            <div className="border-r pr-2 self-stretch flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant={
                      searchParams.get('period') === 'day'
                        ? 'default'
                        : 'outline'
                    }
                    onClick={() => {
                      const p = new URLSearchParams(searchParams.toString())
                      p.set('period', 'day')
                      router.replace(`${pathname}?${p.toString()}`, {
                        scroll: false,
                      })
                    }}
                  >
                    Д
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {ta('staff_period_day') || 'День'}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant={
                      searchParams.get('period') === 'week'
                        ? 'default'
                        : 'outline'
                    }
                    onClick={() => {
                      const p = new URLSearchParams(searchParams.toString())
                      p.set('period', 'week')
                      router.replace(`${pathname}?${p.toString()}`, {
                        scroll: false,
                      })
                    }}
                  >
                    Н
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {ta('staff_period_week') || 'Неделя'}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant={
                      !searchParams.get('period') ||
                      searchParams.get('period') === 'month'
                        ? 'default'
                        : 'outline'
                    }
                    onClick={() => {
                      const p = new URLSearchParams(searchParams.toString())
                      p.delete('period')
                      router.replace(`${pathname}?${p.toString()}`, {
                        scroll: false,
                      })
                    }}
                  >
                    М
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {ta('staff_period_month') || 'Месяц'}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant={
                      searchParams.get('period') === 'year'
                        ? 'default'
                        : 'outline'
                    }
                    onClick={() => {
                      const p = new URLSearchParams(searchParams.toString())
                      p.set('period', 'year')
                      router.replace(`${pathname}?${p.toString()}`, {
                        scroll: false,
                      })
                    }}
                  >
                    Г
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {ta('staff_period_year') || 'Год'}
                </TooltipContent>
              </Tooltip>
              <div className="ml-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant={
                        searchParams.get('realtime') === '1'
                          ? 'default'
                          : 'outline'
                      }
                      onClick={() => {
                        const p = new URLSearchParams(searchParams.toString())
                        if (p.get('realtime') === '1') p.delete('realtime')
                        else p.set('realtime', '1')
                        router.replace(`${pathname}?${p.toString()}`, {
                          scroll: false,
                        })
                      }}
                    >
                      <RefreshCw
                        className={`w-4 h-4 ${searchParams.get('realtime') === '1' ? 'animate-spin' : ''}`}
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{ta('protection_realtime')}</TooltipContent>
                </Tooltip>
              </div>
            </div>
          )}
        {isAdmin && (searchParams.get('tab') || 'dashboard') === 'workers' && (
          <div className="border-r pr-2 self-stretch flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  onClick={() => {
                    setRefreshing(true)
                    Promise.resolve(
                      (window as any).__refreshWorkers?.(),
                    ).finally(() => setTimeout(() => setRefreshing(false), 600))
                  }}
                >
                  <RefreshCw
                    className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{ta('workers_refresh')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="destructive"
                  onClick={() => setRestartDialogOpen(true)}
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{ta('workers_restart')}</TooltipContent>
            </Tooltip>
          </div>
        )}
        {isAdmin && (searchParams.get('tab') || 'dashboard') === 'backup' && (
          <div className="border-r pr-2 self-stretch flex items-center gap-2">
            <Popover open={backupTimeOpen} onOpenChange={setBackupTimeOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-24 font-normal text-center cursor-pointer gap-1 text-base"
                >
                  <span className="flex-1">{backupTime}</span>
                  <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-fit p-2"
                align="center"
                sideOffset={4}
              >
                <div className="flex gap-1">
                  <div
                    ref={backupHoursRef}
                    className="flex flex-col gap-0.5 max-h-[220px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                  >
                    {Array.from({ length: 24 }, (_, i) =>
                      String(i).padStart(2, '0'),
                    ).map((h) => (
                      <button
                        key={h}
                        type="button"
                        data-selected={
                          h === backupTime.split(':')[0] || undefined
                        }
                        className={`px-3 py-1 text-sm rounded-md cursor-pointer transition-colors ${
                          h === backupTime.split(':')[0]
                            ? 'bg-primary text-primary-foreground font-medium'
                            : 'hover:bg-accent text-foreground'
                        }`}
                        onClick={() => {
                          ;(window as any).__setBackupTime?.(
                            `${h}:${backupTime.split(':')[1]}`,
                          )
                          setBackupTimeOpen(false)
                        }}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                  <div className="w-px bg-border self-stretch" />
                  <div
                    ref={backupMinutesRef}
                    className="flex flex-col gap-0.5 max-h-[220px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                  >
                    {Array.from({ length: 60 }, (_, i) =>
                      String(i).padStart(2, '0'),
                    ).map((m) => (
                      <button
                        key={m}
                        type="button"
                        data-selected={
                          m === backupTime.split(':')[1] || undefined
                        }
                        className={`px-3 py-1 text-sm rounded-md cursor-pointer transition-colors ${
                          m === backupTime.split(':')[1]
                            ? 'bg-primary text-primary-foreground font-medium'
                            : 'hover:bg-accent text-foreground'
                        }`}
                        onClick={() => {
                          ;(window as any).__setBackupTime?.(
                            `${backupTime.split(':')[0]}:${m}`,
                          )
                          setBackupTimeOpen(false)
                        }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  onClick={() => (window as any).__saveBackupConfig?.()}
                >
                  <Save className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{ta('backup_save_config')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="default"
                  onClick={() => (window as any).__triggerBackup?.()}
                >
                  <Play className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{ta('backup_run')}</TooltipContent>
            </Tooltip>
          </div>
        )}
        {pathname.includes('/admin/users') && (
          <div className="border-r pr-2 self-stretch flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  onClick={() => (window as any).__openCreateUser?.()}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{ta('create_user')}</TooltipContent>
            </Tooltip>
          </div>
        )}
        {pathname.includes('/admin/roles') && (
          <div className="border-r pr-2 self-stretch flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  onClick={() => (window as any).__openCreateRole?.()}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{ta('roles_create')}</TooltipContent>
            </Tooltip>
          </div>
        )}
        {pathname.includes('/admin/categories') && (
          <div className="border-r pr-2 self-stretch flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  onClick={() => (window as any).__openCreateCategory?.()}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{ta('categories_create')}</TooltipContent>
            </Tooltip>
          </div>
        )}
        {pathname.includes('/admin/import') && (
          <div className="border-r pr-2 self-stretch flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  onClick={() => (window as any).__openImportExport?.()}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{ta('import_request')}</TooltipContent>
            </Tooltip>
          </div>
        )}
        {isProtection && (
          <div className="border-r pr-2 self-stretch flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="destructive"
                  onClick={() => (window as any).__openBanModal?.()}
                >
                  <Ban className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{ta('protection_ban')}</TooltipContent>
            </Tooltip>
          </div>
        )}
        {(isStaff || isStaffTab) && (
          <div className="border-r pr-2 self-stretch flex items-center gap-1">
            {(['day', 'week', 'month', 'year'] as const).map((p) => (
              <Tooltip key={p}>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant={
                      staffPeriod === p && !staffCustomRange
                        ? 'default'
                        : 'outline'
                    }
                    onClick={() => (window as any).__staffSetPeriod?.(p)}
                  >
                    {p === 'day'
                      ? 'Д'
                      : p === 'week'
                        ? 'Н'
                        : p === 'month'
                          ? 'М'
                          : 'Г'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{ta('staff_period_' + p)}</TooltipContent>
              </Tooltip>
            ))}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  size="icon"
                  variant={staffCustomRange ? 'default' : 'outline'}
                  className="ml-1"
                >
                  <CalendarDays className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  navLayout="around"
                  selected={staffCustomRange}
                  onSelect={(r: any) => {
                    if (r?.from && r?.to)
                      (window as any).__staffSetCustomRange?.({
                        from: r.from,
                        to: new Date(
                          r.to.getFullYear(),
                          r.to.getMonth(),
                          r.to.getDate(),
                          23,
                          59,
                          59,
                        ),
                      })
                  }}
                  locale={ru}
                />
              </PopoverContent>
            </Popover>
            {staffSelectedId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="destructive"
                    onClick={() => (window as any).__staffResetStaff?.()}
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{ta('staff_reset')}</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
        {pathname.includes('/admin/loyalty') && (
          <div className="border-r pr-2 self-stretch flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  onClick={() => (window as any).__openCreateLoyalty?.()}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{ta('loyalty_create')}</TooltipContent>
            </Tooltip>
          </div>
        )}
        {pathname.includes('/admin/novaposhta') && (
          <div className="border-r pr-2 self-stretch flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  onClick={() => (window as any).__openCreateSender?.()}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{ta('novaposhta_sender_create')}</TooltipContent>
            </Tooltip>
          </div>
        )}
        {(isFooter || isSettings) && (
          <div className="border-r pr-2 self-stretch flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  onClick={() => {
                    if (isFooter) (window as any).__saveFooter?.()
                    if (isSettings) (window as any).__saveSettings?.()
                  }}
                >
                  <Save className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {ta('save_footer', { locale: activeLocale.toUpperCase() })}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
        {isPricing && (
          <div className="border-r pr-2 self-stretch flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground whitespace-nowrap">
              <SlidersHorizontal className="w-4 h-4 text-primary" />
              {ta('pricing_general')}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 rounded-full"
              onClick={() => {
                const current = Number(pricingOtpDigits.join(''))
                const newVal = Math.max(0, current - 1)
                const str = String(newVal).padStart(3, '0')
                setPricingOtpDigits(str.split(''))
                ;(window as any).__pricingSetGeneralMargin?.(newVal)
              }}
            >
              <Minus className="w-3.5 h-3.5" />
            </Button>
            <div className="flex items-center gap-0.5">
              {pricingOtpDigits.map((digit, i) => (
                <Input
                  key={i}
                  type="text"
                  inputMode="numeric"
                  value={digit}
                  className="w-7 h-8 text-center text-sm font-mono p-0 rounded-md border-2 focus:border-primary"
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const char = e.target.value
                    if (char && /\d/.test(char)) {
                      const digits = [...pricingOtpDigits]
                      digits[i] = char.slice(-1)
                      setPricingOtpDigits(digits)
                      const num = Math.min(
                        100,
                        Math.max(0, Number(digits.join(''))),
                      )
                      ;(window as any).__pricingSetGeneralMargin?.(num)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace') {
                      const digits = [...pricingOtpDigits]
                      digits[i] = '0'
                      setPricingOtpDigits(digits)
                      const num = Math.min(
                        100,
                        Math.max(0, Number(digits.join(''))),
                      )
                      ;(window as any).__pricingSetGeneralMargin?.(num)
                    }
                  }}
                />
              ))}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 rounded-full"
              onClick={() => {
                const current = Number(pricingOtpDigits.join(''))
                const newVal = Math.min(100, current + 1)
                const str = String(newVal).padStart(3, '0')
                setPricingOtpDigits(str.split(''))
                ;(window as any).__pricingSetGeneralMargin?.(newVal)
              }}
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
            <span className="text-base font-semibold text-foreground">%</span>
            <div className="w-px h-6 bg-border mx-1" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  className="bg-green-500 text-white hover:bg-green-600 disabled:opacity-60"
                  disabled={['PENDING', 'PROGRESS'].includes(
                    pricingTaskStatus || '',
                  )}
                  onClick={() => (window as any).__applyPricing?.()}
                >
                  {['PENDING', 'PROGRESS'].includes(pricingTaskStatus || '') ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{ta('apply')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  onClick={() => (window as any).__savePricing?.()}
                >
                  <Save className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{ta('save')}</TooltipContent>
            </Tooltip>
          </div>
        )}
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-xl tracking-tight shrink-0"
        >
          <div className="bg-primary text-primary-foreground p-1 rounded">
            <FalconLogo className="w-6 h-6" />
          </div>
          <span className="hidden sm:inline">{brandName}</span>
        </Link>
        <div className="border-l pl-2 flex items-center gap-1">
          <LanguageSwitcher />
          <Avatar className="h-8 w-8 ring-2 ring-border">
            <AvatarImage
              src={getAvatarUrl(
                user?.avatar_index,
                user?.full_name || user?.email,
              )}
            />
            <AvatarFallback>
              {getInitials(user?.full_name || '', user?.email)}
            </AvatarFallback>
          </Avatar>
          <ThemeToggle />
        </div>
      </div>

      <Dialog open={restartDialogOpen} onOpenChange={setRestartDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <RotateCcw className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <DialogTitle>{ta('workers_restart')}</DialogTitle>
                <DialogDescription>
                  {ta('workers_restart_confirm')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="rounded-lg bg-muted p-4 flex items-center justify-center gap-4">
            <Badge
              className="bg-blue-500 text-white border-0 gap-1.5 text-sm px-3 py-1"
              variant="default"
            >
              <Activity className="w-3.5 h-3.5" />
              {ta('workers_active')}: {restartCounts.active}
            </Badge>
            <Badge
              className="bg-yellow-500 text-white border-0 gap-1.5 text-sm px-3 py-1"
              variant="default"
            >
              <Clock className="w-3.5 h-3.5" />
              {ta('workers_reserved')}: {restartCounts.reserved}
            </Badge>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRestartDialogOpen(false)}
            >
              {ta('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setRestartDialogOpen(false)
                restartMutation.mutate()
              }}
              disabled={restartMutation.isPending}
              className="gap-2"
            >
              {restartMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              {ta('workers_restart_action')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  )
}

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, isAuthenticated } = useAuthStore()
  const t = useTranslations('admin')
  const tc = useTranslations('common')
  const brandName = useBrandName()
  const roleBadgeColors: Record<string, string> = {
    admin: 'bg-red-500 text-white',
    manager: 'bg-blue-500 text-white',
    operator: 'bg-orange-500 text-white',
    b2b: 'bg-green-500 text-white',
    retail: 'bg-gray-500 text-white',
  }
  const userRole = user?.role || ''
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-muted/10">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!hasRole(user, 'admin', 'manager')) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-muted/10 p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <Ban className="w-16 h-16 mx-auto text-muted-foreground" />
            <h1 className="text-2xl font-bold">{t('access_denied')}</h1>
            <p className="text-muted-foreground">{t('access_denied_desc')}</p>
            {!isAuthenticated ? (
              <Link href="/auth/login">
                <Button>{tc('login')}</Button>
              </Link>
            ) : (
              <Link href="/">
                <Button variant="outline">{t('go_home')}</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const navItems = [
    {
      href: '/admin',
      icon: LayoutDashboard,
      label: t('dashboard_title'),
      roles: ['admin', 'manager', 'operator'],
    },
    {
      href: '/admin/orders',
      icon: ShoppingCart,
      label: t('orders_title'),
      roles: ['admin', 'manager', 'operator'],
    },
    {
      href: '/admin/loyalty',
      icon: Gift,
      label: t('loyalty_title'),
      roles: ['admin', 'manager', 'operator'],
    },
    {
      href: '/admin/waybills',
      icon: ScanBarcode,
      label: t('waybills_title'),
      roles: ['admin', 'manager', 'operator'],
    },
    {
      href: '/admin/support',
      icon: MessageSquare,
      label: t('support_title'),
      roles: ['admin', 'manager', 'operator'],
    },
    {
      href: '/admin/products',
      icon: Package,
      label: t('products_title'),
      roles: ['admin', 'manager', 'operator'],
    },
    {
      href: '/admin/brands',
      icon: Tag,
      label: t('brands_title'),
      roles: ['admin', 'manager', 'operator'],
    },
    {
      href: '/admin/categories',
      icon: FolderTree,
      label: t('categories_title'),
      roles: ['admin', 'manager', 'operator'],
    },
    {
      href: '/admin/catalog',
      icon: Car,
      label: t('catalog_title'),
      roles: ['admin', 'manager', 'operator'],
    },
    {
      href: '/admin/pricing',
      icon: TrendingUp,
      label: t('pricing_title'),
      roles: ['admin', 'manager', 'operator'],
    },
    {
      href: '/admin/users',
      icon: Users,
      label: t('users_title'),
      roles: ['admin', 'manager', 'operator'],
    },
    {
      href: '/admin/roles',
      icon: Shield,
      label: t('roles_title'),
      roles: ['admin', 'manager', 'operator'],
    },
    {
      href: '/admin/tecdoc',
      icon: Database,
      label: t('tecdoc_title'),
      roles: ['admin', 'manager', 'operator'],
    },
    {
      href: '/admin/import',
      icon: FileDown,
      label: t('import_title'),
      roles: ['admin', 'manager', 'operator'],
    },
    {
      href: '/admin/settings',
      icon: Settings,
      label: t('settings_title'),
      roles: ['admin', 'manager', 'operator'],
    },
    {
      href: '/admin/suppliers',
      icon: Truck,
      label: t('suppliers_title'),
      roles: ['admin', 'manager', 'operator'],
    },
    {
      href: '/admin/protection',
      icon: ShieldAlert,
      label: t('protection_title'),
      roles: ['admin', 'manager', 'operator'],
    },
    {
      href: '/admin/footer',
      icon: FileText,
      label: t('footer_title'),
      roles: ['admin', 'manager', 'operator'],
    },
  ]

  return (
    <div className="flex min-h-screen bg-muted/10">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b">
          <Link href="/admin" className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground p-1.5 rounded">
              <LayoutDashboard className="w-5 h-5" />
            </div>
          </Link>
          <div className="flex items-center gap-1">
            {userRole && (
              <Badge
                className={`${roleBadgeColors[userRole] || 'bg-gray-500 text-white'} border-0 text-sm`}
              >
                {t(userRole) || userRole}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <nav className="flex flex-col gap-1 p-4">
          {navItems
            .filter((item) => hasRole(user, ...item.roles))
            .map((item) => {
              const isActive =
                item.href === '/admin'
                  ? pathname === '/admin'
                  : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              )
            })}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen">
        <Suspense fallback={null}>
          <TopBar onMenuClick={() => setSidebarOpen(true)} />
        </Suspense>
        <main className="flex-1 w-full">{children}</main>
      </div>
    </div>
  )
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AdminLocaleProvider>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </AdminLocaleProvider>
  )
}
