'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useGarage } from '@/hooks/useGarage'
import { useVehicleStore } from '@/store/vehicleStore'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { Trash2, Car, Check, AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { GarageSkeleton } from '@/components/ui/Skeletons'
import PageTransition from '@/components/ui/PageTransition'

function formatPower(power: string | null | undefined): string | null {
  if (!power) return null
  const match = power.match(/^([\d.]+)/)
  const kw = match ? parseFloat(match[1]) : null
  return kw ? `${Math.round(kw * 1.34102)}` : null
}

export default function GaragePage() {
  const router = useRouter()
  const t = useTranslations('common')
  const { garage, isLoading, removeFromGarage, isRemoving } = useGarage()
  const [deleteTarget, setDeleteTarget] = React.useState<any>(null)

  const handleSelectVehicle = (vehicle: any) => {
    useVehicleStore.setState({
      type: vehicle.vehicle_type || null,
      brandId: vehicle.brand_name
        ? String(vehicle.tecdoc_car_id || vehicle.mod_id)
        : null,
      brandName: vehicle.brand_name || null,
      modelId: vehicle.model_name
        ? String(vehicle.tecdoc_car_id || vehicle.mod_id)
        : null,
      modelName: vehicle.model_name || null,
      modId: String(vehicle.tecdoc_car_id || vehicle.mod_id),
      volume: vehicle.volume || null,
      engine: vehicle.engine || null,
      power: vehicle.power || null,
      yearFrom: vehicle.year_from ?? null,
      yearTo: vehicle.year_to ?? null,
    })
    toast.success(t('vehicle_selected'))
    router.back()
  }

  const confirmRemove = () => {
    if (!deleteTarget) return
    removeFromGarage(deleteTarget.id)
    toast.success(t('vehicle_removed'))
    setDeleteTarget(null)
  }

  if (isLoading) {
    return (
      <PageTransition>
        <div className="container mx-auto py-8 px-4">
          <GarageSkeleton />
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center gap-2 mb-8">
          <Car className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold">{t('garage')}</h1>
        </div>

        {garage.length === 0 ? (
          <div className="bg-muted/30 border-2 border-dashed rounded-xl h-64 flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
            <Car className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-lg font-medium">{t('garage_empty')}</p>
            <p className="text-sm">{t('garage_empty_desc')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {garage.map((vehicle) => {
              const badgeKey =
                vehicle.vehicle_type === 'motorbike'
                  ? 'selected_motorbike'
                  : vehicle.vehicle_type === 'commercial'
                    ? 'selected_commercial'
                    : 'selected_car'
              const hp = formatPower(vehicle.power)
              const hpLabel = hp ? `${hp} ${t('horsepower')}` : null
              const yearStr =
                vehicle.year_from != null || vehicle.year_to != null
                  ? `${vehicle.year_from ?? '?'}–${vehicle.year_to ?? '?'}`
                  : null

              return (
                <div
                  key={vehicle.id}
                  className="bg-card border rounded-lg p-3 hover:border-primary transition-colors space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline" className="text-sm">
                      {t(badgeKey)}
                    </Badge>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="destructive"
                          size="icon"
                          className="h-10 w-10 shrink-0"
                          onClick={() => setDeleteTarget(vehicle)}
                        >
                          <Trash2 className="w-5 h-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left">{t('remove')}</TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="text-sm leading-snug">
                    <span className="font-medium">{vehicle.brand_name} </span>
                    <span className="text-muted-foreground">
                      {vehicle.model_name}
                    </span>
                    {vehicle.volume && (
                      <span className="text-muted-foreground">
                        {' '}
                        / {vehicle.volume}
                      </span>
                    )}
                    {vehicle.engine && (
                      <span className="text-muted-foreground">
                        {' '}
                        {vehicle.engine}
                      </span>
                    )}
                    {hpLabel && (
                      <span className="text-muted-foreground">
                        {' '}
                        / {hpLabel}
                      </span>
                    )}
                    {yearStr && (
                      <span className="text-muted-foreground">
                        {' '}
                        / {yearStr}
                      </span>
                    )}
                  </div>

                  <Button
                    size="lg"
                    className="w-full gap-1.5"
                    onClick={() => handleSelectVehicle(vehicle)}
                  >
                    <Check className="w-5 h-5" />
                    {t('vehicle_find_parts')}
                  </Button>
                </div>
              )
            })}
          </div>
        )}

        {/* Delete confirmation dialog */}
        <Dialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
        >
          <DialogContent>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <DialogTitle>{t('garage_delete_title')}</DialogTitle>
                  <DialogDescription>
                    {t('garage_delete_desc')}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            {deleteTarget && (
              <div className="rounded-lg bg-muted p-3 text-sm">
                <span className="font-medium">
                  {deleteTarget.brand_name} {deleteTarget.model_name}
                </span>
                {deleteTarget.name && (
                  <span className="text-muted-foreground">
                    {' '}
                    / {deleteTarget.name}
                  </span>
                )}
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                size="lg"
                onClick={() => setDeleteTarget(null)}
              >
                {t('cancel')}
              </Button>
              <Button
                variant="destructive"
                size="lg"
                onClick={confirmRemove}
                disabled={isRemoving}
                className="gap-2"
              >
                {isRemoving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Trash2 className="w-5 h-5" />
                )}
                {t('delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  )
}
