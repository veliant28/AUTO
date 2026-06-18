import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

let store: Record<string, string> = {}

const localStorageMock = {
  getItem: jest.fn((key: string) => store[key] ?? null),
  setItem: jest.fn((key: string, value: string) => {
    store[key] = value
  }),
  removeItem: jest.fn((key: string) => {
    delete store[key]
  }),
  clear: jest.fn(() => {
    store = {}
  }),
  get length() {
    return Object.keys(store).length
  },
  key: jest.fn((index: number) => Object.keys(store)[index] ?? null),
}

Object.defineProperty(global, 'localStorage', { value: localStorageMock })

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const parts = key.split('.')
    return parts[parts.length - 1]
  },
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  usePathname: () => '/',
}))

jest.mock('next/image', () => ({
  __esModule: true,
  default: jest.fn(({ src, alt, ...props }) => {
    return { type: 'img', props: { src, alt, ...props } }
  }),
}))

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({ data: {} }),
    post: jest.fn().mockResolvedValue({ data: {} }),
    put: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
  },
}))

jest.mock('@/lib/toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}))
