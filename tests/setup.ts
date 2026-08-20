import '@testing-library/jest-dom/vitest'

if (!globalThis.crypto.randomUUID) {
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    value: () => '10000000-1000-4000-8000-100000000000',
  })
}
