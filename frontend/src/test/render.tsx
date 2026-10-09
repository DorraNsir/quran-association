import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render } from "@testing-library/react"

/** A fresh query client per test (no retries: errors surface immediately). */
export function testQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

export function renderWithClient(ui: React.ReactElement, client = testQueryClient()) {
  const result = render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
  return { ...result, client }
}

export const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
