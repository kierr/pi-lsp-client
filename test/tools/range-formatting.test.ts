import { beforeEach, describe, expect, it, vi } from "vitest";

import { withLspClient } from "../../src/lsp/client-wrapper.js";
import type { LspRangeFormattingDetails } from "../../src/lsp/tools/range-formatting.js";
import { lsp_range_formatting } from "../../src/lsp/tools/range-formatting.js";

vi.mock("../../src/lsp/client-wrapper.js", () => ({
	withLspClient: vi.fn(),
	findWorkspaceRoot: vi.fn().mockReturnValue("/fake/workspace"),
	isDirectoryPath: vi.fn().mockReturnValue(false),
	formatServerLookupError: vi.fn().mockReturnValue("lookup error"),
}));

vi.mock("../../src/lsp/workspace-edit.js", () => ({
	applyWorkspaceEdit: vi
		.fn()
		.mockReturnValue({ success: true, filesModified: ["/fake/file.rb"], totalEdits: 2, errors: [] }),
}));

vi.mock("../../src/lsp/formatters.js", () => ({
	formatApplyResult: vi.fn().mockReturnValue("Applied 2 edits to 1 file(s)"),
}));

const mockedWithLspClient = vi.mocked(withLspClient);

const BASE_PARAMS = {
	filePath: "/fake/workspace/lib/foo.rb",
	line: 1,
	character: 0,
	endLine: 5,
	endCharacter: 10,
};

