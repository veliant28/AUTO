import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '@/lib/constants';
interface VehicleState {
  brandId: string | null;
  modelId: string | null;
  modId: string | null;
  brandName: string | null;
  modelName: string | null;
  modName: string | null;
  
  setBrand: (id: string, name: string) => void;
  setModel: (id: string, name: string) => void;
  setMod: (id: string, name: string) => void;
  clearVehicle: () => void;
}

export const useVehicleStore = create<VehicleState>()(
  persist(
    (set) => ({
      brandId: null,
      modelId: null,
      modId: null,
      brandName: null,
      modelName: null,
      modName: null,
      
      setBrand: (id, name) => set({ brandId: id, brandName: name, modelId: null, modId: null }),
      setModel: (id, name) => set({ modelId: id, modelName: name, modId: null }),
      setMod: (id, name) => set({ modId: id, modName: name }),
      clearVehicle: () => set({ brandId: null, modelId: null, modId: null, brandName: null, modelName: null, modName: null }),
    }),
    {
      name: STORAGE_KEYS.VEHICLE,
    }
  )
);
