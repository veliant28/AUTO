import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '@/lib/constants';

export type VehicleType = 'passenger' | 'commercial' | 'motorbike' | null;

interface VehicleState {
  type: VehicleType;
  year: string | null;
  brandId: string | null;
  modelId: string | null;
  modId: string | null;
  volume: string | null;
  engine: string | null;
  brandName: string | null;
  modelName: string | null;
  modName: string | null;
  power: string | null;
  yearFrom: number | null;
  yearTo: number | null;

  setType: (type: VehicleType) => void;
  setYear: (year: string) => void;
  setBrand: (id: string, name: string) => void;
  setModel: (id: string, name: string) => void;
  setMod: (id: string, name: string) => void;
  setVolume: (vol: string) => void;
  setEngine: (eng: string) => void;
  setCarDetails: (details: { power?: string; yearFrom?: number; yearTo?: number }) => void;
  clearVehicle: () => void;
}

export const useVehicleStore = create<VehicleState>()(
  persist(
    (set) => ({
      type: null,
      year: null,
      brandId: null,
      modelId: null,
      modId: null,
      volume: null,
      engine: null,
      brandName: null,
      modelName: null,
      modName: null,
      power: null,
      yearFrom: null,
      yearTo: null,

      setType: (type) => set({ type, year: null, brandId: null, modelId: null, modId: null, volume: null, engine: null, brandName: null, modelName: null, modName: null, power: null, yearFrom: null, yearTo: null }),
      setYear: (year) => set({ year, brandId: null, modelId: null, modId: null, volume: null, engine: null, brandName: null, modelName: null, modName: null, power: null, yearFrom: null, yearTo: null }),
      setBrand: (id, name) => set({ brandId: id, brandName: name, modelId: null, modId: null, volume: null, engine: null, modelName: null, modName: null, power: null, yearFrom: null, yearTo: null }),
      setModel: (id, name) => set({ modelId: id, modelName: name, modId: null, volume: null, engine: null, modName: null, power: null, yearFrom: null, yearTo: null }),
      setMod: (id, name) => set({ modId: id, modName: name }),
      setVolume: (vol) => set({ volume: vol, engine: null }),
      setEngine: (eng) => set({ engine: eng }),
      setCarDetails: (details) => set({ power: details.power ?? null, yearFrom: details.yearFrom ?? null, yearTo: details.yearTo ?? null }),
      clearVehicle: () => set({ type: null, year: null, brandId: null, modelId: null, modId: null, volume: null, engine: null, brandName: null, modelName: null, modName: null, power: null, yearFrom: null, yearTo: null }),
    }),
    {
      name: STORAGE_KEYS.VEHICLE,
    }
  )
);
