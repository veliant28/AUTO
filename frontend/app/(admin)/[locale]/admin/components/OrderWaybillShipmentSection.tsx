'use client'

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import {
  Package,
  FileText,
  Archive,
  Truck,
  Circle,
  Search,
  Maximize2,
  Trash2,
  Plus,
  MoreHorizontal,
  Box,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button, buttonVariants } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { novaPoshtaApi } from '@/lib/api/nova-poshta'
import type { NovaPoshtaLookupPackaging } from '@/lib/types/nova-poshta'

type CargoType = 'Cargo' | 'Parcel' | 'Documents' | 'Pallet' | 'TiresWheels'

interface PackagingTableEntry {
  ref: string
  label: string
  description: string
  width_mm: string
  length_mm: string
  height_mm: string
  cost: string
}

interface Props {
  description: string
  cargoType: CargoType
  weight: string
  cost: string
  volumetricWidth: string | undefined
  volumetricLength: string | undefined
  volumetricHeight: string | undefined
  senderProfileId: number
  isPackagingMode: boolean
  onPackagingModeChange: (mode: boolean) => void
  disabled: boolean
  onChange: (field: string, value: any) => void
  // Multi-place props
  isPlacesListMode?: boolean
  activePlaceIndex?: number
  onAddPlace?: () => void
  onSwitchPlace?: (index: number) => void
  onDeletePlaces?: (indices: number[]) => void
  onPlaceChange?: (field: string, value: any) => void
  onPlacesListModeChange?: (mode: boolean) => void
  onCancel?: () => void
  onSave?: () => void
  onFieldBlur?: (field: string, value: any) => void
  isEdit?: boolean
  waybill?: any
  form?: any
}

