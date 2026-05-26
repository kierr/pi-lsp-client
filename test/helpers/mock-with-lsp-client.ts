import { vi } from "vitest";

/** Mock `withLspClient` to call `fn` with a fake client that returns `mockResult`. */
export function mockWithLspClientResult<T>(_mockResult: T): void {
	vi.mock("../../src/lsp/client-wrapper.js", () => ({
		withLspClient: vi.fn().mockImplementation(async (_filePath: string, fn: (client: unknown) => Promise<T>) => {
			const fakeClient = {};
			return fn(fakeClient);
		}),
		findWorkspaceRoot: vi.fn().mockReturnValue("/fake/workspace"),
		isDirectoryPath: vi.fn().mockReturnValue(false),
		formatServerLookupError: vi.fn().mockReturnValue("lookup error"),
	}));
}

/**
 * Mock `withLspClient` so the tool's callback receives a client whose methods
 * are driven by the provided `clientMethods` map.
 *
 * clientMethods example:
 * ```
 * { hover: vi.fn().mockResolvedValue({ contents: { kind: "markdown", value: "**String**" } }) }
 * ```
 */
export function mockWithLspClient(clientMethods: Record<string, unknown>): void {
	vi.mock("../../src/lsp/client-wrapper.js", () => ({
		withLspClient: vi
			.fn()
			.mockImplementation(async (_filePath: string, fn: (client: unknown) => Promise<unknown>) => {
				return fn(clientMethods);
			}),
		findWorkspaceRoot: vi.fn().mockReturnValue("/fake/workspace"),
		isDirectoryPath: vi.fn().mockReturnValue(false),
		formatServerLookupError: vi.fn().mockReturnValue("lookup error"),
	}));
}

/**
 * Mock `withLspClient` to throw an error.
 * Useful for testing `handleMissingDependencyError` paths.
 */
export function mockWithLspClientError(error: unknown): void {
	vi.mock("../../src/lsp/client-wrapper.js", () => ({
		withLspClient: vi.fn().mockRejectedValue(error),
		findWorkspaceRoot: vi.fn().mockReturnValue("/fake/workspace"),
		isDirectoryPath: vi.fn().mockReturnValue(false),
		formatServerLookupError: vi.fn().mockReturnValue("lookup error"),
	}));
}
