'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { User, Search, Loader2, Warehouse } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { PhoneInput } from '@/components/ui/PhoneInput'
import type {
  NovaPoshtaLookupSettlement,
  NovaPoshtaLookupWarehouse,
  NovaPoshtaLookupStreet,
  NovaPoshtaLookupCounterparty,
} from '@/lib/types/nova-poshta'

// ═══════════════════════════════════════════════════════════════════════════════
// FIO helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** Parse FIO string into parts: last_name, first_name, middle_name */
function parseFio(full: string): {
  recipient_last_name: string
  recipient_first_name: string
  recipient_middle_name: string
} {
  const parts = full.trim().split(/\s+/)
  return {
    recipient_last_name: parts[0] || '',
    recipient_first_name: parts[1] || '',
    recipient_middle_name: parts[2] || '',
  }
}

/** Split address string into street, house, and apartment parts.
 *  Supports: "street", "street, house", "street, house, apartment" */
function splitAddressParts(query: string): {
  streetQuery: string
  house: string
  apartment: string
} {
  // First comma separates street from house; second comma separates house from apartment
  const firstComma = query.indexOf(',')
  if (firstComma < 0)
    return { streetQuery: query.trim(), house: '', apartment: '' }

  const streetQuery = query.slice(0, firstComma).trim()
  const rest = query.slice(firstComma + 1).trim()

  const secondComma = rest.indexOf(',')
  if (secondComma < 0) {
    return { streetQuery, house: rest.trim(), apartment: '' }
  }

  return {
    streetQuery,
    house: rest.slice(0, secondComma).trim(),
    apartment: rest.slice(secondComma + 1).trim(),
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Props
// ═══════════════════════════════════════════════════════════════════════════════

interface Props {
  // Delivery type is auto-detected from address selection
  deliveryType: 'warehouse' | 'postomat' | 'address'

  // Phone (uses PhoneInput — stores +380XXXXXXXXX)
  recipientPhone: string

  // FIO
  recipientName: string

  // City
  recipientCityRef: string
  recipientCityLabel: string

  // Address (warehouse / postomat / street ref)
  recipientAddressRef: string
  recipientAddressLabel: string

  // Street address
  recipientStreetRef: string | undefined
  recipientStreetLabel: string | undefined
  recipientHouse: string | undefined
  recipientApartment: string | undefined

  // Counterparty
  recipientCounterpartyRef: string | undefined
  recipientContactRef: string | undefined

  // ── City lookup ──
  cityQuery: string
  settlements: NovaPoshtaLookupSettlement[]
  settlementsLoading: boolean
  selectedSettlement: NovaPoshtaLookupSettlement | null

  // ── Warehouse / Postomat lookup ──
  addressQuery: string
  warehouses: NovaPoshtaLookupWarehouse[]
  warehousesLoading: boolean

  // ── Street lookup (address delivery) ──
  streets: NovaPoshtaLookupStreet[]
  streetsLoading: boolean

  // ── Counterparty lookup ──
  counterpartyQuery: string
  counterparties: NovaPoshtaLookupCounterparty[]
  counterpartiesLoading: boolean
  selectedCounterparty: NovaPoshtaLookupCounterparty | null

  disabled: boolean

  // ── Callbacks ──
  onFieldChange: (field: string, value: any) => void
  onCityQueryChange: (query: string) => void
  onCitySelect: (item: NovaPoshtaLookupSettlement) => void
  onAddressQueryChange: (query: string) => void
  onWarehouseSelect: (item: NovaPoshtaLookupWarehouse) => void
  onStreetSelect: (
    item: NovaPoshtaLookupStreet,
    house?: string,
    apartment?: string,
  ) => void
  onCounterpartyQueryChange: (query: string) => void
  onCounterpartySelect: (item: NovaPoshtaLookupCounterparty) => void
}

// ═══════════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function OrderWaybillRecipientSection({
  deliveryType,
  recipientPhone,
  recipientName,
  recipientCityLabel,
  recipientAddressLabel,
  recipientStreetRef,
  recipientStreetLabel,
  recipientHouse,
  recipientApartment,
  recipientCounterpartyRef,
  recipientContactRef,

  cityQuery,
  settlements,
  settlementsLoading,
  selectedSettlement,

  addressQuery,
  warehouses,
  warehousesLoading,

  streets,
  streetsLoading,

  counterpartyQuery,
  counterparties,
  counterpartiesLoading,
  selectedCounterparty,

  disabled,
  onFieldChange,
  onCityQueryChange,
  onCitySelect,
  onAddressQueryChange,
  onWarehouseSelect,
  onStreetSelect,
  onCounterpartyQueryChange,
  onCounterpartySelect,
}: Props) {
  const t = useTranslations('admin')

  function formatPhoneDisplay(phone: string): string {
    const digits = phone.replace(/\D/g, '')
    const normalized = digits.length >= 12 ? digits.slice(-10) : digits
    if (normalized.length === 10) {
      return `+38 (${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6, 8)}-${normalized.slice(8, 10)}`
    }
    return phone
  }

  // ── FIO input ────────────────────────────────────────────────────────────
  const handleFioBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      const value = e.target.value.trim()
      if (value) {
        const parsed = parseFio(value)
        onFieldChange('recipient_name', value)
        onFieldChange('recipient_last_name', parsed.recipient_last_name)
        onFieldChange('recipient_first_name', parsed.recipient_first_name)
        onFieldChange('recipient_middle_name', parsed.recipient_middle_name)
      }
    },
    [onFieldChange],
  )

  const handleFioChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFieldChange('recipient_name', e.target.value)
    },
    [onFieldChange],
  )

  // ── Unified address field ─────────────────────────────────────────────────
  // This field searches warehouses (incl. postomats) when no comma,
  // and searches streets when a comma is present.
  const [addressDisplay, setAddressDisplay] = useState(() => {
    if (recipientStreetLabel && recipientHouse) {
      return `${recipientStreetLabel}, ${recipientHouse}`
    }
    if (recipientAddressLabel) {
      return recipientAddressLabel
    }
    return ''
  })

  // Sync display when props change (e.g. waybill loaded)
  useEffect(() => {
    if (recipientStreetLabel && recipientHouse) {
      setAddressDisplay(`${recipientStreetLabel}, ${recipientHouse}`)
    } else if (recipientAddressLabel) {
      setAddressDisplay(recipientAddressLabel)
    } else if (recipientStreetLabel) {
      setAddressDisplay(recipientStreetLabel)
    } else if (!addressQuery) {
      setAddressDisplay('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientStreetLabel, recipientHouse, recipientAddressLabel])

  const handleAddressChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      setAddressDisplay(raw)

      // If a street is already selected, the user is typing house/apartment suffix.
      // Parse those and update form fields directly — no search needed.
      if (recipientStreetLabel && raw.startsWith(recipientStreetLabel)) {
        const suffix = raw
          .slice(recipientStreetLabel.length)
          .replace(/^,\s*/, '')
        const parts = suffix.split(',').map((s) => s.trim())
        const house = parts[0] || ''
        const apartment = parts.slice(1).join(', ').trim()
        onFieldChange('recipient_house', house)
        onFieldChange('recipient_apartment', apartment)
        onAddressQueryChange('')
        return
      }

      // Normal mode detection for initial search
      onAddressQueryChange(raw)
      const startsWithDigit = /^\d/.test(raw)
      const startsWithLetter = /^[a-zа-яіїєґ']/i.test(raw)
      const hasValidMode = startsWithDigit || startsWithLetter
      const minLen = startsWithLetter ? 2 : 1
      if (raw.length >= minLen && hasValidMode) {
        setAddressOpen(true)
      }
    },
    [onAddressQueryChange, recipientStreetLabel, onFieldChange],
  )

  // When user selects a warehouse/postomat from dropdown
  const handleWarehouseItemSelect = useCallback(
    (item: NovaPoshtaLookupWarehouse) => {
      onWarehouseSelect(item)
      setAddressDisplay(item.label)
    },
    [onWarehouseSelect],
  )

  // When user selects a street from dropdown
  const handleStreetItemSelect = useCallback(
    (item: NovaPoshtaLookupStreet) => {
      const { house, apartment } = splitAddressParts(addressDisplay)
      onStreetSelect(item, house, apartment)
      const suffix = [house, apartment].filter(Boolean).join(', ')
      setAddressDisplay(suffix ? `${item.label}, ${suffix}` : item.label)
    },
    [onStreetSelect, addressDisplay],
  )

  // ── Address dropdown (combined warehouse + street) ───────────────────────
  const [addressOpen, setAddressOpen] = useState(false)
  const [addressHighlighted, setAddressHighlighted] = useState(-1)
  const addressContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        addressContainerRef.current &&
        !addressContainerRef.current.contains(e.target as Node)
      ) {
        setAddressOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    setAddressHighlighted(-1)
  }, [warehouses, streets])

  const startsWithDigit = /^\d/.test(addressQuery)
  const startsWithLetter = /^[a-zа-яіїєґ']/i.test(addressQuery)
  const isWarehouseMode = startsWithDigit && !!recipientCityLabel
  const isStreetMode = startsWithLetter && !!recipientCityLabel
  const showWarehouseDropdown =
    addressOpen &&
    isWarehouseMode &&
    addressQuery.length >= 1 &&
    !disabled &&
    !warehousesLoading
  const showStreetDropdown =
    addressOpen &&
    isStreetMode &&
    addressQuery.length >= 2 &&
    !disabled &&
    !streetsLoading

  // Combine all address results for keyboard navigation
  const allAddressItems = isWarehouseMode ? warehouses : streets
  const addressLoading = isWarehouseMode ? warehousesLoading : streetsLoading
  const showAddressDropdown = showWarehouseDropdown || showStreetDropdown

  const handleAddressKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showAddressDropdown && allAddressItems.length === 0) return
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          if (!showAddressDropdown) {
            setAddressOpen(true)
            setAddressHighlighted(0)
          } else {
            setAddressHighlighted((p) =>
              p < allAddressItems.length - 1 ? p + 1 : 0,
            )
          }
          break
        case 'ArrowUp':
          e.preventDefault()
          if (showAddressDropdown) {
            setAddressHighlighted((p) =>
              p > 0 ? p - 1 : allAddressItems.length - 1,
            )
          }
          break
        case 'Enter':
          e.preventDefault()
          if (
            showAddressDropdown &&
            addressHighlighted >= 0 &&
            addressHighlighted < allAddressItems.length
          ) {
            const item = allAddressItems[addressHighlighted]
            if (isWarehouseMode) {
              handleWarehouseItemSelect(item as NovaPoshtaLookupWarehouse)
            } else {
              handleStreetItemSelect(item as NovaPoshtaLookupStreet)
            }
          }
          break
        case 'Escape':
          setAddressOpen(false)
          setAddressHighlighted(-1)
          e.preventDefault()
          break
      }
    },
    [
      showAddressDropdown,
      allAddressItems,
      addressHighlighted,
      isWarehouseMode,
      handleWarehouseItemSelect,
      handleStreetItemSelect,
    ],
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <section className="order-3 rounded-md border p-3 xl:h-[460px] bg-card">
      <div className="flex min-h-8 items-center gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <User className="w-4 h-4 text-muted-foreground" />
          {t('novaposhta_recipient')}
        </h3>
      </div>

      <div className="grid gap-1.5 pt-2">
        {/* ── Phone ──────────────────────────────────────────────────────── */}
        <div className="grid gap-0.5">
          <Label className="text-xs text-muted-foreground">
            {t('novaposhta_recipient_phone_label')}
          </Label>
          {disabled ? (
            <div className="flex items-center rounded-md border bg-muted/30 px-3 text-sm min-w-0 overflow-hidden">
              <span className={recipientPhone ? 'truncate' : 'truncate text-muted-foreground'}>
                {formatPhoneDisplay(recipientPhone) || '—'}
              </span>
            </div>
          ) : (
            <PhoneInput
              value={recipientPhone}
              onChange={(v) => onFieldChange('recipient_phone', v)}
              disabled={disabled}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          )}
        </div>

        {/* ── Counterparty ──────────────────────────────────────────────── */}
        <div className="grid gap-0.5">
          <Label className="text-xs text-muted-foreground">
            {t('novaposhta_counterparty')}
          </Label>
          {disabled ? (
            <div className="flex items-center rounded-md border bg-muted/30 px-3 text-sm min-w-0 overflow-hidden">
              <span className={selectedCounterparty?.label ? 'truncate' : 'truncate text-muted-foreground'}>
                {selectedCounterparty?.label || recipientCounterpartyRef || '—'}
              </span>
            </div>
          ) : (
            <SearchableSelect
              items={counterparties}
              isLoading={counterpartiesLoading}
              value={selectedCounterparty}
              onChange={onCounterpartySelect}
              placeholder={t('novaposhta_counterparty_placeholder')}
              searchQuery={counterpartyQuery}
              onSearchChange={onCounterpartyQueryChange}
              getKey={(item) => item.ref}
              getLabel={(item) => item.label}
              renderItem={(item, isSelected, isHighlighted) => (
                <div className="flex items-center justify-between">
                  <span>{item.label}</span>
                  <span className="text-xs text-muted-foreground ml-1 shrink-0">
                    {item.phone}
                  </span>
                </div>
              )}
              minSearchLength={2}
              noResultsMessage={t('novaposhta_counterparty_not_found')}
              typeToSearchMessage={t('novaposhta_type_to_search_city')}
              disabled={disabled}
              hideSearchIcon
            />
          )}
        </div>

        {/* ── FIO ────────────────────────────────────────────────────────── */}
        <div className="grid gap-0.5">
          <Label className="text-xs text-muted-foreground">
            {t('novaposhta_recipient_name_label')}
          </Label>
          {disabled ? (
            <div className="flex items-center rounded-md border bg-muted/30 px-3 text-sm min-w-0 overflow-hidden">
              <span className={recipientName ? 'truncate' : 'truncate text-muted-foreground'}>
                {recipientName || '—'}
              </span>
            </div>
          ) : (
            <Input
              value={recipientName}
              onChange={handleFioChange}
              onBlur={handleFioBlur}
              disabled={disabled}
              placeholder={t('novaposhta_fio_placeholder')}
            />
          )}
        </div>

        {/* ── City ───────────────────────────────────────────────────────── */}
        <div className="grid gap-0.5">
          <Label className="text-xs text-muted-foreground">
            {t('novaposhta_city')}
          </Label>
          {disabled ? (
            <div className="flex items-center rounded-md border bg-muted/30 px-3 text-sm min-w-0 overflow-hidden">
              <span className={recipientCityLabel ? 'truncate' : 'truncate text-muted-foreground'}>
                {recipientCityLabel || '—'}
              </span>
            </div>
          ) : (
            <SearchableSelect
              items={settlements}
              isLoading={settlementsLoading}
              value={selectedSettlement}
              onChange={onCitySelect}
              placeholder={t('novaposhta_search_city_placeholder')}
              searchQuery={cityQuery}
              onSearchChange={onCityQueryChange}
              getKey={(item) => item.ref}
              getLabel={(item) => item.label}
              renderItem={(item, isSelected, isHighlighted) => (
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
              )}
              minSearchLength={2}
              noResultsMessage={t('novaposhta_cities_not_found')}
              typeToSearchMessage={t('novaposhta_type_to_search_city')}
              disabled={disabled}
            />
          )}
        </div>

        {/* ── Unified Address: warehouse / postomat / street ─────────────── */}
        <div className="grid gap-0.5">
          <Label className="text-xs text-muted-foreground">
            {t('novaposhta_address_label')}
          </Label>
          {disabled ? (
            <div className="flex items-center rounded-md border bg-muted/30 px-3 text-sm min-w-0 overflow-hidden">
              <span className={addressDisplay ? 'truncate' : 'truncate text-muted-foreground'}>
                {addressDisplay || '—'}
              </span>
            </div>
          ) : (
          <div ref={addressContainerRef} className="relative">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={t('novaposhta_address_placeholder')}
                value={addressDisplay}
                onChange={handleAddressChange}
                onFocus={() => {
                  if (addressQuery.length >= 1) setAddressOpen(true)
                }}
                onKeyDown={handleAddressKeyDown}
                className="pl-8"
                disabled={disabled || !recipientCityLabel}
              />
              {addressLoading && (
                <Loader2 className="absolute right-2.5 top-2.5 w-4 h-4 animate-spin text-muted-foreground pointer-events-none" />
              )}
            </div>

            {/* Warehouse / Postomat results */}
            {showWarehouseDropdown && (
              <div className="absolute top-full mt-1 w-full z-50 bg-popover border rounded-md shadow-lg overflow-hidden">
                <div
                  className="overflow-y-auto py-1"
                  style={{ maxHeight: 160 }}
                >
                  {warehouses.length > 0 ? (
                    warehouses.map((item, index) => {
                      const isHighlighted = index === addressHighlighted
                      const isPostomat = item.type === 'Postomat'
                      return (
                        <div
                          key={item.ref}
                          data-index={index}
                          role="option"
                          aria-selected={isHighlighted}
                          className={`px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                            isHighlighted ? 'bg-accent' : 'hover:bg-muted'
                          }`}
                          onClick={() => handleWarehouseItemSelect(item)}
                          onMouseEnter={() => setAddressHighlighted(index)}
                        >
                          <div className="font-medium leading-tight flex items-center gap-2">
                            {isPostomat ? (
                              <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-1.5 py-0.5 rounded font-semibold shrink-0">
                                {t('novaposhta_postomat')}
                              </span>
                            ) : (
                              <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 px-1.5 py-0.5 rounded font-semibold shrink-0">
                                №{item.number}
                              </span>
                            )}
                            <span className="truncate">
                              {item.label.includes(':')
                                ? item.label.slice(0, item.label.indexOf(':'))
                                : item.label}
                            </span>
                          </div>
                          {(() => {
                            const afterColon = item.label.includes(':')
                              ? item.label
                                  .slice(item.label.indexOf(':') + 1)
                                  .trim()
                              : ''
                            const desc = afterColon || item.description || ''
                            return desc ? (
                              <div className="text-xs text-muted-foreground mt-0.5 truncate">
                                {desc}
                              </div>
                            ) : null
                          })()}
                        </div>
                      )
                    })
                  ) : (
                    <div className="text-sm text-muted-foreground py-3 text-center">
                      {t('novaposhta_warehouses_not_found')}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Street results */}
            {showStreetDropdown && (
              <div className="absolute top-full mt-1 w-full z-50 bg-popover border rounded-md shadow-lg overflow-hidden">
                <div
                  className="overflow-y-auto py-1"
                  style={{ maxHeight: 160 }}
                >
                  {streets.length > 0 ? (
                    streets.map((item, index) => {
                      const isHighlighted = index === addressHighlighted
                      return (
                        <div
                          key={item.street_ref}
                          data-index={index}
                          role="option"
                          aria-selected={isHighlighted}
                          className={`px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                            isHighlighted ? 'bg-accent' : 'hover:bg-muted'
                          }`}
                          onClick={() => handleStreetItemSelect(item)}
                          onMouseEnter={() => setAddressHighlighted(index)}
                        >
                          <div className="font-medium leading-tight">
                            {item.street_type ? `${item.street_type}. ` : ''}
                            {item.label}
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="text-sm text-muted-foreground py-3 text-center">
                      {t('novaposhta_streets_not_found')}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Type-to-search hint */}
            {addressOpen &&
              !disabled &&
              addressQuery.length > 0 &&
              addressQuery.length < (isStreetMode ? 2 : 1) && (
                <div className="absolute top-full mt-1 w-full z-50 bg-popover border rounded-md shadow-lg">
                  <div className="text-xs text-muted-foreground py-3 text-center">
                    {isStreetMode
                      ? t('novaposhta_type_to_search_street')
                      : t('novaposhta_type_to_search_address')}
                  </div>
                </div>
              )}
          </div>
          )}
        </div>
      </div>
    </section>
  )
}