export default function OrderWaybillShipmentSection({
  description,
  cargoType,
  weight,
  cost,
  volumetricWidth,
  volumetricLength,
  volumetricHeight,
  senderProfileId,
  isPackagingMode,
  onPackagingModeChange,
  disabled,
  onChange,
  isPlacesListMode = false,
  activePlaceIndex = 0,
  onAddPlace,
  onSwitchPlace,
  onDeletePlaces,
  onPlaceChange,
  onPlacesListModeChange,
  onCancel: onModalCancel,
  onSave: onModalSave,
  onFieldBlur,
  isEdit,
  waybill,
  form,
}: Props) {
  const t = useTranslations('admin')

  // ── Shorten packaging label for button display ────────────────────────
  const shortLabel = useCallback((label: string) => {
    if (!label) return ''
    return label
      .replace(/^Коробка\s*/i, 'кор. ')
      .replace(/^Стреч-пленка\s*/i, 'стр. ')
      .replace(/^Стреч\s*/i, 'стр. ')
      .replace(/^Пакет\s*/i, 'пак. ')
      .replace(/^Мішок\s*/i, 'міш. ')
      .replace(/^Ящик\s*/i, 'ящ. ')
      .replace(/\s*квадратна\s*/gi, ' кв. ')
      .replace(/\s*квадратная\s*/gi, ' кв. ')
      .replace(/\s*малий\s*/gi, ' мал.')
      .replace(/\s*малый\s*/gi, ' мал.')
      .replace(/\s*великий\s*/gi, ' вел.')
      .replace(/\s*большой\s*/gi, ' бол.')
      .replace(/\s*середній\s*/gi, ' сер.')
      .replace(/\s*средний\s*/gi, ' сред.')
      .trim()
  }, [])

  // Priority order for packaging display in button
  const getPackPriority = (label: string): number => {
    if (/^Ящик/i.test(label)) return 1
    if (/^Мішок/i.test(label) || /^Мешок/i.test(label)) return 2
    if (/^Коробка/i.test(label)) return 3
    if (/^Стреч/i.test(label)) return 4
    if (/^Пакет/i.test(label)) return 5
    return 6
  }

  // Saved packaging items for the button display
  // When multi-place, read from per-seat data; otherwise from top-level
  const savedPackItems: PackagingTableEntry[] =
    form?.options_seat?.length > 1
      ? form.options_seat[activePlaceIndex]?.pack_items || []
      : form?.pack_items || []

  // ── Packaging mode state ──────────────────────────────────────────────
  const [packagingQuery, setPackagingQuery] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [highlightedIdx, setHighlightedIdx] = useState(-1)
  const [tableItems, setTableItems] = useState<PackagingTableEntry[]>([])
  const [checkedRefs, setCheckedRefs] = useState<Set<string>>(new Set())
  const dropdownRef = useRef<HTMLDivElement>(null)
  const dropdownScrollRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Track last added item for dimensions display
  const lastAddedItem = useMemo(
    () => (tableItems.length > 0 ? tableItems[tableItems.length - 1] : null),
    [tableItems],
  )

  // Convert cm (form) → mm (NP API) — but NOT for packaging search:
  // when looking for packaging to ADD we want ALL types, not filtered by
  // dimensions that were already saved from a previous selection.
  const lengthMm = volumetricLength
    ? Math.round(parseFloat(volumetricLength) * 10)
    : 0
  const widthMm = volumetricWidth
    ? Math.round(parseFloat(volumetricWidth) * 10)
    : 0
  const heightMm = volumetricHeight
    ? Math.round(parseFloat(volumetricHeight) * 10)
    : 0

  // ── Fetch packaging types (always with zero dims — show ALL available) ──
  const { data: packagingItems = [], isLoading: isLoadingPackaging } = useQuery(
    {
      queryKey: ['np-lookup', 'pack-types', senderProfileId],
      queryFn: () =>
        novaPoshtaApi
          .listPackTypes({
            sender_profile_id: senderProfileId || undefined,
            length_mm: 0,
            width_mm: 0,
            height_mm: 0,
          })
          .then((r) => r.data),
      enabled: isPackagingMode,
      staleTime: 60000,
    },
  )

  // ── Client-side text filter ───────────────────────────────────────────
  const filteredPackaging = useMemo(() => {
    if (!packagingQuery) return packagingItems
    const q = packagingQuery.toLowerCase()
    return packagingItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q),
    )
  }, [packagingItems, packagingQuery])

  // Items already in the table (by ref)
  const tableItemRefs = useMemo(
    () => new Set(tableItems.map((i) => i.ref)),
    [tableItems],
  )

  // Filter out already-added items from dropdown
  const dropdownItems = useMemo(
    () => filteredPackaging.filter((item) => !tableItemRefs.has(item.ref)),
    [filteredPackaging, tableItemRefs],
  )

  // ── Reset highlighted index when results change ───────────────────────
  useEffect(() => {
    setHighlightedIdx(-1)
  }, [dropdownItems])

  // ── Scroll highlighted item into view ─────────────────────────────────
  useEffect(() => {
    if (highlightedIdx < 0 || !dropdownScrollRef.current) return
    const item = dropdownScrollRef.current.querySelector(
      `[data-index="${highlightedIdx}"]`,
    ) as HTMLElement | null
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlightedIdx])

  // ── Close dropdown on click outside ────────────────────────────────────
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ── Restore previously saved items when entering packaging mode ─────────
  useEffect(() => {
    if (isPackagingMode) {
      const items: PackagingTableEntry[] =
        form?.options_seat?.length > 1
          ? form.options_seat[activePlaceIndex]?.pack_items || []
          : form?.pack_items || []
      if (items.length > 0) {
        setTableItems(items)
      }
    }
  }, [isPackagingMode, activePlaceIndex])

  // ── Add item to table ─────────────────────────────────────────────────
  const addToTable = useCallback(
    (item: NovaPoshtaLookupPackaging) => {
      setTableItems((prev) => [
        ...prev,
        {
          ref: item.ref,
          label: item.label,
          description: item.description,
          width_mm: item.width_mm,
          length_mm: item.length_mm,
          height_mm: item.height_mm,
          cost: item.cost,
        },
      ])
      // Update form dimensions from packaging (mm → cm) immediately
      if (item.width_mm)
        onChange('volumetric_width', String(parseFloat(item.width_mm) / 10))
      if (item.length_mm)
        onChange('volumetric_length', String(parseFloat(item.length_mm) / 10))
      if (item.height_mm)
        onChange('volumetric_height', String(parseFloat(item.height_mm) / 10))
      // Save pack ref so payload builder sends it to NP API
      onChange('pack_ref', item.ref)
      onChange('pack_refs', [item.ref])
      // Save packaging name and cost for display in UI
      onChange('pack_label', item.label)
      onChange('pack_cost', item.cost)
      setPackagingQuery('')
      setIsDropdownOpen(false)
      setHighlightedIdx(-1)
      // Focus back on search input
      setTimeout(() => searchInputRef.current?.focus(), 0)
    },
    [onChange],
  )

  // ── Checkbox logic ────────────────────────────────────────────────────
  const toggleCheck = useCallback((ref: string) => {
    setCheckedRefs((prev) => {
      const next = new Set(prev)
      if (next.has(ref)) next.delete(ref)
      else next.add(ref)
      return next
    })
  }, [])

  const allChecked =
    tableItems.length > 0 && checkedRefs.size === tableItems.length

  const toggleSelectAll = useCallback(() => {
    if (allChecked) {
      setCheckedRefs(new Set())
    } else {
      setCheckedRefs(new Set(tableItems.map((i) => i.ref)))
    }
  }, [allChecked, tableItems])

  // ── Delete selected ──────────────────────────────────────────────────
  const deleteSelected = useCallback(() => {
    setTableItems((prev) => prev.filter((item) => !checkedRefs.has(item.ref)))
    setCheckedRefs(new Set())
  }, [checkedRefs])

  // ── Search input keyboard navigation ─────────────────────────────────
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (!isDropdownOpen) {
          setIsDropdownOpen(true)
          setHighlightedIdx(0)
        } else {
          setHighlightedIdx((prev) =>
            prev < dropdownItems.length - 1 ? prev + 1 : 0,
          )
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIdx((prev) =>
          prev > 0 ? prev - 1 : dropdownItems.length - 1,
        )
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (
          isDropdownOpen &&
          highlightedIdx >= 0 &&
          highlightedIdx < dropdownItems.length
        ) {
          addToTable(dropdownItems[highlightedIdx])
        }
      } else if (e.key === 'Escape') {
        setIsDropdownOpen(false)
        setHighlightedIdx(-1)
      }
    },
    [isDropdownOpen, dropdownItems, highlightedIdx, addToTable],
  )

  // ── Cancel / Save ─────────────────────────────────────────────────────
  const handleCancel = useCallback(() => {
    setTableItems([])
    setCheckedRefs(new Set())
    setPackagingQuery('')
    setIsDropdownOpen(false)
    onPackagingModeChange(false)
  }, [onPackagingModeChange])

  const handleSave = useCallback(() => {
    // Save selected packaging refs and full items to form
    const refs = tableItems.map((item) => item.ref)
    onChange('pack_refs', refs)
    onChange('pack_items', tableItems)
    // Save dimensions from the last added packaging item (mm → cm)
    if (lastAddedItem) {
      const w = lastAddedItem.width_mm
        ? String(parseFloat(lastAddedItem.width_mm) / 10)
        : ''
      const l = lastAddedItem.length_mm
        ? String(parseFloat(lastAddedItem.length_mm) / 10)
        : ''
      const h = lastAddedItem.height_mm
        ? String(parseFloat(lastAddedItem.height_mm) / 10)
        : ''
      onChange('volumetric_width', w)
      onChange('volumetric_length', l)
      onChange('volumetric_height', h)
    }
    // Exit packaging mode
    setTableItems([])
    setCheckedRefs(new Set())
    setPackagingQuery('')
    onPackagingModeChange(false)
  }, [tableItems, onChange, onPackagingModeChange, lastAddedItem])

  // ── Cargo type meta ───────────────────────────────────────────────────
  const cargoTypeMeta: {
    value: CargoType
    label: string
    icon: React.ElementType
  }[] = [
    {
      value: 'Documents',
      label: t('novaposhta_cargo_type_documents'),
      icon: FileText,
    },
    {
      value: 'Parcel',
      label: t('novaposhta_cargo_type_parcel'),
      icon: Archive,
    },
    { value: 'Cargo', label: t('novaposhta_cargo_type_cargo'), icon: Truck },
    { value: 'Pallet', label: t('novaposhta_cargo_type_pallet'), icon: Circle },
    {
      value: 'TiresWheels',
      label: t('novaposhta_cargo_type_tires_wheels'),
      icon: Package,
    },
  ]

  // ── Dimension helpers ─────────────────────────────────────────────────
  const dimCm = (mm: string) => {
    const v = parseFloat(mm)
    return v > 0 ? `${v / 10} см` : ''
  }

  // ── Effective weight helper (max of actual weight & volumetric weight) ─
  const effectiveWeight = useCallback((seat: any): string => {
    const norm = (v: string) => parseFloat((v || '0').replace(',', '.'))
    const actualW = norm(seat?.weight)
    const w = norm(seat?.volumetric_width)
    const l = norm(seat?.volumetric_length)
    const h = norm(seat?.volumetric_height)
    const volumetricW = w > 0 && l > 0 && h > 0 ? (w * l * h) / 4000 : 0
    return Math.max(actualW, volumetricW)
      .toFixed(1)
      .replace(/\.?0+$/, '')
  }, [])

  // ── Volumetric weight only (W×L×H / 4000, without actual weight) ──
  const volumetricWeight = useCallback((): string => {
    const norm = (v: string | undefined) =>
      parseFloat((v || '0').replace(',', '.'))
    const w = norm(volumetricWidth)
    const l = norm(volumetricLength)
    const h = norm(volumetricHeight)
    if (w > 0 && l > 0 && h > 0) {
      const vw = (w * l * h) / 4000
      return vw.toFixed(1).replace(/\.?0+$/, '')
    }
    return '0'
  }, [volumetricWidth, volumetricLength, volumetricHeight])

  // ── Reset checkboxes when entering list mode ─────────────────────────
  useEffect(() => {
    if (isPlacesListMode) {
      setCheckedPlaces(new Set())
    }
  }, [isPlacesListMode])

  // ── Places list state ─────────────────────────────────────────────────
  const [checkedPlaces, setCheckedPlaces] = useState<Set<number>>(new Set())
  const seatsAmount = form?.seats_amount || 1
  const checkableCount = Math.max(0, (form?.options_seat?.length || 0) - 1) // exclude index 0 (main place)
  const allPlacesChecked =
    checkableCount > 0 && checkedPlaces.size === checkableCount

  const togglePlace = useCallback((idx: number) => {
    setCheckedPlaces((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }, [])

  const toggleAllPlaces = useCallback(() => {
    if (allPlacesChecked) {
      setCheckedPlaces(new Set())
    } else {
      // Select all places except index 0 (main place cannot be deleted)
      setCheckedPlaces(
        new Set(
          (form?.options_seat || [])
            .map((_: any, i: number) => i)
            .filter((i) => i > 0),
        ),
      )
    }
  }, [allPlacesChecked, form?.options_seat])

  const deleteSelectedPlaces = useCallback(() => {
    if (checkedPlaces.size === 0) return
    const indices = Array.from(checkedPlaces).sort((a, b) => b - a)
    onDeletePlaces?.(indices)
    setCheckedPlaces(new Set())
  }, [checkedPlaces, onDeletePlaces])

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <section className="order-2 rounded-md border p-3 h-full flex flex-col bg-card">
      {/* ── Header ── */}
      <div className="flex min-h-8 items-center gap-2 shrink-0">
        <h3 className="text-lg font-semibold flex items-center gap-2 flex-shrink-0">
          <Package className="w-5 h-5" />
          {isPlacesListMode
            ? `${t('novaposhta_shipment_heading')} / ${t('novaposhta_places_list_title')}`
            : isPackagingMode
              ? t('novaposhta_packaging')
              : seatsAmount === 1 || activePlaceIndex === 0
                ? t('novaposhta_shipment_heading')
                : `${t('novaposhta_shipment_heading')} *${activePlaceIndex.toString().padStart(4, '0')}`}
        </h3>
        {/* Multi-place button: "+" when single, "⁝" when multiple */}
        <div className="ml-auto">
          {seatsAmount === 1 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={onAddPlace}
                  disabled={disabled || isPackagingMode}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t('novaposhta_add_place')}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => onPlacesListModeChange?.(!isPlacesListMode)}
              disabled={disabled || isPackagingMode}
            >
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {isPlacesListMode ? (
        /* ═══════════════ Places list mode ═══════════════ */
        <div className="flex flex-col gap-2 flex-1 min-h-0 pt-2 px-1.5">
          {/* Toolbar */}
          {form?.options_seat && form.options_seat.length > 0 && (
            <div className="flex items-center justify-between shrink-0">
              <div
                role="button"
                tabIndex={0}
                className={cn(
                  buttonVariants({ variant: 'outline' }),
                  'gap-2 px-3 cursor-pointer',
                )}
                onClick={toggleAllPlaces}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggleAllPlaces()
                  }
                }}
              >
                <Checkbox
                  checked={allPlacesChecked}
                  className="cursor-pointer"
                />
                {t('novaposhta_packaging_select_all')}
              </div>
              <Button
                variant="destructive"
                className="gap-2"
                disabled={checkedPlaces.size === 0}
                onClick={deleteSelectedPlaces}
              >
                <Trash2 className="w-4 h-4" />
                {t('novaposhta_packaging_delete_selected')}
              </Button>
            </div>
          )}
          {/* Table */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {form?.options_seat && form.options_seat.length > 0 ? (
              <div className="border rounded-md divide-y">
                {form.options_seat.map((seat: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-muted/50"
                    onDoubleClick={() => onSwitchPlace?.(idx)}
                  >
                    {idx > 0 ? (
                      <Checkbox
                        checked={checkedPlaces.has(idx)}
                        onCheckedChange={() => togglePlace(idx)}
                        className="cursor-pointer"
                      />
                    ) : (
                      <div className="w-5" /> /* spacer to align with checkboxes */
                    )}
                    <span className="flex-1 text-sm min-w-0 truncate">
                      <span
                        className={
                          seat.description ? '' : 'text-muted-foreground'
                        }
                      >
                        {seat.description ||
                          `${t('novaposhta_place_name')} ${idx + 1}`}
                      </span>
                    </span>
                    <span className="text-sm text-muted-foreground shrink-0">
                      {effectiveWeight(seat)} кг
                    </span>
                    <span className="text-sm text-muted-foreground shrink-0 font-mono w-14 text-right">
                      *{idx.toString().padStart(4, '0')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground text-center py-4 border rounded-md">
                {t('novaposhta_places_list_title')}
              </div>
            )}
          </div>
          {/* Add button */}
          <div className="flex justify-end gap-2 pt-1 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onAddPlace?.()}
              disabled={disabled || isPackagingMode}
            >
              {t('novaposhta_add_place_button')}
            </Button>
          </div>
        </div>
      ) : isPackagingMode ? (
        /* ═══════════════ Packaging search mode ═══════════════ */
        <div className="flex flex-col gap-2 flex-1 min-h-0">
          {/* ── Row 1: Search + Dimensions (outside scroll to avoid clipping dropdown) ── */}
          <div className="grid grid-cols-2 gap-3 items-end shrink-0 px-1.5">
            {/* Search */}
            <div ref={dropdownRef} className="relative">
              <Label className="text-sm text-muted-foreground mb-0.5 block">
                {t('novaposhta_search_packaging')}
              </Label>
              <div className="relative overflow-visible">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  ref={searchInputRef}
                  value={packagingQuery}
                  onChange={(e) => {
                    setPackagingQuery(e.target.value)
                    setIsDropdownOpen(true)
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={t('novaposhta_search_packaging')}
                  className="pl-8"
                  disabled={disabled}
                />
                {isLoadingPackaging && (
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                  </div>
                )}
              </div>

              {/* Dropdown */}
              {isDropdownOpen && (
                <div ref={dropdownScrollRef} className="absolute top-full mt-1 left-0 right-0 z-50 bg-popover border rounded-md shadow-lg max-h-[240px] overflow-y-auto py-1">
                  {/* Loading state */}
                  {isLoadingPackaging && (
                    <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
                      <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                      {t('novaposhta_loading')}
                    </div>
                  )}

                  {/* Items */}
                  {!isLoadingPackaging &&
                    dropdownItems.length > 0 &&
                    dropdownItems.map((item, idx) => (
                      <div
                        key={item.ref}
                        data-index={idx}
                        className={`px-3 py-2 text-sm cursor-pointer transition-colors flex flex-col gap-0.5 ${
                          idx === highlightedIdx
                            ? 'bg-accent'
                            : 'hover:bg-muted'
                        }`}
                        onMouseEnter={() => setHighlightedIdx(idx)}
                        onClick={() => addToTable(item)}
                      >
                        <span className="text-sm font-medium">
                          {item.label}
                        </span>
                        {item.description && (
                          <span className="text-xs text-muted-foreground">
                            {item.description}
                          </span>
                        )}
                        <div className="flex gap-2 text-xs text-muted-foreground">
                          <span>
                            {item.length_mm} × {item.width_mm} ×{' '}
                            {item.height_mm} мм
                          </span>
                          {item.cost !== '0' && <span>{item.cost} ₴</span>}
                        </div>
                      </div>
                    ))}

                  {/* No results / type-to-search */}
                  {!isLoadingPackaging &&
                    (dropdownItems.length === 0 && packagingQuery.length > 0 ? (
                      <div className="text-sm text-muted-foreground py-3 text-center">
                        {t('novaposhta_no_packaging_found')}
                      </div>
                    ) : !isLoadingPackaging &&
                      packagingQuery.length === 0 &&
                      packagingItems.length > 0 ? (
                      <div className="text-sm text-muted-foreground py-3 text-center">
                        {t('novaposhta_type_to_search_packaging')}
                      </div>
                    ) : null)}

                  {/* Fetched but empty list from API */}
                  {!isLoadingPackaging &&
                    packagingQuery.length === 0 &&
                    packagingItems.length === 0 && (
                      <div className="text-sm text-muted-foreground py-3 text-center">
                        {t('novaposhta_no_packaging_available')}
                      </div>
                    )}
                </div>
              )}
            </div>

            {/* Dimensions display */}
            <div className="flex gap-1.5 items-end">
              <div className="flex items-center justify-center shrink-0 h-10">
                <Maximize2 className="w-5 h-5" />
              </div>
              <div className="flex-1 grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-sm text-muted-foreground">
                    {t('novaposhta_length')}
                  </Label>
                  <Input
                    value={dimCm(lastAddedItem?.length_mm || '')}
                    readOnly
                    className="text-sm text-center mt-0.5"
                  />
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">
                    {t('novaposhta_width')}
                  </Label>
                  <Input
                    value={dimCm(lastAddedItem?.width_mm || '')}
                    readOnly
                    className="text-sm text-center mt-0.5"
                  />
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">
                    {t('novaposhta_height')}
                  </Label>
                  <Input
                    value={dimCm(lastAddedItem?.height_mm || '')}
                    readOnly
                    className="text-sm text-center mt-0.5"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Scrollable area for table + toolbar ── */}
          <div className="flex-1 overflow-y-auto space-y-2 min-h-0 px-1.5">
            {/* ── Toolbar: Select + Delete ── */}
            {tableItems.length > 0 && (
              <div className="flex items-center justify-between">
                <div
                  role="button"
                  tabIndex={0}
                  className={cn(
                    buttonVariants({ variant: 'outline' }),
                    'gap-2 px-3 cursor-pointer',
                  )}
                  onClick={toggleSelectAll}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleSelectAll()
                    }
                  }}
                >
                  <Checkbox checked={allChecked} className="cursor-pointer" />
                  {t('novaposhta_packaging_select_all')}
                </div>
                <Button
                  variant="destructive"
                  className="gap-2"
                  disabled={checkedRefs.size === 0}
                  onClick={deleteSelected}
                >
                  <Trash2 className="w-4 h-4" />
                  {t('novaposhta_packaging_delete_selected')}
                </Button>
              </div>
            )}

            {/* ── Table ── */}
            {tableItems.length > 0 ? (
              <div className="border rounded-md divide-y">
                {tableItems.map((item) => (
                  <div
                    key={item.ref}
                    className="flex items-center gap-2 px-3 py-2.5"
                  >
                    <Checkbox
                      checked={checkedRefs.has(item.ref)}
                      onCheckedChange={() => toggleCheck(item.ref)}
                      className="cursor-pointer"
                    />
                    <span
                      className="flex-1 text-sm min-w-0 truncate cursor-pointer"
                      onClick={() => toggleCheck(item.ref)}
                    >
                      {item.label}
                    </span>
                    {item.cost !== '0' && (
                      <span className="text-sm font-medium text-foreground shrink-0">
                        {item.cost} грн
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground text-center py-4 border rounded-md">
                {t('novaposhta_no_packaging_selected')}
              </div>
            )}
          </div>

          {/* ── Footer: Cancel + Save (sticky at bottom) ── */}
          <div className="flex justify-end gap-2 pt-1 shrink-0">
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={handleCancel}
            >
              {t('novaposhta_packaging_cancel')}
            </Button>
            <Button
              type="button"
              variant="default"
              disabled={disabled || tableItems.length === 0}
              onClick={handleSave}
            >
              {t('novaposhta_packaging_add')}
            </Button>
          </div>
        </div>
      ) : (
        /* ═══════════════ Shipment fields mode ═══════════════ */
        <div className="overflow-y-auto flex-1 min-h-0 px-1.5">
          <div className="grid gap-3 pt-2">
            <div className="grid gap-1.5">
              <Label className="text-sm text-muted-foreground">
                {t('novaposhta_description')}
              </Label>
              <Input
                value={description}
                onChange={(e) => onChange('description', e.target.value)}
                disabled={disabled}
                placeholder={t('novaposhta_description_placeholder')}
              />
            </div>

            {/* Cost & Weight */}
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label className="text-sm text-muted-foreground">
                  {t('novaposhta_cost_label')}
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={cost}
                    onFocus={() => {
                      if (cost === '0' || cost === '') onChange('cost', '')
                    }}
                    onChange={(e) =>
                      onChange('cost', e.target.value.replace(/[^\d]/g, ''))
                    }
                    onBlur={(e) => {
                      const val = e.target.value
                      const finalCost = val || '0'
                      if (!val) onChange('cost', finalCost)
                      onFieldBlur?.('cost', finalCost)
                    }}
                    disabled={disabled}
                    className="pr-7 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                    ₴
                  </span>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-sm text-muted-foreground">
                  {t('novaposhta_weight')}
                </Label>
                <div className="relative">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={weight}
                    onChange={(e) => {
                      let val = e.target.value
                        .replace(/[^\d,.]/g, '') // allow digits, comma, dot
                        .replace(/,+/g, ',') // only one comma
                        .replace(/\.+/g, '.') // only one dot
                        .replace(/,/g, '.') // normalize comma → dot
                      if (val.includes('.')) {
                        const [int, dec] = val.split('.')
                        val = int + '.' + (dec || '').slice(0, 1)
                      }
                      onChange('weight', val)
                    }}
                    onBlur={() => !weight && onChange('weight', '0.1')}
                    disabled={disabled}
                    className="pr-7 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                    кг
                  </span>
                </div>
              </div>
            </div>

            {/* Add packaging button */}
            <div className="grid gap-1.5">
              <Label className="text-sm text-muted-foreground">
                {t('novaposhta_packaging')}
              </Label>
              <Button
                type="button"
                variant="default"
                className="w-full overflow-hidden"
                disabled={disabled}
                onClick={() => onPackagingModeChange(true)}
              >
                <span className="inline-flex items-center justify-center gap-1.5 truncate w-full">
                  <Package className="w-4 h-4 shrink-0" />
                  {savedPackItems.length > 0 ? (
                    <span className="truncate">
                      {[...savedPackItems]
                        .sort(
                          (a, b) =>
                            getPackPriority(a.label) - getPackPriority(b.label),
                        )
                        .map((item) => shortLabel(item.label))
                        .join(' • ')}
                    </span>
                  ) : (
                    <span className="truncate">
                      {t('novaposhta_add_packaging')}
                    </span>
                  )}
                </span>
              </Button>
            </div>

            {/* Dimensions */}
            <div className="grid gap-1.5">
              <Label className="text-sm text-muted-foreground">
                {t('novaposhta_dimensions')}
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {/* 1. Length */}
                <div className="relative">
                  <Input
                    placeholder={t('novaposhta_length')}
                    type="text"
                    inputMode="decimal"
                    value={volumetricLength ?? '0'}
                    onChange={(e) => {
                      let val = e.target.value
                        .replace(/[^\d,.]/g, '')
                        .replace(/,+/g, ',')
                        .replace(/\.+/g, '.')
                        .replace(/,/g, '.')
                      if (val.includes('.')) {
                        const [int, dec] = val.split('.')
                        val = int + '.' + (dec || '').slice(0, 1)
                      }
                      onChange('volumetric_length', val)
                    }}
                    onBlur={() =>
                      !volumetricLength && onChange('volumetric_length', '0')
                    }
                    disabled={disabled}
                    className="pr-7 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                    см
                  </span>
                </div>
                {/* 2. Width */}
                <div className="relative">
                  <Input
                    placeholder={t('novaposhta_width')}
                    type="text"
                    inputMode="decimal"
                    value={volumetricWidth ?? '0'}
                    onChange={(e) => {
                      let val = e.target.value
                        .replace(/[^\d,.]/g, '')
                        .replace(/,+/g, ',')
                        .replace(/\.+/g, '.')
                        .replace(/,/g, '.')
                      if (val.includes('.')) {
                        const [int, dec] = val.split('.')
                        val = int + '.' + (dec || '').slice(0, 1)
                      }
                      onChange('volumetric_width', val)
                    }}
                    onBlur={() =>
                      !volumetricWidth && onChange('volumetric_width', '0')
                    }
                    disabled={disabled}
                    className="pr-7 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                    см
                  </span>
                </div>
                <div className="relative">
                  <Input
                    placeholder={t('novaposhta_height')}
                    type="text"
                    inputMode="decimal"
                    value={volumetricHeight ?? '0'}
                    onChange={(e) => {
                      let val = e.target.value
                        .replace(/[^\d,.]/g, '')
                        .replace(/,+/g, ',')
                        .replace(/\.+/g, '.')
                        .replace(/,/g, '.')
                      if (val.includes('.')) {
                        const [int, dec] = val.split('.')
                        val = int + '.' + (dec || '').slice(0, 1)
                      }
                      onChange('volumetric_height', val)
                    }}
                    onBlur={() =>
                      !volumetricHeight && onChange('volumetric_height', '0')
                    }
                    disabled={disabled}
                    className="pr-7 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                    см
                  </span>
                </div>
              </div>
            </div>

            {/* Volumetric weight — read-only display */}
            <div className="grid gap-1.5">
              <Label className="text-sm text-muted-foreground">
                {t('novaposhta_volume')}
              </Label>
              <div className="flex items-center justify-center rounded-md border bg-muted/30 px-3 text-sm gap-1.5 h-10">
                <Box className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="font-medium">
                  {t('novaposhta_volumetric_weight')} {volumetricWeight()} кг
                </span>
              </div>
            </div>

            {/* Cargo Type — toggle buttons */}
            <div className="grid gap-1.5">
              <Label className="text-sm text-muted-foreground">
                {t('novaposhta_cargo_type')}
              </Label>
              <div className="grid grid-cols-5 gap-2">
                {cargoTypeMeta.map((item) => (
                  <Tooltip key={item.value}>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant={
                          cargoType === item.value ? 'default' : 'outline'
                        }
                        className="px-0"
                        disabled={disabled}
                        onClick={() => onChange('cargo_type', item.value)}
                      >
                        <item.icon className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{item.label}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
