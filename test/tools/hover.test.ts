import { describe, expect, it, vi } from "vitest";

import { withLspClient } from "../../src/lsp/client-wrapper.js";
import type { LspHoverDetails } from "../../src/lsp/tools/hover.js";
import { lsp_hover } from "../../src/lsp/tools/hover.js";

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

describe("lsp_hover tool", () => {
	// ── Metadata ───────────────────────────────────────────────────────

	describe("#given hover tool definition #when inspecting metadata", () => {
		it("#then exposes expected name and label", () => {
			expect(lsp_hover.name).toBe("lsp_hover");
			expect(lsp_hover.label).toBe("LSP Hover");
		});

		it("#then has a description mentioning type info", () => {
			expect(lsp_hover.description).toContain("type info");
		});

		it("#then requires filePath, line, and character", () => {
			expect(lsp_hover.parameters.required).toEqual(["filePath", "line", "character"]);
			expect(lsp_hover.parameters.properties).toHaveProperty("filePath");
			expect(lsp_hover.parameters.properties).toHaveProperty("line");
			expect(lsp_hover.parameters.properties).toHaveProperty("character");
		});

		it("#then has no executionMode (read-only)", () => {
			expect(lsp_hover.executionMode).toBeUndefined();
		});
	});

	// ── Execute — successful hover ─────────────────────────────────────

	describe("#given successful hover result #when executing", () => {
		it("#then returns extracted text and hover details", async () => {
			mockedWithLspClient.mockResolvedValueOnce({
				contents: { kind: "markdown", value: "**String**" },
				range: {
					start: { line: 9, character: 5 },
					end: { line: 9, character: 11 },
				},
			});

			const result = await lsp_hover.execute("tc-1", BASE_PARAMS, undefined, undefined, {} as never);

			expect(result.content).toEqual([{ type: "text", text: "**String**" }]);
			const details = result.details as LspHoverDetails;
			expect(details.filePath).toBe(BASE_PARAMS.filePath);
			expect(details.line).toBe(10);
			expect(details.character).toBe(5);
			expect(details.contents).toEqual(["**String**"]);
			expect(details.hover).not.toBeNull();
		});

		it("#then joins multiple contents with separator", async () => {
			mockedWithLspClient.mockResolvedValueOnce({
				contents: [
					{ language: "ruby", value: "String" },
					{ language: "ruby", value: "Integer" },
				],
			});

			const result = await lsp_hover.execute("tc-2", BASE_PARAMS, undefined, undefined, {} as never);

			expect(result.content[0]?.type).toBe("text");
			const text = (result.content[0] as { type: "text"; text: string }).text;
			expect(text).toContain("\n---\n");
			expect(text).toContain("```ruby\nString\n```");
			expect(text).toContain("```ruby\nInteger\n```");
		});

		it("#then handles string contents directly", async () => {
			mockedWithLspClient.mockResolvedValueOnce({
				contents: "plain text hover",
			});

			const result = await lsp_hover.execute("tc-3", BASE_PARAMS, undefined, undefined, {} as never);

			expect(result.content).toEqual([{ type: "text", text: "plain text hover" }]);
			const details = result.details as LspHoverDetails;
			expect(details.contents).toEqual(["plain text hover"]);
		});
	});

	// ── Execute — null result ──────────────────────────────────────────

	describe("#given null hover result #when executing", () => {
		it("#then returns no hover information message with empty details", async () => {
			mockedWithLspClient.mockResolvedValueOnce(null);

			const result = await lsp_hover.execute("tc-4", BASE_PARAMS, undefined, undefined, {} as never);

			expect(result.content).toEqual([{ type: "text", text: "No hover information available" }]);
			const details = result.details as LspHoverDetails;
			expect(details.hover).toBeNull();
			expect(details.contents).toEqual([]);
		});
	});

	// ── Execute — missing dependency error ─────────────────────────────

	describe("#given missing dependency error #when executing", () => {
		it("#then returns error message with missing_dependency errorKind", async () => {
			mockedWithLspClient.mockRejectedValueOnce(new Error("LSP server 'ruby-lsp' is configured but NOT INSTALLED."));

			const result = await lsp_hover.execute("tc-5", BASE_PARAMS, undefined, undefined, {} as never);

			expect(result.content[0]?.type).toBe("text");
			const text = (result.content[0] as { type: "text"; text: string }).text;
			expect(text).toContain("NOT INSTALLED");
			const details = result.details as LspHoverDetails;
			expect(details.error).toContain("NOT INSTALLED");
			expect(details.errorKind).toBe("missing_dependency");
		});
	});

	// ── Execute — unexpected error ─────────────────────────────────────

	describe("#given unexpected error #when executing", () => {
		it("#then rethrows the error", async () => {
			mockedWithLspClient.mockRejectedValueOnce(new Error("connection refused"));

			await expect(lsp_hover.execute("tc-6", BASE_PARAMS, undefined, undefined, {} as never)).rejects.toThrow(
				"connection refused",
			);
		});
	});
});