describe("lsp_range_formatting tool", () => {
	beforeEach(() => vi.clearAllMocks());

	// ── Metadata ───────────────────────────────────────────────────────

	describe("#given range formatting tool definition #when inspecting metadata", () => {
		it("#then exposes expected name and label", () => {
			expect(lsp_range_formatting.name).toBe("lsp_range_formatting");
			expect(lsp_range_formatting.label).toBe("LSP Range Formatting");
		});

		it("#then has a description mentioning format or range", () => {
			expect(lsp_range_formatting.description).toContain("format");
		});

		it("#then requires filePath, line, character, endLine, endCharacter", () => {
			expect(lsp_range_formatting.parameters.required).toEqual([
				"filePath",
				"line",
				"character",
				"endLine",
				"endCharacter",
			]);
			const props = lsp_range_formatting.parameters.properties;
			expect(props).toHaveProperty("filePath");
			expect(props).toHaveProperty("line");
			expect(props).toHaveProperty("character");
			expect(props).toHaveProperty("endLine");
			expect(props).toHaveProperty("endCharacter");
		});

		it("#then has optional tabSize, insertSpaces, and apply params", () => {
			const props = lsp_range_formatting.parameters.properties;
			expect(props).toHaveProperty("tabSize");
			expect(props).toHaveProperty("insertSpaces");
			expect(props).toHaveProperty("apply");
			expect(lsp_range_formatting.parameters.required).not.toContain("tabSize");
			expect(lsp_range_formatting.parameters.required).not.toContain("insertSpaces");
			expect(lsp_range_formatting.parameters.required).not.toContain("apply");
		});

		it("#then has executionMode sequential (mutation tool)", () => {
			expect(lsp_range_formatting.executionMode).toBe("sequential");
		});
	});

	// ── Execute — successful with edits, apply=true (default) ──────────

	describe("#given range formatting edits returned #when executing with apply default", () => {
		it("#then applies edits and reports result with correct range", async () => {
			mockedWithLspClient.mockResolvedValueOnce([
				{
					range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
					newText: "hello",
				},
			]);

			const result = await lsp_range_formatting.execute("tc-1", BASE_PARAMS, undefined, undefined, {} as never);

			expect(result.content[0]?.type).toBe("text");
			const text = (result.content[0] as { type: "text"; text: string }).text;
			expect(text).toBe("Applied 2 edits to 1 file(s)");

			const details = result.details as LspRangeFormattingDetails;
			expect(details.filePath).toBe(BASE_PARAMS.filePath);
			expect(details.range).toEqual({
				start: { line: 0, character: 0 },
				end: { line: 4, character: 10 },
			});
			expect(details.edits).toHaveLength(1);
			expect(details.applied).not.toBeNull();
			expect(details.applied?.success).toBe(true);
		});
	});

	// ── Execute — edits with apply=false ───────────────────────────────

	describe("#given range formatting edits returned #when executing with apply=false", () => {
		it("#then returns edit count without applying", async () => {
			mockedWithLspClient.mockResolvedValueOnce([
				{
					range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
					newText: "hello",
				},
			]);

			const result = await lsp_range_formatting.execute(
				"tc-2",
				{ ...BASE_PARAMS, apply: false },
				undefined,
				undefined,
				{} as never,
			);

			expect(result.content[0]?.type).toBe("text");
			const text = (result.content[0] as { type: "text"; text: string }).text;
			expect(text).toBe("1 formatting edit(s) available (not applied)");

			const details = result.details as LspRangeFormattingDetails;
			expect(details.edits).toHaveLength(1);
			expect(details.applied).toBeNull();
		});
	});

	// ── Execute — null result (already formatted) ──────────────────────

	describe("#given null range formatting result #when executing", () => {
		it("#then returns already formatted message", async () => {
			mockedWithLspClient.mockResolvedValueOnce(null);

			const result = await lsp_range_formatting.execute("tc-3", BASE_PARAMS, undefined, undefined, {} as never);

			expect(result.content).toEqual([{ type: "text", text: "Range is already formatted" }]);
			const details = result.details as LspRangeFormattingDetails;
			expect(details.edits).toEqual([]);
			expect(details.applied).toBeNull();
			// Range is still present in details even for empty results
			expect(details.range).toEqual({
				start: { line: 0, character: 0 },
				end: { line: 4, character: 10 },
			});
		});
	});

	// ── Execute — empty edits array ────────────────────────────────────

	describe("#given empty edits array #when executing", () => {
		it("#then returns already formatted message", async () => {
			mockedWithLspClient.mockResolvedValueOnce([]);

			const result = await lsp_range_formatting.execute("tc-4", BASE_PARAMS, undefined, undefined, {} as never);

			expect(result.content).toEqual([{ type: "text", text: "Range is already formatted" }]);
			const details = result.details as LspRangeFormattingDetails;
			expect(details.edits).toEqual([]);
			expect(details.applied).toBeNull();
		});
	});

	// ── Execute — missing dependency error ─────────────────────────────

	describe("#given missing dependency error #when executing", () => {
		it("#then returns error message with missing_dependency errorKind", async () => {
			mockedWithLspClient.mockRejectedValueOnce(new Error("LSP server 'ruby-lsp' is configured but NOT INSTALLED."));

			const result = await lsp_range_formatting.execute("tc-5", BASE_PARAMS, undefined, undefined, {} as never);

			expect(result.content[0]?.type).toBe("text");
			const text = (result.content[0] as { type: "text"; text: string }).text;
			expect(text).toContain("NOT INSTALLED");
			const details = result.details as LspRangeFormattingDetails;
			expect(details.error).toContain("NOT INSTALLED");
			expect(details.errorKind).toBe("missing_dependency");
			expect(details.edits).toEqual([]);
			expect(details.applied).toBeNull();
			// Range is still present in error details
			expect(details.range).toEqual({
				start: { line: 0, character: 0 },
				end: { line: 4, character: 10 },
			});
		});
	});

	// ── Execute — unexpected error ─────────────────────────────────────

	describe("#given unexpected error #when executing", () => {
		it("#then rethrows the error", async () => {
			mockedWithLspClient.mockRejectedValueOnce(new Error("connection refused"));

			await expect(
				lsp_range_formatting.execute("tc-6", BASE_PARAMS, undefined, undefined, {} as never),
			).rejects.toThrow("connection refused");
		});
	});
});
