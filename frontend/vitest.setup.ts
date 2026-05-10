import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Auto-unmount React trees between tests so refs / event listeners /
// useEffect cleanup all fire predictably. Without this, hooks under
// test could leak across cases (e.g. a setTimeout in one test firing
// while another is asserting state).
afterEach(() => {
  cleanup()
})
