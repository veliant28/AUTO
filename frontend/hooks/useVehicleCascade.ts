import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { VehicleType } from '@/store/vehicleStore';

export function useVehicleYears(type: VehicleType) {
  return useQuery({
    queryKey: ['vehicle-years', type],
    queryFn: async () => {
      const { data } = await api.get('/catalog/vehicle/years', { params: { type } });
      return data as { year: number }[];
    },
    enabled: !!type,
  });
}

export function useVehicleMakes(type: VehicleType, year: string | null) {
  return useQuery({
    queryKey: ['vehicle-makes', type, year],
    queryFn: async () => {
      const { data } = await api.get('/catalog/vehicle/makes', { params: { type, year } });
      return data as { id: number; name: string }[];
    },
    enabled: !!type && !!year,
  });
}

export function useVehicleModels(type: VehicleType, year: string | null, makeId: string | null) {
  return useQuery({
    queryKey: ['vehicle-models', type, year, makeId],
    queryFn: async () => {
      const { data } = await api.get('/catalog/vehicle/models', { params: { type, year, make_id: makeId } });
      return data as { id: number; name: string }[];
    },
    enabled: !!type && !!year && !!makeId,
  });
}

export function useVehicleCars(type: VehicleType, year: string | null, modelId: string | null) {
  return useQuery({
    queryKey: ['vehicle-cars', type, year, modelId],
    queryFn: async () => {
      const { data } = await api.get('/catalog/vehicle/cars', { params: { type, year, model_id: modelId } });
      return data as { id: number; name: string; capacity?: string; engine?: string; power?: string; year_from?: number; year_to?: number }[];
    },
    enabled: !!type && !!year && !!modelId,
  });
}

export function useVehicleVolumes(year: string | null, modelId: string | null) {
  return useQuery({
    queryKey: ['vehicle-volumes', year, modelId],
    queryFn: async () => {
      const { data } = await api.get('/catalog/vehicle/volumes', { params: { year, model_id: modelId } });
      return data as { volume: string }[];
    },
    enabled: !!year && !!modelId,
  });
}

export function useVehicleEngines(year: string | null, modelId: string | null, volume: string | null) {
  return useQuery({
    queryKey: ['vehicle-engines', year, modelId, volume],
    queryFn: async () => {
      const params: any = { year, model_id: modelId };
      if (volume) params.volume = volume;
      const { data } = await api.get('/catalog/vehicle/engines', { params });
      return data as { engine: string }[];
    },
    enabled: !!year && !!modelId,
  });
}
