import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DecodedToken, LspSemanticTokensDetails } from "../../src/lsp/tools/semantic-tokens.js";
import { lsp_semantic_tokens } from "../../src/lsp/tools/semantic-tokens.js";

vi.mock("../../src/lsp/client-wrapper.js", () => ({
	withLspClient: vi.fn(),
	findWorkspaceRoot: vi.fn().mockReturnValue("/fake/workspace"),
	isDirectoryPath: vi.fn().mockReturnValue(false),
	formatServerLookupError: vi.fn().mockReturnValue("lookup error"),
}));

import { withLspClient } from "../../src/lsp/client-wrapper.js";

const mockWithLspClient = vi.mocked(withLspClient);

// Helper to extract text content from tool results without non-null assertions.
function getContentText(result: { content: Array<{ type?: string; text?: string }> }): string {
	const item = result.content[0];
	return (item as { type: string; text: string }).text;
}

describe("lsp_semantic_tokens", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── Metadata ──────────────────────────────────────────────────────────

	describe("#given semantic tokens tool #when inspecting metadata", () => {
		it("#then exposes expected name, label, and description", () => {
			expect(lsp_semantic_tokens.name).toBe("lsp_semantic_tokens");
			expect(lsp_semantic_tokens.label).toBe("LSP Semantic Tokens");
			expect(lsp_semantic_tokens.description).toContain("semantic token");
		});

		it("#then has no executionMode", () => {
			expect(lsp_semantic_tokens.executionMode).toBeUndefined();
		});

		it("#then requires filePath only", () => {
			const params = lsp_semantic_tokens.parameters;
			expect(params.type).toBe("object");
			expect(params.required).toEqual(["filePath"]);
			expect(params.properties).toHaveProperty("filePath");
		});

		it("#then filePath is a string", () => {
			const fp = lsp_semantic_tokens.parameters.properties.filePath;
			expect(fp.type).toBe("string");
		});
	});

	// ── Execute — successful decode ───────────────────────────────────────

	describe("#given semantic tokens #when execute returns data", () => {
		it("#then decodes delta-encoded 5-tuples to absolute positions", async () => {
			// Delta-encoded: [deltaLine, deltaChar, length, type, modifiers]
			// Token 1: line += 0, char = 0 -> line 0+1=1, char 0, len 5, type 1
			// Token 2: line += 0, char += 5 -> line 0+1=1, char 5, len 3, type 2
			mockWithLspClient.mockResolvedValueOnce({
				data: [0, 0, 5, 1, 0, 0, 5, 3, 2, 0],
			});

			const result = await lsp_semantic_tokens.execute(
				"call-1",
				{ filePath: "/test.rb" },
				undefined as never,
				() => {},
				undefined as never,
			);

			const details = result.details as LspSemanticTokensDetails;
			expect(details.filePath).toBe("/test.rb");
			expect(details.tokens).toHaveLength(2);
			expect(details.totalTokens).toBe(2);

			// First token: line 1, char 0, length 5, type 1
			expect(details.tokens[0]!).toEqual({
				line: 1,
				character: 0,
				length: 5,
				type: 1,
				modifiers: 0,
			} satisfies DecodedToken);

			// Second token: same line, char incremented by delta
			expect(details.tokens[1]!).toEqual({
				line: 1,
				character: 5,
				length: 3,
				type: 2,
				modifiers: 0,
			} satisfies DecodedToken);

			// Text output should contain formatted tokens
			const text = getContentText(result);
			expect(text).toContain("1:0 [5] type=1");
			expect(text).toContain("1:5 [3] type=2");
		});

		it("#then resets character when deltaLine > 0", async () => {
			// Token 1: line 1, char 3, len 4, type 0
			// Token 2: deltaLine=2, deltaChar=1 -> line 1+2=3, char=1 (reset, not 3+1)
			mockWithLspClient.mockResolvedValueOnce({
				data: [0, 3, 4, 0, 0, 2, 1, 6, 3, 0],
			});

			const result = await lsp_semantic_tokens.execute(
				"call-2",
				{ filePath: "/test.rb" },
				undefined as never,
				() => {},
				undefined as never,
			);

			const details = result.details as LspSemanticTokensDetails;
			expect(details.tokens[1]?.line).toBe(3);
			expect(details.tokens[1]?.character).toBe(1); // reset to deltaChar, not 3+1
		});
	});

	// ── Null / empty results ──────────────────────────────────────────────

	describe("#given semantic tokens #when execute returns null or empty", () => {
		it("#then returns 'No semantic tokens found' for null result", async () => {
			mockWithLspClient.mockResolvedValueOnce(null);

			const result = await lsp_semantic_tokens.execute(
				"call-3",
				{ filePath: "/test.rb" },
				undefined as never,
				() => {},
				undefined as never,
			);

			expect(getContentText(result)).toBe("No semantic tokens found");
			const details = result.details as LspSemanticTokensDetails;
			expect(details.tokens).toEqual([]);
			expect(details.totalTokens).toBe(0);
		});

		it("#then returns 'No semantic tokens found' for empty data array", async () => {
			mockWithLspClient.mockResolvedValueOnce({ data: [] });

			const result = await lsp_semantic_tokens.execute(
				"call-4",
				{ filePath: "/test.rb" },
				undefined as never,
				() => {},
				undefined as never,
			);

			expect(getContentText(result)).toBe("No semantic tokens found");
			const details = result.details as LspSemanticTokensDetails;
			expect(details.totalTokens).toBe(0);
		});

		it("#then returns 'No semantic tokens found' for result with no data property", async () => {
			mockWithLspClient.mockResolvedValueOnce({});

			const result = await lsp_semantic_tokens.execute(
				"call-5",
				{ filePath: "/test.rb" },
				undefined as never,
				() => {},
				undefined as never,
			);

			expect(getContentText(result)).toBe("No semantic tokens found");
		});
	});

	// ── Error handling ────────────────────────────────────────────────────

	describe("#given semantic tokens #when execute encounters errors", () => {
		it("#then handles missing dependency error", async () => {
			mockWithLspClient.mockRejectedValueOnce(new Error("LSP server 'ruby-lsp' is configured but NOT INSTALLED."));

			const result = await lsp_semantic_tokens.execute(
				"call-6",
				{ filePath: "/test.rb" },
				undefined as never,
				() => {},
				undefined as never,
			);

			const details = result.details as LspSemanticTokensDetails;
			expect(details.error).toContain("NOT INSTALLED");
			expect(details.errorKind).toBe("missing_dependency");
			expect(getContentText(result)).toContain("NOT INSTALLED");
		});

		it("#then re-throws non-dependency errors", async () => {
			mockWithLspClient.mockRejectedValueOnce(new Error("Unexpected server error"));

			await expect(
				lsp_semantic_tokens.execute(
					"call-7",
					{ filePath: "/test.rb" },
					undefined as never,
					() => {},
					undefined as never,
				),
			).rejects.toThrow("Unexpected server error");
		});
	});
});
