import { beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    (async (input: string | URL | Request) => {
      throw new Error(`Unexpected network call in tests. Mock fetch explicitly for: ${String(input)}`);
    }) as typeof fetch,
  );
});
