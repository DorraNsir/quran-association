import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

// Unmount between tests (Vitest runs without globals, so Testing Library cannot register this itself)
afterEach(() => cleanup())
