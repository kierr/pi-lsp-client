import { describe, expect, it, vi } from "vitest";

import { withLspClient } from "../../src/lsp/client-wrapper.js";
import type { LspSignatureHelpDetails } from "../../src/lsp/tools/signature-help.js";
import { lsp_signature_help } from "../../src/lsp/tools/signature-help.js";

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

describe("lsp_signature_help tool", () => {
	// ── Metadata ───────────────────────────────────────────────────────

	describe("#given signature help tool definition #when inspecting metadata", () => {
		it("#then exposes expected name and label", () => {
			expect(lsp_signature_help.name).toBe("lsp_signature_help");
			expect(lsp_signature_help.label).toBe("LSP Signature Help");
		});

		it("#then has a description mentioning signature or parameter hints", () => {
			expect(lsp_signature_help.description).toContain("signature");
		});

		it("#then requires filePath, line, and character", () => {
			expect(lsp_signature_help.parameters.required).toEqual(["filePath", "line", "character"]);
			expect(lsp_signature_help.parameters.properties).toHaveProperty("filePath");
			expect(lsp_signature_help.parameters.properties).toHaveProperty("line");
			expect(lsp_signature_help.parameters.properties).toHaveProperty("character");
		});

		it("#then has no executionMode (read-only)", () => {
			expect(lsp_signature_help.executionMode).toBeUndefined();
		});
	});

	// ── Execute — successful signature help ────────────────────────────

	describe("#given successful signature help result #when executing", () => {
		it("#then returns active signature with parameter highlighting", async () => {
			mockedWithLspClient.mockResolvedValueOnce({
				signatures: [
					{
						label: "def foo(a, b)",
						parameters: [{ label: "a" }, { label: "b" }],
					},
				],
				activeSignature: 0,
				activeParameter: 1,
			});

			const result = await lsp_signature_help.execute("tc-1", BASE_PARAMS, undefined, undefined, {} as never);

			const text = (result.content[0] as { type: "text"; text: string }).text;
			expect(text).toContain("Active signature:");
			expect(text).toContain("def foo(a, b)");
			// Active parameter (index 1 = "b") should be highlighted with guillemets
			expect(text).toContain("»b«");
			// Inactive parameter "a" should appear plain
			expect(text).toContain("a,");

			const details = result.details as LspSignatureHelpDetails;
			expect(details.filePath).toBe(BASE_PARAMS.filePath);
			expect(details.line).toBe(10);
			expect(details.character).toBe(5);
			expect(details.signatures).toHaveLength(1);
			expect(details.activeSignature).toBe(0);
			expect(details.activeParameter).toBe(1);
		});

		it("#then lists other signatures when multiple are present", async () => {
			mockedWithLspClient.mockResolvedValueOnce({
				signatures: [
					{
						label: "def foo(a)",
						parameters: [{ label: "a" }],
					},
					{
						label: "def foo(a, b)",
						parameters: [{ label: "a" }, { label: "b" }],
					},
					{
						label: "def foo(a, b, c)",
						parameters: [{ label: "a" }, { label: "b" }, { label: "c" }],
					},
				],
				activeSignature: 0,
				activeParameter: 0,
			});

			const result = await lsp_signature_help.execute("tc-2", BASE_PARAMS, undefined, undefined, {} as never);

			const text = (result.content[0] as { type: "text"; text: string }).text;
			expect(text).toContain("Other signatures (2):");
			expect(text).toContain("def foo(a, b)");
			expect(text).toContain("def foo(a, b, c)");

			const details = result.details as LspSignatureHelpDetails;
			expect(details.signatures).toHaveLength(3);
		});

		it("#then handles signature with documentation", async () => {
			mockedWithLspClient.mockResolvedValueOnce({
				signatures: [
					{
						label: "def bar(x)",
						parameters: [{ label: "x" }],
						documentation: "Does something useful",
					},
				],
				activeSignature: 0,
				activeParameter: null,
			});

			const result = await lsp_signature_help.execute("tc-3", BASE_PARAMS, undefined, undefined, {} as never);

			const text = (result.content[0] as { type: "text"; text: string }).text;
			expect(text).toContain("Does something useful");
		});

		it("#then handles MarkupContent documentation", async () => {
			mockedWithLspClient.mockResolvedValueOnce({
				signatures: [
					{
						label: "def baz(y)",
						parameters: [{ label: "y" }],
						documentation: { kind: "markdown", value: "**bold docs**" },
					},
				],
				activeSignature: 0,
				activeParameter: null,
			});

			const result = await lsp_signature_help.execute("tc-4", BASE_PARAMS, undefined, undefined, {} as never);

			const text = (result.content[0] as { type: "text"; text: string }).text;
			expect(text).toContain("**bold docs**");
		});
	});

	// ── Execute — null result ──────────────────────────────────────────

	describe("#given null signature help result #when executing", () => {
		it("#then returns no signature help message with empty details", async () => {
			mockedWithLspClient.mockResolvedValueOnce(null);

			const result = await lsp_signature_help.execute("tc-5", BASE_PARAMS, undefined, undefined, {} as never);

			expect(result.content).toEqual([{ type: "text", text: "No signature help available" }]);
			const details = result.details as LspSignatureHelpDetails;
			expect(details.signatures).toEqual([]);
			expect(details.activeSignature).toBeNull();
			expect(details.activeParameter).toBeNull();
		});
	});

	// ── Execute — empty signatures ─────────────────────────────────────

	describe("#given empty signatures array #when executing", () => {
		it("#then returns no signature help message", async () => {
			mockedWithLspClient.mockResolvedValueOnce({
				signatures: [],
				activeSignature: null,
				activeParameter: null,
			});

			const result = await lsp_signature_help.execute("tc-6", BASE_PARAMS, undefined, undefined, {} as never);

			expect(result.content).toEqual([{ type: "text", text: "No signature help available" }]);
			const details = result.details as LspSignatureHelpDetails;
			expect(details.signatures).toEqual([]);
		});
	});

	// ── Execute — missing dependency error ─────────────────────────────

	describe("#given missing dependency error #when executing", () => {
		it("#then returns error message with missing_dependency errorKind", async () => {
			mockedWithLspClient.mockRejectedValueOnce(new Error("LSP server 'ruby-lsp' is configured but NOT INSTALLED."));

			const result = await lsp_signature_help.execute("tc-7", BASE_PARAMS, undefined, undefined, {} as never);

			const text = (result.content[0] as { type: "text"; text: string }).text;
			expect(text).toContain("NOT INSTALLED");
			const details = result.details as LspSignatureHelpDetails;
			expect(details.error).toContain("NOT INSTALLED");
			expect(details.errorKind).toBe("missing_dependency");
		});
	});

	// ── Execute — unexpected error ─────────────────────────────────────

	describe("#given unexpected error #when executing", () => {
		it("#then rethrows the error", async () => {
			mockedWithLspClient.mockRejectedValueOnce(new Error("timeout exceeded"));

			await expect(
				lsp_signature_help.execute("tc-8", BASE_PARAMS, undefined, undefined, {} as never),
			).rejects.toThrow("timeout exceeded");
		});
	});
});
