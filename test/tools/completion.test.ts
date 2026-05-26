import { describe, expect, it, vi } from "vitest";

import { withLspClient } from "../../src/lsp/client-wrapper.js";
import type { LspCompletionDetails } from "../../src/lsp/tools/completion.js";
import { lsp_completion } from "../../src/lsp/tools/completion.js";

vi.mock("../../src/lsp/client-wrapper.js", () => ({
	withLspClient: vi.fn(),
	findWorkspaceRoot: vi.fn().mockReturnValue("/fake/workspace"),
	isDirectoryPath: vi.fn().mockReturnValue(false),
	formatServerLookupError: vi.fn().mockReturnValue("lookup error"),
}));

const mockedWithLspClient = vi.mocked(withLspClient);

const BASE_PARAMS = {
	filePath: "/fake/workspace/lib/foo.rb",
	line: 10,
	character: 5,
};

describe("lsp_completion tool", () => {
	// ── Metadata ───────────────────────────────────────────────────────

	describe("#given completion tool definition #when inspecting metadata", () => {
		it("#then exposes expected name and label", () => {
			expect(lsp_completion.name).toBe("lsp_completion");
			expect(lsp_completion.label).toBe("LSP Completion");
		});

		it("#then has a description mentioning completion", () => {
			expect(lsp_completion.description).toContain("completion");
		});

		it("#then requires filePath, line, character with optional resolve and limit", () => {
			expect(lsp_completion.parameters.required).toEqual(["filePath", "line", "character"]);
			expect(lsp_completion.parameters.properties).toHaveProperty("resolve");
			expect(lsp_completion.parameters.properties).toHaveProperty("limit");
		});

		it("#then has no executionMode (read-only)", () => {
			expect(lsp_completion.executionMode).toBeUndefined();
		});
	});

	// ── Execute — successful completion ────────────────────────────────

	describe("#given successful completion result #when executing", () => {
		it("#then returns formatted items with kind labels and details", async () => {
			mockedWithLspClient.mockResolvedValueOnce({
				items: [
					{ label: "foo", kind: 2, detail: "method def" },
					{ label: "bar", kind: 7, detail: "class" },
					{ label: "baz" },
				],
				isIncomplete: false,
			});

			const result = await lsp_completion.execute("tc-1", BASE_PARAMS, undefined, undefined, {} as never);

			const text = (result.content[0] as { type: "text"; text: string }).text;
			expect(text).toContain("foo [Method] — method def");
			expect(text).toContain("bar [Class] — class");
			expect(text).toContain("baz");
			expect(text).not.toContain("showing first");

			const details = result.details as LspCompletionDetails;
			expect(details.items).toHaveLength(3);
			expect(details.isIncomplete).toBe(false);
			expect(details.totalItems).toBe(3);
			expect(details.truncated).toBe(false);
			expect(details.resolved).toBe(0);
		});

		it("#then formats items without kind or detail", async () => {
			mockedWithLspClient.mockResolvedValueOnce({
				items: [{ label: "simple_item" }],
				isIncomplete: false,
			});

			const result = await lsp_completion.execute("tc-2", BASE_PARAMS, undefined, undefined, {} as never);

			const text = (result.content[0] as { type: "text"; text: string }).text;
			expect(text).toBe("simple_item");
		});
	});

	// ── Execute — null result ──────────────────────────────────────────

	describe("#given null completion result #when executing", () => {
		it("#then returns no completions message with empty details", async () => {
			mockedWithLspClient.mockResolvedValueOnce(null);

			const result = await lsp_completion.execute("tc-3", BASE_PARAMS, undefined, undefined, {} as never);

			expect(result.content).toEqual([{ type: "text", text: "No completions available" }]);
			const details = result.details as LspCompletionDetails;
			expect(details.items).toEqual([]);
			expect(details.totalItems).toBe(0);
			expect(details.truncated).toBe(false);
		});
	});

	// ── Execute — empty items ──────────────────────────────────────────

	describe("#given empty items list #when executing", () => {
		it("#then returns no completions message", async () => {
			mockedWithLspClient.mockResolvedValueOnce({
				items: [],
				isIncomplete: false,
			});

			const result = await lsp_completion.execute("tc-4", BASE_PARAMS, undefined, undefined, {} as never);

			expect(result.content).toEqual([{ type: "text", text: "No completions available" }]);
			const details = result.details as LspCompletionDetails;
			expect(details.totalItems).toBe(0);
		});
	});

	// ── Execute — truncation ───────────────────────────────────────────

	describe("#given more items than limit #when executing", () => {
		it("#then truncates and shows count header", async () => {
			const items = Array.from({ length: 55 }, (_, i) => ({ label: `item_${i}` }));
			mockedWithLspClient.mockResolvedValueOnce({
				items,
				isIncomplete: false,
			});

			const result = await lsp_completion.execute(
				"tc-5",
				{ ...BASE_PARAMS, limit: 10 },
				undefined,
				undefined,
				{} as never,
			);

			const text = (result.content[0] as { type: "text"; text: string }).text;
			expect(text).toContain("Found 55 completions (showing first 10):");
			expect(text).toContain("item_0");
			expect(text).toContain("item_9");
			expect(text).not.toContain("item_10");

			const details = result.details as LspCompletionDetails;
			expect(details.truncated).toBe(true);
			expect(details.totalItems).toBe(55);
		});
	});

	// ── Execute — resolve ──────────────────────────────────────────────

	describe("#given resolve=true and items with data #when executing", () => {
		it("#then calls completionResolve for items with data and patches details", async () => {
			// First call: completion
			mockedWithLspClient.mockResolvedValueOnce({
				items: [{ label: "foo", kind: 2, data: { resolver: "ruby-lsp" } }, { label: "bar" }],
				isIncomplete: false,
			});
			// Second call: completionResolve for "foo"
			mockedWithLspClient.mockResolvedValueOnce({
				label: "foo",
				kind: 2,
				detail: "resolved detail",
				documentation: "resolved docs",
			});

			const result = await lsp_completion.execute(
				"tc-6",
				{ ...BASE_PARAMS, resolve: true },
				undefined,
				undefined,
				{} as never,
			);

			const text = (result.content[0] as { type: "text"; text: string }).text;
			expect(text).toContain("foo [Method] — resolved detail");

			const details = result.details as LspCompletionDetails;
			expect(details.resolved).toBe(1);
		});

		it("#then tolerates resolve failures gracefully", async () => {
			mockedWithLspClient.mockResolvedValueOnce({
				items: [{ label: "bad_item", kind: 2, data: {} }],
				isIncomplete: false,
			});
			mockedWithLspClient.mockRejectedValueOnce(new Error("resolve failed"));

			const result = await lsp_completion.execute(
				"tc-7",
				{ ...BASE_PARAMS, resolve: true },
				undefined,
				undefined,
				{} as never,
			);

			// Should not throw — resolve failure is non-fatal
			const details = result.details as LspCompletionDetails;
			expect(details.resolved).toBe(0);
		});
	});

	// ── Execute — missing dependency error ─────────────────────────────

	describe("#given missing dependency error #when executing", () => {
		it("#then returns error message with missing_dependency errorKind", async () => {
			mockedWithLspClient.mockRejectedValueOnce(new Error("No LSP server configured for extension: .rb"));

			const result = await lsp_completion.execute("tc-8", BASE_PARAMS, undefined, undefined, {} as never);

			const text = (result.content[0] as { type: "text"; text: string }).text;
			expect(text).toContain("No LSP server configured");
			const details = result.details as LspCompletionDetails;
			expect(details.error).toContain("No LSP server configured");
			expect(details.errorKind).toBe("missing_dependency");
		});
	});

	// ── Execute — unexpected error ─────────────────────────────────────

	describe("#given unexpected error #when executing", () => {
		it("#then rethrows the error", async () => {
			mockedWithLspClient.mockRejectedValueOnce(new Error("transport closed"));

			await expect(lsp_completion.execute("tc-9", BASE_PARAMS, undefined, undefined, {} as never)).rejects.toThrow(
				"transport closed",
			);
		});
	});
});
