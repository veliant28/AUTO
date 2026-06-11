'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useGarage } from '@/hooks/useGarage';
import { useVehicleStore } from '@/store/vehicleStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, Car, Check } from 'lucide-react';
import { toast } from '@/lib/toast';
import { GarageSkeleton } from '@/components/ui/Skeletons';
import PageTransition from '@/components/ui/PageTransition';

export default function GaragePage() {
  const router = useRouter();
  const t = useTranslations('common');
  const { garage, isLoading, removeFromGarage, isRemoving } = useGarage();
  const store = useVehicleStore();

  const handleSelectVehicle = (vehicle: any) => {
    useVehicleStore.setState({
      brandId: vehicle.brand_name ? String(vehicle.mod_id || vehicle.tecdoc_car_id) : null,
      brandName: vehicle.brand_name || null,
      modelId: vehicle.model_name ? String(vehicle.mod_id || vehicle.tecdoc_car_id) : null,
      modelName: vehicle.model_name || null,
      modId: String(vehicle.tecdoc_car_id || vehicle.mod_id),
      modName: vehicle.name || null,
    });
    toast.success(t('vehicle_selected'));
    router.back();
  };

  const handleRemove = (entryId: number) => {
    removeFromGarage(entryId);
    toast.success(t('vehicle_removed'));
  };

  if (isLoading) {
    return (
      <PageTransition>
        <div className="container mx-auto py-8 px-4">
          <GarageSkeleton />
        </div>
      </PageTransition>
    );
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {garage.map((vehicle) => (
            <div
              key={vehicle.id}
              className="bg-card border rounded-lg p-4 hover:border-primary transition-colors space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs shrink-0">{t('selected_car')}</Badge>
                    {vehicle.brand_name && <span className="text-sm font-medium truncate">{vehicle.brand_name}</span>}
                    {vehicle.model_name && <span className="text-sm text-muted-foreground truncate">{vehicle.model_name}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {vehicle.name}
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => handleRemove(vehicle.id)}
                  disabled={isRemoving}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={() => handleSelectVehicle(vehicle)}
                >
                  <Check className="w-4 h-4" />
                  {t('vehicle_find_parts')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </PageTransition>
  );
}
