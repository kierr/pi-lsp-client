import { beforeEach, describe, expect, it, vi } from "vitest";

import { withLspClient } from "../../src/lsp/client-wrapper.js";
import type { LspFormattingDetails } from "../../src/lsp/tools/formatting.js";
import { lsp_formatting } from "../../src/lsp/tools/formatting.js";

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
};

describe("lsp_formatting tool", () => {
	beforeEach(() => vi.clearAllMocks());

	// ── Metadata ───────────────────────────────────────────────────────

	describe("#given formatting tool definition #when inspecting metadata", () => {
		it("#then exposes expected name and label", () => {
			expect(lsp_formatting.name).toBe("lsp_formatting");
			expect(lsp_formatting.label).toBe("LSP Formatting");
		});

		it("#then has a description mentioning format", () => {
			expect(lsp_formatting.description).toContain("format");
		});

		it("#then requires only filePath", () => {
			expect(lsp_formatting.parameters.required).toEqual(["filePath"]);
			expect(lsp_formatting.parameters.properties).toHaveProperty("filePath");
		});

		it("#then has optional tabSize, insertSpaces, and apply params", () => {
			const props = lsp_formatting.parameters.properties;
			expect(props).toHaveProperty("tabSize");
			expect(props).toHaveProperty("insertSpaces");
			expect(props).toHaveProperty("apply");
			expect(lsp_formatting.parameters.required).not.toContain("tabSize");
			expect(lsp_formatting.parameters.required).not.toContain("insertSpaces");
			expect(lsp_formatting.parameters.required).not.toContain("apply");
		});

		it("#then has executionMode sequential (mutation tool)", () => {
			expect(lsp_formatting.executionMode).toBe("sequential");
		});
	});

	// ── Execute — successful with edits, apply=true (default) ──────────

	describe("#given formatting edits returned #when executing with apply default", () => {
		it("#then applies edits and reports result", async () => {
			mockedWithLspClient.mockResolvedValueOnce([
				{
					range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
					newText: "hello",
				},
			]);

			const result = await lsp_formatting.execute("tc-1", BASE_PARAMS, undefined, undefined, {} as never);

			expect(result.content[0]?.type).toBe("text");
			const text = (result.content[0] as { type: "text"; text: string }).text;
			expect(text).toBe("Applied 2 edits to 1 file(s)");

			const details = result.details as LspFormattingDetails;
			expect(details.filePath).toBe(BASE_PARAMS.filePath);
			expect(details.edits).toHaveLength(1);
			expect(details.edits[0]).toEqual({
				range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
				newText: "hello",
			});
			expect(details.applied).not.toBeNull();
			expect(details.applied?.success).toBe(true);
		});
	});

	// ── Execute — edits with apply=false ───────────────────────────────

	describe("#given formatting edits returned #when executing with apply=false", () => {
		it("#then returns edit count without applying", async () => {
			mockedWithLspClient.mockResolvedValueOnce([
				{
					range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
					newText: "hello",
				},
			]);

			const result = await lsp_formatting.execute(
				"tc-2",
				{ ...BASE_PARAMS, apply: false },
				undefined,
				undefined,
				{} as never,
			);

			expect(result.content[0]?.type).toBe("text");
			const text = (result.content[0] as { type: "text"; text: string }).text;
			expect(text).toBe("1 formatting edit(s) available (not applied)");

			const details = result.details as LspFormattingDetails;
			expect(details.edits).toHaveLength(1);
			expect(details.applied).toBeNull();
		});
	});

	// ── Execute — null result (already formatted) ──────────────────────

	describe("#given null formatting result #when executing", () => {
		it("#then returns already formatted message", async () => {
			mockedWithLspClient.mockResolvedValueOnce(null);

			const result = await lsp_formatting.execute("tc-3", BASE_PARAMS, undefined, undefined, {} as never);

			expect(result.content).toEqual([{ type: "text", text: "File is already formatted" }]);
			const details = result.details as LspFormattingDetails;
			expect(details.edits).toEqual([]);
			expect(details.applied).toBeNull();
		});
	});

	// ── Execute — empty edits array ────────────────────────────────────

	describe("#given empty edits array #when executing", () => {
		it("#then returns already formatted message", async () => {
			mockedWithLspClient.mockResolvedValueOnce([]);

			const result = await lsp_formatting.execute("tc-4", BASE_PARAMS, undefined, undefined, {} as never);

			expect(result.content).toEqual([{ type: "text", text: "File is already formatted" }]);
			const details = result.details as LspFormattingDetails;
			expect(details.edits).toEqual([]);
			expect(details.applied).toBeNull();
		});
	});

	// ── Execute — missing dependency error ─────────────────────────────

	describe("#given missing dependency error #when executing", () => {
		it("#then returns error message with missing_dependency errorKind", async () => {
			mockedWithLspClient.mockRejectedValueOnce(new Error("LSP server 'ruby-lsp' is configured but NOT INSTALLED."));

			const result = await lsp_formatting.execute("tc-5", BASE_PARAMS, undefined, undefined, {} as never);

			expect(result.content[0]?.type).toBe("text");
			const text = (result.content[0] as { type: "text"; text: string }).text;
			expect(text).toContain("NOT INSTALLED");
			const details = result.details as LspFormattingDetails;
			expect(details.error).toContain("NOT INSTALLED");
			expect(details.errorKind).toBe("missing_dependency");
			expect(details.edits).toEqual([]);
			expect(details.applied).toBeNull();
		});
	});

	// ── Execute — unexpected error ─────────────────────────────────────

	describe("#given unexpected error #when executing", () => {
		it("#then rethrows the error", async () => {
			mockedWithLspClient.mockRejectedValueOnce(new Error("connection refused"));

			await expect(lsp_formatting.execute("tc-6", BASE_PARAMS, undefined, undefined, {} as never)).rejects.toThrow(
				"connection refused",
			);
		});
	});
});
