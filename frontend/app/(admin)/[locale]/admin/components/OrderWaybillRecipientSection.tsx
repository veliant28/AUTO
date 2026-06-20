'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { User } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import type {
  NovaPoshtaLookupSettlement,
  NovaPoshtaLookupWarehouse,
  NovaPoshtaLookupStreet,
} from '@/lib/types/nova-poshta'

interface Props {
  deliveryType: 'warehouse' | 'postomat' | 'address'
  recipientName: string
  recipientPhone: string
  recipientCityRef: string
  recipientCityLabel: string
  recipientAddressRef: string
  recipientAddressLabel: string
  recipientHouse: string | undefined
  recipientApartment: string | undefined

  // City lookup
  cityQuery: string
  settlements: NovaPoshtaLookupSettlement[]
  settlementsLoading: boolean
  selectedSettlement: NovaPoshtaLookupSettlement | null

  // Warehouse lookup
  warehouseQuery: string
  warehouses: NovaPoshtaLookupWarehouse[]
  warehousesLoading: boolean
  selectedWarehouse: NovaPoshtaLookupWarehouse | null

  disabled: boolean
  onFieldChange: (field: string, value: any) => void
  onCityQueryChange: (query: string) => void
  onCitySelect: (item: NovaPoshtaLookupSettlement) => void
  onWarehouseQueryChange: (query: string) => void
  onWarehouseSelect: (item: NovaPoshtaLookupWarehouse) => void
  onDeliveryTypeChange: (type: 'warehouse' | 'postomat' | 'address') => void
}

export default function OrderWaybillRecipientSection({
  deliveryType,
  recipientName,
  recipientPhone,
  recipientCityLabel,
  recipientAddressLabel,
  recipientHouse,
  recipientApartment,

  cityQuery,
  settlements,
  settlementsLoading,
  selectedSettlement,

  warehouseQuery,
  warehouses,
  warehousesLoading,
  selectedWarehouse,

  disabled,
  onFieldChange,
  onCityQueryChange,
  onCitySelect,
  onWarehouseQueryChange,
  onWarehouseSelect,
  onDeliveryTypeChange,
}: Props) {
  const t = useTranslations('admin')

  return (
    <section className="order-3 rounded-md border p-3 xl:h-[460px] xl:overflow-y-auto bg-card">
      <div className="flex min-h-8 items-center gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <User className="w-4 h-4 text-muted-foreground" />
          {t('novaposhta_recipient')}
        </h3>
      </div>

      <div className="grid gap-1.5 pt-2">
        {/* Delivery Type */}
        <div className="grid gap-0.5">
          <Label className="text-xs text-muted-foreground">
            {t('novaposhta_delivery_type')}
          </Label>
          <Select
            value={deliveryType}
            onValueChange={(v: any) => onDeliveryTypeChange(v)}
            disabled={disabled}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="warehouse">
                {t('novaposhta_delivery_warehouse')}
              </SelectItem>
              <SelectItem value="postomat">
                {t('novaposhta_delivery_postomat')}
              </SelectItem>
              <SelectItem value="address">
                {t('novaposhta_delivery_address_label')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Recipient Name & Phone */}
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-0.5">
            <Label className="text-xs text-muted-foreground">
              {t('novaposhta_recipient_name_label')}
            </Label>
            <Input
              value={recipientName}
              onChange={(e) => onFieldChange('recipient_name', e.target.value)}
              disabled={disabled}
              className="h-9"
              placeholder={t('novaposhta_recipient_name_placeholder')}
            />
          </div>
          <div className="grid gap-0.5">
            <Label className="text-xs text-muted-foreground">
              {t('novaposhta_recipient_phone_label')}
            </Label>
            <Input
              value={recipientPhone}
              onChange={(e) => onFieldChange('recipient_phone', e.target.value)}
              disabled={disabled}
              className="h-9"
              placeholder={t('novaposhta_recipient_phone_placeholder')}
            />
          </div>
        </div>

        {/* City search */}
        <div className="grid gap-0.5">
          <Label className="text-xs text-muted-foreground">
            {t('novaposhta_city')}
          </Label>
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
              <div className="flex items-center justify-between">
                <span>{item.label}</span>
                <span className="text-xs text-muted-foreground">
                  {t('novaposhta_warehouses_count', {
                    count: item.warehouses_count,
                  })}
                </span>
              </div>
            )}
            minSearchLength={2}
            noResultsMessage={t('novaposhta_cities_not_found')}
            typeToSearchMessage={t('novaposhta_type_to_search_city')}
            disabled={disabled}
          />
        </div>

        {/* Warehouse / Address section */}
        {deliveryType === 'warehouse' || deliveryType === 'postomat' ? (
          <div className="grid gap-0.5">
            <Label className="text-xs text-muted-foreground">
              {deliveryType === 'postomat'
                ? t('novaposhta_postomat_label')
                : t('novaposhta_warehouse')}
            </Label>
            <SearchableSelect
              items={warehouses}
              isLoading={warehousesLoading}
              value={selectedWarehouse}
              onChange={onWarehouseSelect}
              placeholder={t('novaposhta_warehouse_placeholder')}
              searchQuery={warehouseQuery}
              onSearchChange={onWarehouseQueryChange}
              getKey={(item) => item.ref}
              getLabel={(item) => item.label}
              renderItem={(item, isSelected, isHighlighted) => (
                <div className="flex items-center justify-between">
                  <span>#{item.number}</span>
                  <span className="text-xs text-muted-foreground truncate ml-2">
                    {item.description}
                  </span>
                </div>
              )}
              minSearchLength={1}
              noResultsMessage={t('novaposhta_warehouses_not_found')}
              typeToSearchMessage={t('novaposhta_search_warehouse_placeholder')}
              disabled={disabled || !recipientCityLabel}
            />
          </div>
        ) : (
          <>
            <div className="grid gap-0.5">
              <Label className="text-xs text-muted-foreground">
                {t('novaposhta_street')}
              </Label>
              <Input
                value={recipientAddressLabel}
                onChange={(e) =>
                  onFieldChange('recipient_address_label', e.target.value)
                }
                disabled={disabled}
                className="h-9"
                placeholder={t('novaposhta_street_placeholder')}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-0.5">
                <Label className="text-xs text-muted-foreground">
                  {t('novaposhta_house')}
                </Label>
                <Input
                  value={recipientHouse || ''}
                  onChange={(e) =>
                    onFieldChange('recipient_house', e.target.value)
                  }
                  disabled={disabled}
                  className="h-9"
                />
              </div>
              <div className="grid gap-0.5">
                <Label className="text-xs text-muted-foreground">
                  {t('novaposhta_apartment')}
                </Label>
                <Input
                  value={recipientApartment || ''}
                  onChange={(e) =>
                    onFieldChange('recipient_apartment', e.target.value)
                  }
                  disabled={disabled}
                  className="h-9"
                />
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
