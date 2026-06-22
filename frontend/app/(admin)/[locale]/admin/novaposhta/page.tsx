'use client'

import React, { useState, useEffect, Suspense, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Truck,
  Building2,
  Plus,
  Loader2,
  Search,
  MapPin,
  Warehouse,
  Route,
  User,
  Building,
  Briefcase,
  Key,
  Star,
  Globe,
  Trash2,
  AlertTriangle,
  Pencil,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { PhoneInput, phoneToApi, formatPhone } from '@/components/ui/PhoneInput'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { toast } from '@/lib/toast'
import { novaPoshtaApi } from '@/lib/api/nova-poshta'
import type {
  NovaPoshtaSenderProfile,
  NovaPoshtaSenderProfileCreate,
  NovaPoshtaSenderProfileUpdate,
  NovaPoshtaFetchFromTokenResult,
  NovaPoshtaLookupSettlement,
  NovaPoshtaLookupWarehouse,
  NovaPoshtaLookupStreet,
} from '@/lib/types/nova-poshta'

// ═══════════════════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════════════════

function NovaPoshtaPageInner() {
  const t = useTranslations('admin')
  const [showCreateSender, setShowCreateSender] = useState(false)

  useEffect(() => {
    ;(window as any).__openCreateSender = () => setShowCreateSender(true)
    return () => {
      delete (window as any).__openCreateSender
    }
  }, [])

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Left Column: Senders */}
        <div className="space-y-4">
          <SendersColumn
            t={t}
            showCreate={showCreateSender}
            onShowCreateChange={setShowCreateSender}
          />
        </div>

        {/* Right Column: Reference Directories */}
        <div className="space-y-4">
          <ReferenceColumn t={t} />
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function senderDisplayName(sender: NovaPoshtaSenderProfile): string {
  if (sender.sender_type === 'private_person') {
    // name is auto-generated as "LastName FirstName"
    return (
      sender.name ||
      [sender.last_name, sender.first_name].filter(Boolean).join(' ') ||
      '—'
    )
  }
  return sender.organization_name || sender.name || '—'
}

// ═══════════════════════════════════════════════════════════════════════════════
// Senders Column
// ═══════════════════════════════════════════════════════════════════════════════

function SendersColumn({
  t,
  showCreate,
  onShowCreateChange,
}: {
  t: any
  showCreate: boolean
  onShowCreateChange: (v: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [editingSender, setEditingSender] =
    useState<NovaPoshtaSenderProfile | null>(null)
  const [deleteTarget, setDeleteTarget] =
    useState<NovaPoshtaSenderProfile | null>(null)

  const { data: senders = [], isLoading } = useQuery({
    queryKey: ['nova-poshta', 'senders'],
    queryFn: () => novaPoshtaApi.listSenders(true).then((r) => r.data),
  })

  const setDefaultMutation = useMutation({
    mutationFn: (id: number) =>
      novaPoshtaApi.updateSender(id, { is_default: true }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nova-poshta', 'senders'] })
      toast.info(t('novaposhta_default_updated'))
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail || t('novaposhta_error_api')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => novaPoshtaApi.deleteSender(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nova-poshta', 'senders'] })
      toast.success(t('novaposhta_sender_deleted'))
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail || t('novaposhta_error_api')),
  })

  const validateMutation = useMutation({
    mutationFn: (id: number) =>
      novaPoshtaApi.validateSender(id).then((r) => r.data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['nova-poshta', 'senders'] })
      if (result.success) {
        toast.success(
          t('novaposhta_validation_ok') || 'Підключення підтверджено',
        )
      } else {
        toast.error(result.message || t('novaposhta_error_api'))
      }
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail || t('novaposhta_error_api')),
  })

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            {t('novaposhta_senders')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  const typeLabels: Record<string, string> = {
    private_person: t('novaposhta_sender_type_private_person'),
    fop: t('novaposhta_sender_type_fop'),
    business: t('novaposhta_sender_type_business'),
  }

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="w-5 h-5 text-primary" />
            {t('novaposhta_senders')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">
                  {t('novaposhta_sender_type')}
                </TableHead>
                <TableHead>{t('novaposhta_sender')}</TableHead>
                <TableHead className="w-[100px]">
                  {t('novaposhta_status')}
                </TableHead>
                <TableHead className="w-[150px] text-right">
                  {t('actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {senders.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center py-8 text-muted-foreground"
                  >
                    {t('novaposhta_senders_empty')}
                  </TableCell>
                </TableRow>
              )}
              {senders.map((sender: NovaPoshtaSenderProfile) => (
                <TableRow key={sender.id}>
                  {/* Тип */}
                  <TableCell>
                    <Badge variant="outline" className="text-sm font-normal">
                      {typeLabels[sender.sender_type] || sender.sender_type}
                    </Badge>
                  </TableCell>

                  {/* Отправитель */}
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">
                        {senderDisplayName(sender)}
                      </span>
                      {sender.phone && (
                        <span className="text-xs text-muted-foreground mt-0.5">
                          {formatPhone(sender.phone)}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Статус */}
                  <TableCell>
                    <Badge
                      className={`border-0 text-sm ${
                        sender.is_active
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-500 text-white'
                      }`}
                    >
                      {sender.is_active
                        ? t('novaposhta_active')
                        : t('novaposhta_inactive')}
                    </Badge>
                  </TableCell>

                  {/* Действия */}
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setEditingSender(sender)}
                          >
                            <Pencil className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('edit')}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => validateMutation.mutate(sender.id)}
                            disabled={validateMutation.isPending}
                          >
                            {validateMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t('novaposhta_validate') || 'Перевірити'}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setDefaultMutation.mutate(sender.id)}
                          >
                            <Star
                              className={`w-4 h-4 ${
                                sender.is_default
                                  ? 'fill-yellow-500 text-yellow-500'
                                  : 'text-muted-foreground'
                              }`}
                            />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t('novaposhta_set_default')}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="destructive"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setDeleteTarget(sender)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('delete')}</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      {(showCreate || editingSender) && (
        <SenderFormDialog
          t={t}
          sender={editingSender}
          onClose={() => {
            onShowCreateChange(false)
            setEditingSender(null)
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <DialogTitle>{t('novaposhta_delete_sender_title')}</DialogTitle>
                <DialogDescription>
                  {t('novaposhta_delete_sender_confirm')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {deleteTarget && (
            <div className="rounded-lg bg-muted p-3 text-sm min-w-0 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate min-w-0">
                  {senderDisplayName(deleteTarget)}
                </span>
                <Badge variant="outline" className="text-sm shrink-0">
                  {typeLabels[deleteTarget.sender_type] ||
                    deleteTarget.sender_type}
                </Badge>
              </div>
              {deleteTarget.phone && (
                <p className="text-muted-foreground truncate">
                  {formatPhone(deleteTarget.phone)}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate(deleteTarget!.id)}
              disabled={deleteMutation.isPending}
              className="gap-2"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
// ═══════════════════════════════════════════════════════════════════════════════

function SenderFormDialog({
  t,
  sender,
  onClose,
}: {
  t: any
  sender: NovaPoshtaSenderProfile | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const isEdit = !!sender
  const tokenInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    sender_type:
      sender?.sender_type ||
      ('private_person' as 'private_person' | 'fop' | 'business'),
    api_token: sender?.api_token_masked || '',
    first_name: sender?.first_name || '',
    last_name: sender?.last_name || '',
    middle_name: sender?.middle_name || '',
    phone: sender?.phone || '',
    email: sender?.email || '',
    organization_name: sender?.organization_name || '',
    edrpou: sender?.edrpou || '',
    is_active: sender?.is_active ?? true,
  })
  const [dataFetched, setDataFetched] = useState(false)

  const handleTypeChange = (type: 'private_person' | 'fop' | 'business') => {
    setForm((prev) => ({
      ...prev,
      sender_type: type,
    }))
  }

  const createMutation = useMutation({
    mutationFn: (data: NovaPoshtaSenderProfileCreate) =>
      novaPoshtaApi.createSender(data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nova-poshta', 'senders'] })
      toast.success(t('novaposhta_sender_created'))
      onClose()
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail || t('novaposhta_error_api')),
  })

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number
      data: NovaPoshtaSenderProfileUpdate
    }) => novaPoshtaApi.updateSender(id, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nova-poshta', 'senders'] })
      toast.success(t('novaposhta_sender_updated'))
      onClose()
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Error'),
  })

  const fetchFromTokenMutation = useMutation({
    mutationFn: (token: string) =>
      novaPoshtaApi.fetchFromToken(token).then((r) => r.data),
    onSuccess: (result: NovaPoshtaFetchFromTokenResult) => {
      if (!result.success) {
        toast.error(t('novaposhta_api_invalid'))
        return
      }
      // Map NP counterparty data to form fields
      const npType = result.counterparty_type
      let senderType: 'private_person' | 'fop' | 'business' = 'private_person'
      if (npType === 'Organization') {
        const ownershipDesc = result.ownership_form_description || ''
        senderType =
          ownershipDesc.includes('ФОП') || ownershipDesc.includes('ФІЗИЧНА')
            ? 'fop'
            : 'business'
      }

      // NP returns Description as company name (e.g. "СУХІНА ОЛЕНА ЮРІЇВНА ФОП")
      // For organizations, Description is the canonical name, NOT FirstName
      setDataFetched(true)
      setForm((prev) => {
        // NP returns Description as company name (e.g. "СУХІНА ОЛЕНА ЮРІЇВНА ФОП")
        // For organizations, Description is the canonical name, NOT FirstName
        const orgName =
          npType === 'Organization'
            ? result.description || result.first_name || prev.organization_name
            : prev.organization_name

        return {
          ...prev,
          sender_type: senderType,
          first_name: result.first_name || prev.first_name,
          last_name: result.last_name || prev.last_name,
          middle_name: result.middle_name || prev.middle_name,
          phone: result.phone
            ? '+' + result.phone.replace(/^\+/, '')
            : prev.phone,
          email: result.email || prev.email,
          organization_name: orgName,
          edrpou: result.edrpou || prev.edrpou,
        }
      })
      toast.info(t('novaposhta_data_fetched'))
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || t('novaposhta_error_api'))
    },
  })

  const handleTokenKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      e.key === 'Enter' &&
      form.api_token &&
      !form.api_token.startsWith('•')
    ) {
      e.preventDefault()
      setDataFetched(false)
      fetchFromTokenMutation.mutate(form.api_token)
    }
  }

  const handleTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, api_token: e.target.value })
    if (dataFetched) setDataFetched(false)
  }

  const handleSubmit = () => {
    // Validate required fields per NP API
    if (!form.first_name && form.sender_type === 'private_person') {
      toast.error(t('novaposhta_validation_first_name_required'))
      return
    }
    if (!form.last_name) {
      toast.error(t('novaposhta_validation_last_name_required'))
      return
    }
    if (!form.phone) {
      toast.error(t('novaposhta_validation_phone_required'))
      return
    }
    if (form.sender_type !== 'private_person' && !form.edrpou) {
      toast.error(t('novaposhta_validation_edrpou_required'))
      return
    }

    const submission: NovaPoshtaSenderProfileCreate = {
      sender_type: form.sender_type,
      api_token: form.api_token,
      first_name: form.first_name,
      last_name: form.last_name,
      middle_name: form.middle_name,
      phone: phoneToApi(form.phone),
      email: form.email,
      organization_name: form.organization_name,
      edrpou: form.edrpou,
      is_active: form.is_active,
    }

    if (isEdit) {
      const updateData: any = { ...submission }
      if (!updateData.api_token || updateData.api_token.startsWith('•'))
        delete updateData.api_token
      updateMutation.mutate({ id: sender!.id, data: updateData })
    } else {
      if (!submission.api_token) {
        toast.error(t('novaposhta_validation_token_required'))
        return
      }
      createMutation.mutate(submission)
    }
  }

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    fetchFromTokenMutation.isPending
  const isOrg = form.sender_type !== 'private_person'

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Truck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle>
                {isEdit
                  ? t('novaposhta_sender_edit')
                  : t('novaposhta_sender_create')}
              </DialogTitle>
              <DialogDescription>
                {isEdit
                  ? t('novaposhta_sender_edit_desc')
                  : t('novaposhta_sender_create_desc')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          {/* ── Section: API Config ── */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <Key className="w-4 h-4" />
              {t('novaposhta_api_config')}
            </h4>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {isEdit
                    ? t('novaposhta_api_token_masked')
                    : t('novaposhta_api_token')}
                </Label>
                <div className="relative">
                  <Input
                    ref={tokenInputRef}
                    type="password"
                    placeholder={
                      isEdit
                        ? '•••••••• (залиште порожнім, щоб не змінювати)'
                        : t('novaposhta_api_token_placeholder')
                    }
                    value={form.api_token}
                    onChange={handleTokenChange}
                    onKeyDown={handleTokenKeyDown}
                  />
                  {fetchFromTokenMutation.isPending && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Section: Sender Type ── */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <User className="w-4 h-4" />
              {t('novaposhta_sender_info')}
            </h4>
            <div className="grid gap-3">
              {/* Sender Type Selector — RadioGroup horizontal */}
              <div
                className={`grid gap-1.5 ${dataFetched ? 'pointer-events-none opacity-60' : ''}`}
              >
                <Label className="text-xs text-muted-foreground">
                  {t('novaposhta_sender_type')}
                </Label>
                <RadioGroup
                  value={form.sender_type}
                  onValueChange={(v: 'private_person' | 'fop' | 'business') =>
                    handleTypeChange(v)
                  }
                  className="grid grid-cols-3 gap-2"
                >
                  <label className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2.5 cursor-pointer transition-colors hover:bg-accent [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                    <RadioGroupItem
                      value="private_person"
                      className="cursor-pointer"
                    />
                    <User className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm cursor-pointer leading-tight">
                      {t('novaposhta_sender_type_private_person')}
                    </span>
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2.5 cursor-pointer transition-colors hover:bg-accent [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                    <RadioGroupItem value="fop" className="cursor-pointer" />
                    <Briefcase className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm cursor-pointer leading-tight">
                      {t('novaposhta_sender_type_fop')}
                    </span>
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2.5 cursor-pointer transition-colors hover:bg-accent [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                    <RadioGroupItem
                      value="business"
                      className="cursor-pointer"
                    />
                    <Building className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm cursor-pointer leading-tight">
                      {t('novaposhta_sender_type_business')}
                    </span>
                  </label>
                </RadioGroup>
              </div>

              {/* Organization-specific fields */}
              {isOrg && (
                <div className="grid grid-cols-2 gap-3">
                  {/* Organization name — optional for FOP, required for business */}
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">
                      {t('novaposhta_organization')}
                      {form.sender_type === 'business' && (
                        <span className="text-destructive"> *</span>
                      )}
                    </Label>
                    <Input
                      value={form.organization_name}
                      onChange={(e) =>
                        setForm({ ...form, organization_name: e.target.value })
                      }
                      placeholder={t('novaposhta_organization_placeholder')}
                      disabled={dataFetched}
                    />
                  </div>
                  {/* EDRPOU — required for both FOP and business */}
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">
                      {t('novaposhta_edrpou')}{' '}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={form.edrpou}
                      onChange={(e) =>
                        setForm({ ...form, edrpou: e.target.value })
                      }
                      placeholder="12345678"
                      disabled={dataFetched}
                    />
                  </div>
                </div>
              )}

              {/* Contact Person — FirstName, LastName, MiddleName for ALL types */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">
                  {isOrg
                    ? t('novaposhta_contact_name')
                    : t('novaposhta_contact_name')}{' '}
                  <span className="text-destructive">*</span>
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  <div className="grid gap-1.5">
                    <Input
                      value={form.last_name}
                      onChange={(e) =>
                        setForm({ ...form, last_name: e.target.value })
                      }
                      placeholder={t('novaposhta_last_name_placeholder')}
                      disabled={dataFetched}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Input
                      value={form.first_name}
                      onChange={(e) =>
                        setForm({ ...form, first_name: e.target.value })
                      }
                      placeholder={t('novaposhta_first_name_placeholder')}
                      disabled={dataFetched}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Input
                      value={form.middle_name}
                      onChange={(e) =>
                        setForm({ ...form, middle_name: e.target.value })
                      }
                      placeholder={t('novaposhta_middle_name_placeholder')}
                      disabled={dataFetched}
                    />
                  </div>
                </div>
              </div>

              {/* Phone (common to all types) */}
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t('novaposhta_phone')}{' '}
                  <span className="text-destructive">*</span>
                </Label>
                <PhoneInput
                  value={form.phone}
                  onChange={(v) => setForm({ ...form, phone: v })}
                  disabled={dataFetched}
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              {/* Email (optional, from NP API) */}
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t('novaposhta_email') || 'Email'}
                </Label>
                <Input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="email@example.com"
                  disabled={dataFetched}
                />
              </div>
            </div>
          </div>

          {/* ── Section: Settings ── */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <Globe className="w-4 h-4" />
              {t('novaposhta_settings')}
            </h4>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={form.is_active}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, is_active: checked === true })
                  }
                />
                <span className="cursor-pointer">{t('novaposhta_active')}</span>
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isPending} className="gap-2">
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            {isEdit ? t('save') : t('novaposhta_sender_create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Reference Column — Uses default sender, no sender selector
// ═══════════════════════════════════════════════════════════════════════════════

function ReferenceColumn({ t }: { t: any }) {
  // Fetch senders to find the default one
  const { data: senders = [], isLoading: sendersLoading } = useQuery({
    queryKey: ['nova-poshta', 'senders'],
    queryFn: () => novaPoshtaApi.listSenders().then((r) => r.data),
  })

  const defaultSender = senders.find(
    (s: NovaPoshtaSenderProfile) => s.is_default,
  )

  // Settlements search state
  const [cityQuery, setCityQuery] = useState('')
  const [selectedSettlement, setSelectedSettlement] =
    useState<NovaPoshtaLookupSettlement | null>(null)

  // Warehouses state
  const [warehouseQuery, setWarehouseQuery] = useState('')
  const [selectedWarehouse, setSelectedWarehouse] =
    useState<NovaPoshtaLookupWarehouse | null>(null)

  // Streets state
  const [streetQuery, setStreetQuery] = useState('')
  const [selectedStreet, setSelectedStreet] =
    useState<NovaPoshtaLookupStreet | null>(null)

  // Locale
  const locale = 'uk'

  // ── Settlements lookup ──
  const { data: settlements = [], isFetching: settlementsLoading } = useQuery({
    queryKey: ['np-ref', 'settlements', cityQuery, locale],
    queryFn: () =>
      novaPoshtaApi
        .searchSettlements({ query: cityQuery, locale } as any)
        .then((r) => r.data),
    enabled: cityQuery.length >= 2,
    staleTime: 30000,
  })

  // ── Warehouses lookup ──
  const { data: warehouses = [], isFetching: warehousesLoading } = useQuery({
    queryKey: [
      'np-ref',
      'warehouses',
      selectedSettlement?.delivery_city_ref,
      warehouseQuery,
    ],
    queryFn: () =>
      novaPoshtaApi
        .searchWarehouses({
          city_ref: selectedSettlement!.delivery_city_ref,
          query: warehouseQuery,
          locale,
        } as any)
        .then((r) => r.data),
    enabled: !!selectedSettlement?.delivery_city_ref,
    staleTime: 30000,
  })

  // ── Streets lookup ──
  const { data: streets = [], isFetching: streetsLoading } = useQuery({
    queryKey: [
      'np-ref',
      'streets',
      selectedSettlement?.settlement_ref,
      streetQuery,
    ],
    queryFn: () =>
      novaPoshtaApi
        .searchStreets({
          settlement_ref: selectedSettlement!.settlement_ref,
          query: streetQuery,
          locale,
        } as any)
        .then((r) => r.data),
    enabled: !!selectedSettlement?.settlement_ref && streetQuery.length >= 2,
    staleTime: 30000,
  })

  // Handle settlement selection — reset dependent fields
  const handleSettlementChange = (s: NovaPoshtaLookupSettlement | null) => {
    setSelectedSettlement(s)
    if (s) {
      setCityQuery(s.label)
      setWarehouseQuery('')
      setSelectedWarehouse(null)
      setStreetQuery('')
      setSelectedStreet(null)
    }
  }

  if (sendersLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            {t('novaposhta_reference')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (!defaultSender) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            {t('novaposhta_reference')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
            <MapPin className="w-12 h-12 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground max-w-xs">
              {t('novaposhta_no_default_sender')}
            </p>
            <p className="text-xs text-muted-foreground/60">
              {t('novaposhta_no_default_sender_hint')}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Settlements / City Search ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="w-4 h-4 text-primary" />
            {t('novaposhta_city')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <SearchableSelect
            items={settlements}
            isLoading={settlementsLoading}
            value={selectedSettlement}
            onChange={handleSettlementChange}
            placeholder={t('novaposhta_search_city')}
            searchQuery={cityQuery}
            onSearchChange={(q) => {
              setCityQuery(q)
              if (!q) setSelectedSettlement(null)
            }}
            getKey={(s: any) => s.ref}
            getLabel={(s: any) => s.label}
            renderItem={(s: any, _sel: boolean, _high: boolean) => (
              <>
                <div className="font-medium leading-tight">{s.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {[s.area, s.region].filter(Boolean).join(' — ')}
                  {s.warehouses_count && s.warehouses_count !== '0' ? (
                    <span className="ml-2 inline-flex items-center gap-1">
                      <Warehouse className="w-3 h-3" />×{s.warehouses_count}
                    </span>
                  ) : null}
                </div>
              </>
            )}
            noResultsMessage={t('novaposhta_no_results')}
            typeToSearchMessage={t('novaposhta_type_to_search')}
          />
        </CardContent>
      </Card>

      {/* ── Warehouses / Postomats ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Warehouse className="w-4 h-4 text-primary" />
            {t('novaposhta_warehouse')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {selectedSettlement ? (
            <SearchableSelect
              items={warehouses}
              isLoading={warehousesLoading}
              value={selectedWarehouse}
              onChange={(w) => {
                setSelectedWarehouse(w)
                if (w) setWarehouseQuery(w.label)
              }}
              placeholder={t('novaposhta_search_warehouse')}
              searchQuery={warehouseQuery}
              onSearchChange={(q) => {
                setWarehouseQuery(q)
                if (!q) setSelectedWarehouse(null)
              }}
              minSearchLength={1}
              getKey={(w: any) => w.ref}
              getLabel={(w: any) => w.label}
              renderItem={(w: any, _sel: boolean, _high: boolean) => (
                <>
                  <div className="font-medium leading-tight flex items-center gap-2">
                    {w.type === 'Postomat' ? (
                      <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-1.5 py-0.5 rounded font-semibold">
                        {t('novaposhta_postomat')}
                      </span>
                    ) : (
                      <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 px-1.5 py-0.5 rounded font-semibold">
                        №{w.number}
                      </span>
                    )}
                    {w.label}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {w.description}
                  </div>
                </>
              )}
              noResultsMessage={t('novaposhta_no_results')}
            />
          ) : (
            <div className="text-sm text-muted-foreground py-3 text-center">
              {t('novaposhta_select_city_first')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Streets ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Route className="w-4 h-4 text-primary" />
            {t('novaposhta_street')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {selectedSettlement ? (
            <SearchableSelect
              items={streets}
              isLoading={streetsLoading}
              value={selectedStreet}
              onChange={(s) => {
                setSelectedStreet(s)
                if (s) setStreetQuery(s.label)
              }}
              placeholder={t('novaposhta_search_street')}
              searchQuery={streetQuery}
              onSearchChange={(q) => {
                setStreetQuery(q)
                if (!q) setSelectedStreet(null)
              }}
              getKey={(s: any) => s.street_ref}
              getLabel={(s: any) => s.label}
              renderItem={(s: any, _sel: boolean, _high: boolean) => (
                <div className="font-medium leading-tight">
                  {s.street_type ? `${s.street_type}. ` : ''}
                  {s.label}
                </div>
              )}
              minSearchLength={2}
              noResultsMessage={t('novaposhta_no_results')}
              typeToSearchMessage={t('novaposhta_type_to_search')}
            />
          ) : (
            <div className="text-sm text-muted-foreground py-3 text-center">
              {t('novaposhta_select_city_first')}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Page Export
// ═══════════════════════════════════════════════════════════════════════════════

export default function NovaPoshtaPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      }
    >
      <NovaPoshtaPageInner />
    </Suspense>
  )
}
