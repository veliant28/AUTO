'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { useVehicleStore } from '@/store/vehicleStore';
import { useBrands, useModels, useModifications } from '@/hooks/useVehicleData';
import { useGarage } from '@/hooks/useGarage';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Heart } from 'lucide-react';
import { toast } from '@/lib/toast';

export default function VehicleSelector() {
  const t = useTranslations('common');
  const { brandId, modelId, modId, setBrand, setModel, setMod } = useVehicleStore();
  const { addToGarage, isAdding } = useGarage();
  
  const { data: brands, isLoading: loadingBrands } = useBrands();
  const { data: models, isLoading: loadingModels } = useModels(brandId);
  const { data: mods, isLoading: loadingMods } = useModifications(modelId);

  const handleSaveToGarage = () => {
    if (!modId) return;
    addToGarage(parseInt(modId));
    toast.success(t('saved_to_garage'));
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-card text-card-foreground rounded-lg border shadow-sm max-w-md mx-auto">
      <h3 className="text-lg font-semibold mb-2">{t('search_by_car')}</h3>
      
      <div className="space-y-2">
        <label className="text-sm font-medium">{t('select_brand')}</label>
        <Select value={brandId || ""} onValueChange={(val) => setBrand(val, brands?.find(b => b.id === parseInt(val))?.name || "")}>
<SelectTrigger className="h-10">
             <SelectValue placeholder={t('select_brand')} />
           </SelectTrigger>
          <SelectContent>
            {brands?.map((brand) => (
              <SelectItem key={brand.id} value={brand.id.toString()}>{brand.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{t('select_model')}</label>
        <Select disabled={!brandId || loadingModels} value={modelId || ""} onValueChange={(val) => setModel(val, models?.find(m => m.id === parseInt(val))?.name || "")}>
          <SelectTrigger className="h-10">
             <SelectValue placeholder={t('select_model')} />
          </SelectTrigger>
          <SelectContent>
            {models?.map((model) => (
              <SelectItem key={model.id} value={model.id.toString()}>{model.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{t('select_mod')}</label>
        <Select disabled={!modelId || loadingMods} value={modId || ""} onValueChange={(val) => setMod(val, mods?.find(m => m.id === parseInt(val))?.name || "")}>
          <SelectTrigger className="h-10">
             <SelectValue placeholder={t('select_mod')} />
          </SelectTrigger>
          <SelectContent>
            {mods?.map((mod) => (
              <SelectItem key={mod.id} value={mod.id.toString()}>{mod.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {modId && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-sm">{t('selected_car')}</Badge>
            <button 
              onClick={() => useVehicleStore.getState().clearVehicle()}
              className="text-xs text-destructive hover:underline"
            >
              {t('reset')}
            </button>
          </div>
          <Button 
            variant="default" 
            size="lg"
            className="w-full gap-2" 
            onClick={handleSaveToGarage}
            disabled={isAdding}
          >
            <Heart className="w-5 h-5" />
            {t('save_to_garage')}
          </Button>
        </div>
      )}
    </div>
  );
}
