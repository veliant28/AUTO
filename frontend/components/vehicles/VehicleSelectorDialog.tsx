'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Car, Bike, Truck, RotateCcw, Heart } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useVehicleStore, type VehicleType } from '@/store/vehicleStore';
import { useGarage } from '@/hooks/useGarage';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/lib/toast';
import { useVehicleYears, useVehicleMakes, useVehicleModels, useVehicleCars, useVehicleVolumes, useVehicleEngines } from '@/hooks/useVehicleCascade';

const TYPE_BUTTONS: { value: VehicleType; label: string; icon: React.ElementType }[] = [
  { value: 'passenger', label: 'Легковой', icon: Car },
  { value: 'commercial', label: 'Грузовой', icon: Truck },
  { value: 'motorbike', label: 'Мотоцикл', icon: Bike },
];

interface Props {
  children: React.ReactNode;
}

export default function VehicleSelectorDialog({ children }: Props) {
  const router = useRouter();
  const t = useTranslations('common');
  const { user } = useAuthStore();
  const store = useVehicleStore();
  const { addToGarage, isAdding } = useGarage();
  const [open, setOpen] = React.useState(false);

  const { data: years } = useVehicleYears(store.type);
  const { data: makes, isLoading: loadingMakes } = useVehicleMakes(store.type, store.year);
  const { data: models, isLoading: loadingModels } = useVehicleModels(store.type, store.year, store.brandId);
  const { data: cars, isLoading: loadingCars } = useVehicleCars(store.type, store.year, store.modelId);
  const { data: volumes } = useVehicleVolumes(store.year, store.modelId);
  const { data: engines, isLoading: loadingEngines } = useVehicleEngines(store.year, store.modelId, store.volume);

  const isPassenger = store.type === 'passenger';
  const hasSelection = !!store.modId;

  const handleSelectVehicle = () => {
    setOpen(false);
    router.push('/catalog');
  };

  const handleSaveToGarage = () => {
    if (!store.modId) return;
    addToGarage({ modId: parseInt(store.modId), tecdocCarId: parseInt(store.modId) });
    toast.success(t('saved_to_garage'));
  };

  const handleReset = () => {
    store.clearVehicle();
  };

  const carOptions = React.useMemo(() => {
    if (!cars) return [];
    return cars;
  }, [cars]);


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Car className="w-5 h-5" />
            {t('vehicle_select_title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">

          {/* Current selection badge */}
          <div className="bg-muted/50 rounded-lg p-3 border relative">
            {hasSelection ? (
              <>
                <div className="pr-10 space-y-1">
              <Badge variant="outline" className="text-xs shrink-0">
                    {store.type === 'motorbike' ? t('selected_motorbike') : store.type === 'commercial' ? t('selected_commercial') : t('selected_car')}
                  </Badge>
                  <div className="text-sm">
                    {store.brandName && <span className="font-medium">{store.brandName} </span>}
                    {store.modelName && <span className="text-muted-foreground">{store.modelName}</span>}
                    {store.modName && <span className="text-muted-foreground"> / {store.modName}</span>}
                    {store.power && (() => {
                      const match = store.power.match(/^([\d.]+)/);
                      const kw = match ? parseFloat(match[1]) : null;
                      const hp = kw ? Math.round(kw * 1.34102) : null;
                      return hp ? <span className="text-muted-foreground"> / {hp} л.с.</span> : null;
                    })()}
                    {(store.yearFrom || store.yearTo) && (
                      <span className="text-muted-foreground"> / {store.yearFrom || '?'}–{store.yearTo || '?'}</span>
                    )}
                  </div>
                </div>
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="destructive" size="icon" className="h-8 w-8" onClick={handleReset} tabIndex={-1}>
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{t('reset')}</TooltipContent>
                  </Tooltip>
                </div>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">{t('vehicle_no_selection')}</span>
            )}
          </div>

          <Separator />

          {/* Vehicle type buttons */}
          <div>
            <p className="text-sm font-medium mb-2">{t('vehicle_type')}</p>
            <div className="flex gap-2">
              {TYPE_BUTTONS.map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  variant={store.type === value ? 'default' : 'outline'}
                  className="flex-1 gap-1.5"
                  onClick={() => store.setType(value)}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Year */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t('vehicle_year')}</p>
              <Select
                disabled={!store.type}
                value={store.year || undefined}
                onValueChange={(val) => store.setYear(val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('vehicle_select_year')} />
                </SelectTrigger>
                <SelectContent>
                  {years?.map((y) => (
                    <SelectItem key={y.year} value={String(y.year)}>{y.year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Make */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t('vehicle_make')}</p>
              <Select
                disabled={!store.year || loadingMakes}
                value={makes?.some(m => String(m.id) === store.brandId) ? store.brandId : undefined}
                onValueChange={(val) => store.setBrand(val, makes?.find(m => m.id === parseInt(val))?.name || '')}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('vehicle_select_make')} />
                </SelectTrigger>
                <SelectContent>
                  {makes?.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Model */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t('vehicle_model')}</p>
              <Select
                disabled={!store.brandId || loadingModels || !models}
                value={models?.some(m => String(m.id) === store.modelId) ? store.modelId : undefined}
                onValueChange={(val) => store.setModel(val, models?.find(m => m.id === parseInt(val))?.name || '')}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('vehicle_select_model')} />
                </SelectTrigger>
                <SelectContent>
                  {models?.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Car / Modification */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t('vehicle_modification')}</p>
              <Select
                disabled={!store.modelId || loadingCars || !cars}
                value={carOptions?.some(c => String(c.id) === store.modId) ? store.modId : undefined}
                onValueChange={(val) => {
                  const car = carOptions.find(c => c.id === parseInt(val));
                  if (car) {
                    store.setMod(val, car.name || '');
                    if (car.capacity) store.setVolume(car.capacity);
                    if (car.engine) store.setEngine(car.engine);
                    store.setCarDetails({
                      power: car.power,
                      yearFrom: car.year_from,
                      yearTo: car.year_to,
                    });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('vehicle_select_modification')} />
                </SelectTrigger>
                <SelectContent>
                  {carOptions.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                      {(c.capacity || c.engine) && (
                        <span className="text-muted-foreground ml-2">
                          {[c.capacity, c.engine].filter(Boolean).join(' / ')}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Volume + Engine (only for passenger) */}
          {isPassenger && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t('vehicle_volume')}</p>
              <Select
                disabled={!store.modelId || !volumes}
                value={store.volume || undefined}
                onValueChange={(val) => store.setVolume(val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('vehicle_select_volume')} />
                </SelectTrigger>
                <SelectContent>
                  {volumes?.map((v) => (
                    <SelectItem key={v.volume} value={v.volume}>{v.volume}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t('vehicle_engine')}</p>
              <Select
                disabled={!store.volume || loadingEngines || !engines}
                value={store.engine || undefined}
                onValueChange={(val) => store.setEngine(val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('vehicle_select_engine')} />
                </SelectTrigger>
                <SelectContent>
                  {engines?.map((e) => (
                    <SelectItem key={e.engine} value={e.engine}>{e.engine}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          )}

          {/* Подобрать запчасти */}
          {hasSelection && (
            <Button className="w-full gap-2" onClick={handleSelectVehicle}>
              <Car className="w-4 h-4" />
              {t('vehicle_find_parts')}
            </Button>
          )}

          {/* Save to garage */}
          {hasSelection && user && (
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={handleSaveToGarage}
              disabled={isAdding}
            >
              <Heart className="w-4 h-4" />
              {t('save_to_garage')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
