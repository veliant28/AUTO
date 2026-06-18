import { useVehicleStore } from '@/store/vehicleStore'

beforeEach(() => {
  useVehicleStore.setState({
    type: null, year: null, brandId: null, modelId: null, modId: null,
    volume: null, engine: null, brandName: null, modelName: null, modName: null,
    power: null, yearFrom: null, yearTo: null,
  })
})

describe('vehicleStore', () => {
  it('starts empty', () => {
    const state = useVehicleStore.getState()
    expect(state.type).toBeNull()
    expect(state.modId).toBeNull()
  })

  it('sets type and clears sub-selections', () => {
    useVehicleStore.getState().setType('passenger')
    const state = useVehicleStore.getState()
    expect(state.type).toBe('passenger')
    expect(state.brandId).toBeNull()
  })

  it('sets brand and clears deeper selections', () => {
    useVehicleStore.getState().setType('passenger')
    useVehicleStore.getState().setYear('2020')
    useVehicleStore.getState().setBrand('1', 'Toyota')
    const state = useVehicleStore.getState()
    expect(state.brandId).toBe('1')
    expect(state.brandName).toBe('Toyota')
    expect(state.modelId).toBeNull()
  })

  it('sets model and clears mod', () => {
    useVehicleStore.getState().setBrand('1', 'Toyota')
    useVehicleStore.getState().setModel('10', 'Camry')
    const state = useVehicleStore.getState()
    expect(state.modelId).toBe('10')
    expect(state.modelName).toBe('Camry')
    expect(state.modId).toBeNull()
  })

  it('sets mod without clearing selections', () => {
    useVehicleStore.getState().setBrand('1', 'Toyota')
    useVehicleStore.getState().setModel('10', 'Camry')
    useVehicleStore.getState().setMod('100', '2.0')
    const state = useVehicleStore.getState()
    expect(state.modId).toBe('100')
    expect(state.modName).toBe('2.0')
    expect(state.brandId).toBe('1')
  })

  it('sets volume and clears engine', () => {
    useVehicleStore.getState().setVolume('2.0')
    expect(useVehicleStore.getState().volume).toBe('2.0')
    expect(useVehicleStore.getState().engine).toBeNull()
  })

  it('sets engine without clearing other fields', () => {
    useVehicleStore.getState().setVolume('2.0')
    useVehicleStore.getState().setEngine('petrol')
    expect(useVehicleStore.getState().engine).toBe('petrol')
  })

  it('sets car details', () => {
    useVehicleStore.getState().setCarDetails({ power: '150', yearFrom: 2015, yearTo: 2020 })
    const state = useVehicleStore.getState()
    expect(state.power).toBe('150')
    expect(state.yearFrom).toBe(2015)
    expect(state.yearTo).toBe(2020)
  })

  it('clears all vehicle data', () => {
    useVehicleStore.getState().setType('passenger')
    useVehicleStore.getState().setBrand('1', 'Toyota')
    useVehicleStore.getState().setModel('10', 'Camry')
    useVehicleStore.getState().clearVehicle()
    const state = useVehicleStore.getState()
    expect(state.type).toBeNull()
    expect(state.brandId).toBeNull()
    expect(state.modelId).toBeNull()
  })
})
