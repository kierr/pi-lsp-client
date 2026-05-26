import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LspShowSyntaxTreeDetails } from "../../src/lsp/tools/show-syntax-tree.js";
import { lsp_show_syntax_tree } from "../../src/lsp/tools/show-syntax-tree.js";

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

describe("lsp_show_syntax_tree", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── Metadata ──────────────────────────────────────────────────────────

	describe("#given show syntax tree tool #when inspecting metadata", () => {
		it("#then exposes expected name, label, and description", () => {
			expect(lsp_show_syntax_tree.name).toBe("lsp_show_syntax_tree");
			expect(lsp_show_syntax_tree.label).toBe("LSP Show Syntax Tree (RubyLSP)");
			expect(lsp_show_syntax_tree.description).toContain("AST");
		});

		it("#then has no executionMode", () => {
			expect(lsp_show_syntax_tree.executionMode).toBeUndefined();
		});

		it("#then requires filePath only", () => {
			const params = lsp_show_syntax_tree.parameters;
			expect(params.type).toBe("object");
			expect(params.required).toEqual(["filePath"]);
			expect(params.properties).toHaveProperty("filePath");
		});

		it("#then has optional range parameters", () => {
			const props = lsp_show_syntax_tree.parameters.properties;
			expect(props).toHaveProperty("startLine");
			expect(props).toHaveProperty("startCharacter");
			expect(props).toHaveProperty("endLine");
			expect(props).toHaveProperty("endCharacter");
		});

		it("#then filePath is a string, range params are numbers", () => {
			const props = lsp_show_syntax_tree.parameters.properties;
			expect(props.filePath.type).toBe("string");
			expect(props.startLine.type).toBe("number");
			expect(props.endLine.type).toBe("number");
		});
	});

	// ── Execute — successful AST retrieval ────────────────────────────────

	describe("#given show syntax tree #when execute returns AST", () => {
		it("#then returns AST text without range when no range params", async () => {
			mockWithLspClient.mockResolvedValueOnce({
				ast: "@ ProgramNode\n  @ StatementsNode",
			});

			const result = await lsp_show_syntax_tree.execute(
				"call-1",
				{ filePath: "/test.rb" },
				undefined as never,
				() => {},
				undefined as never,
			);

			const details = result.details as LspShowSyntaxTreeDetails;
			expect(details.filePath).toBe("/test.rb");
			expect(details.ast).toBe("@ ProgramNode\n  @ StatementsNode");
			expect(details.range).toBeUndefined();
			expect(getContentText(result)).toBe("@ ProgramNode\n  @ StatementsNode");
		});

		it("#then includes range in details when all four range params provided", async () => {
			mockWithLspClient.mockResolvedValueOnce({
				ast: "@ ProgramNode",
			});

			const result = await lsp_show_syntax_tree.execute(
				"call-2",
				{
					filePath: "/test.rb",
					startLine: 1,
					startCharacter: 0,
					endLine: 5,
					endCharacter: 10,
				},
				undefined as never,
				() => {},
				undefined as never,
			);

			const details = result.details as LspShowSyntaxTreeDetails;
			expect(details.range).toEqual({
				startLine: 1,
				startCharacter: 0,
				endLine: 5,
				endCharacter: 10,
			});
		});

		it("#then omits range when only some range params are provided", async () => {
			mockWithLspClient.mockResolvedValueOnce({
				ast: "@ ProgramNode",
			});

			const result = await lsp_show_syntax_tree.execute(
				"call-3",
				{
					filePath: "/test.rb",
					startLine: 1,
					// missing startCharacter, endLine, endCharacter
				},
				undefined as never,
				() => {},
				undefined as never,
			);

			const details = result.details as LspShowSyntaxTreeDetails;
			expect(details.range).toBeUndefined();
		});

		it("#then omits range when three of four range params are provided", async () => {
			mockWithLspClient.mockResolvedValueOnce({
				ast: "@ ProgramNode",
			});

			const result = await lsp_show_syntax_tree.execute(
				"call-4",
				{
					filePath: "/test.rb",
					startLine: 1,
					startCharacter: 0,
					endLine: 5,
					// missing endCharacter
				},
				undefined as never,
				() => {},
				undefined as never,
			);

			const details = result.details as LspShowSyntaxTreeDetails;
			expect(details.range).toBeUndefined();
		});
	});

	// ── Null / empty results ──────────────────────────────────────────────

	describe("#given show syntax tree #when execute returns null or empty", () => {
		it("#then returns 'No syntax tree available' for null result", async () => {
			mockWithLspClient.mockResolvedValueOnce(null);

			const result = await lsp_show_syntax_tree.execute(
				"call-5",
				{ filePath: "/test.rb" },
				undefined as never,
				() => {},
				undefined as never,
			);

			expect(getContentText(result)).toBe("No syntax tree available");
			const details = result.details as LspShowSyntaxTreeDetails;
			expect(details.ast).toBeNull();
		});

		it("#then returns 'No syntax tree available' for result with null ast", async () => {
			mockWithLspClient.mockResolvedValueOnce({ ast: null });

			const result = await lsp_show_syntax_tree.execute(
				"call-6",
				{ filePath: "/test.rb" },
				undefined as never,
				() => {},
				undefined as never,
			);

			expect(getContentText(result)).toBe("No syntax tree available");
		});
	});

	// ── Error handling ────────────────────────────────────────────────────

	describe("#given show syntax tree #when execute encounters errors", () => {
		it("#then handles missing dependency error", async () => {
			mockWithLspClient.mockRejectedValueOnce(new Error("LSP server 'ruby-lsp' is configured but NOT INSTALLED."));

			const result = await lsp_show_syntax_tree.execute(
				"call-7",
				{ filePath: "/test.rb" },
				undefined as never,
				() => {},
				undefined as never,
			);

			const details = result.details as LspShowSyntaxTreeDetails;
			expect(details.error).toContain("NOT INSTALLED");
			expect(details.errorKind).toBe("missing_dependency");
			expect(details.ast).toBeNull();
			expect(getContentText(result)).toContain("NOT INSTALLED");
		});

		it("#then re-throws non-dependency errors", async () => {
			mockWithLspClient.mockRejectedValueOnce(new Error("Unexpected server error"));

			await expect(
				lsp_show_syntax_tree.execute(
					"call-8",
					{ filePath: "/test.rb" },
					undefined as never,
					() => {},
					undefined as never,
				),
			).rejects.toThrow("Unexpected server error");
		});
	});
});
