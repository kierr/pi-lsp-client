import { beforeEach, describe, expect, it, vi } from "vitest";

import { withLspClient } from "../../src/lsp/client-wrapper.js";
import type { LspCodeActionsDetails } from "../../src/lsp/tools/code-actions.js";
import { lsp_code_actions } from "../../src/lsp/tools/code-actions.js";

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
	line: 10,
	character: 5,
};

describe("lsp_code_actions tool", () => {
	beforeEach(() => vi.clearAllMocks());

	// ── Metadata ───────────────────────────────────────────────────────

	describe("#given code actions tool definition #when inspecting metadata", () => {
		it("#then exposes expected name and label", () => {
			expect(lsp_code_actions.name).toBe("lsp_code_actions");
			expect(lsp_code_actions.label).toBe("LSP Code Actions");
		});

		it("#then has a description mentioning code actions", () => {
			expect(lsp_code_actions.description).toContain("code action");
		});

		it("#then requires filePath, line, and character", () => {
			expect(lsp_code_actions.parameters.required).toEqual(["filePath", "line", "character"]);
			expect(lsp_code_actions.parameters.properties).toHaveProperty("filePath");
			expect(lsp_code_actions.parameters.properties).toHaveProperty("line");
			expect(lsp_code_actions.parameters.properties).toHaveProperty("character");
		});

		it("#then has optional endLine, endCharacter, only, and applyIndex params", () => {
			const props = lsp_code_actions.parameters.properties;
			expect(props).toHaveProperty("endLine");
			expect(props).toHaveProperty("endCharacter");
			expect(props).toHaveProperty("only");
			expect(props).toHaveProperty("applyIndex");
			// These should not be in required
			expect(lsp_code_actions.parameters.required).not.toContain("endLine");
			expect(lsp_code_actions.parameters.required).not.toContain("endCharacter");
			expect(lsp_code_actions.parameters.required).not.toContain("only");
			expect(lsp_code_actions.parameters.required).not.toContain("applyIndex");
		});

		it("#then has executionMode sequential (mutation tool)", () => {
			expect(lsp_code_actions.executionMode).toBe("sequential");
		});
	});

	// ── Execute — successful with actions ──────────────────────────────

	describe("#given code actions returned #when executing", () => {
		it("#then formats CodeAction with index, kind, and preferred marker", async () => {
			mockedWithLspClient.mockResolvedValueOnce([
				{ title: "Extract variable", kind: "refactor.extract", isPreferred: true },
			]);

			const result = await lsp_code_actions.execute("tc-1", BASE_PARAMS, undefined, undefined, {} as never);

			expect(result.content[0]?.type).toBe("text");
			const text = (result.content[0] as { type: "text"; text: string }).text;
			expect(text).toContain("[0] Extract variable (refactor.extract) ★");

			const details = result.details as LspCodeActionsDetails;
			expect(details.filePath).toBe(BASE_PARAMS.filePath);
			expect(details.line).toBe(10);
			expect(details.character).toBe(5);
			expect(details.actions).toHaveLength(1);
			expect(details.actions[0]).toEqual({
				title: "Extract variable",
				kind: "refactor.extract",
				isPreferred: true,
			});
			expect(details.applied).toBeNull();
		});

		it("#then formats Command-style actions with command title", async () => {
			mockedWithLspClient.mockResolvedValueOnce([
				{ title: "Run command", command: { title: "run", command: "doThing" } },
			]);

			const result = await lsp_code_actions.execute("tc-2", BASE_PARAMS, undefined, undefined, {} as never);

			expect(result.content[0]?.type).toBe("text");
			const text = (result.content[0] as { type: "text"; text: string }).text;
			expect(text).toContain("[0] Run command (command: run)");
		});

		it("#then formats multiple actions on separate lines", async () => {
			mockedWithLspClient.mockResolvedValueOnce([
				{ title: "Extract variable", kind: "refactor.extract", isPreferred: true },
				{ title: "Run command", command: { title: "run" } },
			]);

			const result = await lsp_code_actions.execute("tc-3", BASE_PARAMS, undefined, undefined, {} as never);

			expect(result.content[0]?.type).toBe("text");
			const text = (result.content[0] as { type: "text"; text: string }).text;
			expect(text).toContain("[0] Extract variable (refactor.extract) ★");
			expect(text).toContain("[1] Run command (command: run)");
		});
	});

	// ── Execute — applyIndex ───────────────────────────────────────────

	describe("#given code actions with applyIndex #when executing", () => {
		it("#then resolves and applies the selected action", async () => {
			// First call: codeActions list
			mockedWithLspClient.mockResolvedValueOnce([
				{ title: "Extract variable", kind: "refactor.extract", edit: {} },
				{ title: "Inline variable", kind: "refactor.inline" },
			]);
			// Second call: codeActionResolve
			mockedWithLspClient.mockResolvedValueOnce({
				title: "Extract variable",
				kind: "refactor.extract",
				edit: { documentChanges: [{ textDocument: { uri: "file:///fake/file.rb" }, edits: [] }] },
			});

			const result = await lsp_code_actions.execute(
				"tc-4",
				{ ...BASE_PARAMS, applyIndex: 0 },
				undefined,
				undefined,
				{} as never,
			);

			expect(result.content[0]?.type).toBe("text");
			const text = (result.content[0] as { type: "text"; text: string }).text;
			expect(text).toContain("Applied 2 edits to 1 file(s)");

			const details = result.details as LspCodeActionsDetails;
			expect(details.applied).not.toBeNull();
			expect(details.applied?.success).toBe(true);
		});

		it("#then does not apply when applyIndex targets a Command (not a CodeAction)", async () => {
			mockedWithLspClient.mockResolvedValueOnce([{ title: "Run command", command: { title: "run" } }]);

			const result = await lsp_code_actions.execute(
				"tc-5",
				{ ...BASE_PARAMS, applyIndex: 0 },
				undefined,
				undefined,
				{} as never,
			);

			const details = result.details as LspCodeActionsDetails;
			// Commands don't have "kind", so the tool skips apply for them
			expect(details.applied).toBeNull();
		});
	});

	// ── Execute — null/empty result ────────────────────────────────────

	describe("#given null response #when executing", () => {
		it("#then returns no code actions available message", async () => {
			mockedWithLspClient.mockResolvedValueOnce(null);

			const result = await lsp_code_actions.execute("tc-6", BASE_PARAMS, undefined, undefined, {} as never);

			expect(result.content).toEqual([{ type: "text", text: "No code actions available" }]);
			const details = result.details as LspCodeActionsDetails;
			expect(details.actions).toEqual([]);
			expect(details.applied).toBeNull();
		});
	});

	describe("#given empty array #when executing", () => {
		it("#then returns no code actions available message", async () => {
			mockedWithLspClient.mockResolvedValueOnce([]);

			const result = await lsp_code_actions.execute("tc-7", BASE_PARAMS, undefined, undefined, {} as never);

			expect(result.content).toEqual([{ type: "text", text: "No code actions available" }]);
			const details = result.details as LspCodeActionsDetails;
			expect(details.actions).toEqual([]);
			expect(details.applied).toBeNull();
		});
	});

	// ── Execute — missing dependency error ─────────────────────────────

	describe("#given missing dependency error #when executing", () => {
		it("#then returns error message with missing_dependency errorKind", async () => {
			mockedWithLspClient.mockRejectedValueOnce(new Error("LSP server 'ruby-lsp' is configured but NOT INSTALLED."));

			const result = await lsp_code_actions.execute("tc-8", BASE_PARAMS, undefined, undefined, {} as never);

			expect(result.content[0]?.type).toBe("text");
			const text = (result.content[0] as { type: "text"; text: string }).text;
			expect(text).toContain("NOT INSTALLED");
			const details = result.details as LspCodeActionsDetails;
			expect(details.error).toContain("NOT INSTALLED");
			expect(details.errorKind).toBe("missing_dependency");
			expect(details.actions).toEqual([]);
			expect(details.applied).toBeNull();
		});
	});

	// ── Execute — unexpected error ─────────────────────────────────────

	describe("#given unexpected error #when executing", () => {
		it("#then rethrows the error", async () => {
			mockedWithLspClient.mockRejectedValueOnce(new Error("connection refused"));

			await expect(lsp_code_actions.execute("tc-9", BASE_PARAMS, undefined, undefined, {} as never)).rejects.toThrow(
				"connection refused",
			);
		});
	});

	// ── Execute — range parameters ─────────────────────────────────────

	describe("#given range parameters #when executing", () => {
		it("#then passes range to withLspClient", async () => {
			mockedWithLspClient.mockResolvedValueOnce([]);

			await lsp_code_actions.execute(
				"tc-10",
				{ ...BASE_PARAMS, endLine: 15, endCharacter: 20 },
				undefined,
				undefined,
				{} as never,
			);

			// Verify withLspClient was called (the range gets passed to client.codeActions)
			expect(mockedWithLspClient).toHaveBeenCalledOnce();
		});
	});
});
