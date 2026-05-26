import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/lsp/client-wrapper.js", () => ({
	withLspClient: vi.fn(),
	findWorkspaceRoot: vi.fn().mockReturnValue("/fake/workspace"),
	isDirectoryPath: vi.fn().mockReturnValue(false),
	formatServerLookupError: vi.fn().mockReturnValue("lookup error"),
}));

import { withLspClient } from "../../src/lsp/client-wrapper.js";
import type { LspInlayHintsDetails } from "../../src/lsp/tools/inlay-hints.js";
import { lsp_inlay_hints } from "../../src/lsp/tools/inlay-hints.js";

const mockedWithLspClient = vi.mocked(withLspClient);


// biome-ignore lint/style/noNonNullAssertion: test assertions on known-non-null arrays
function getContentText(result: { content: Array<{ type: string; text: string }> }): string {
	return result.content[0].text;
}

const FAKE_HINTS = [
	{
		position: { line: 4, character: 10 },
		kind: 1,
		label: ": String",
		tooltip: "inferred type",
	},
];

describe("lsp_inlay_hints", () => {
	it("#given tool metadata #when inspecting definition #then exposes expected name, label, description, and executionMode", () => {
		expect(lsp_inlay_hints.name).toBe("lsp_inlay_hints");
		expect(lsp_inlay_hints.label).toBe("LSP Inlay Hints");
		expect(lsp_inlay_hints.description).toContain("inline hints");
		expect(lsp_inlay_hints.executionMode).toBeUndefined();
	});

	it("#given parameter schema #when inspecting #then requires filePath, startLine, endLine", () => {
		expect(lsp_inlay_hints.parameters.required).toEqual(["filePath", "startLine", "endLine"]);
		expect(lsp_inlay_hints.parameters.properties).toHaveProperty("filePath");
		expect(lsp_inlay_hints.parameters.properties).toHaveProperty("startLine");
		expect(lsp_inlay_hints.parameters.properties).toHaveProperty("endLine");
		expect(lsp_inlay_hints.parameters.properties.filePath.type).toBe("string");
		expect(lsp_inlay_hints.parameters.properties.startLine.type).toBe("number");
		expect(lsp_inlay_hints.parameters.properties.endLine.type).toBe("number");
	});

	it("#given withLspClient returning hints #when executing #then returns formatted hints and details", async () => {
		mockedWithLspClient.mockResolvedValueOnce(FAKE_HINTS);

		const result = await lsp_inlay_hints.execute(
			"call-1",
			{ filePath: "/fake/file.rb", startLine: 1, endLine: 10 },
			undefined,
			() => {},
			undefined as never,
		);

		expect(result.content).toEqual([{ type: "text", text: "5:10 [Type] : String — inferred type" }]);
		expect(result.details as LspInlayHintsDetails).toEqual({
			filePath: "/fake/file.rb",
			startLine: 1,
			endLine: 10,
			hints: FAKE_HINTS,
			totalHints: 1,
		});
	});

	it("#given withLspClient returning null #when executing #then returns no inlay hints message", async () => {
		mockedWithLspClient.mockResolvedValueOnce(null);

		const result = await lsp_inlay_hints.execute(
			"call-2",
			{ filePath: "/fake/file.rb", startLine: 1, endLine: 10 },
			undefined,
			() => {},
			undefined as never,
		);

		expect(result.content).toEqual([{ type: "text", text: "No inlay hints found" }]);
		expect(result.details as LspInlayHintsDetails).toEqual({
			filePath: "/fake/file.rb",
			startLine: 1,
			endLine: 10,
			hints: [],
			totalHints: 0,
		});
	});

	it("#given withLspClient returning empty array #when executing #then returns no inlay hints message", async () => {
		mockedWithLspClient.mockResolvedValueOnce([]);

		const result = await lsp_inlay_hints.execute(
			"call-3",
			{ filePath: "/fake/file.rb", startLine: 5, endLine: 20 },
			undefined,
			() => {},
			undefined as never,
		);

		expect(result.content).toEqual([{ type: "text", text: "No inlay hints found" }]);
		expect((result.details as LspInlayHintsDetails).totalHints).toBe(0);
	});

	it("#given withLspClient throws NOT INSTALLED error #when executing #then returns missing dependency details", async () => {
		mockedWithLspClient.mockRejectedValueOnce(new Error("ruby-lsp is NOT INSTALLED"));

		const result = await lsp_inlay_hints.execute(
			"call-4",
			{ filePath: "/fake/file.rb", startLine: 1, endLine: 10 },
			undefined,
			() => {},
			undefined as never,
		);

		expect(result.content[0]).toHaveProperty("type", "text");
		expect(getContentText(result)).toContain("NOT INSTALLED");
		expect(result.details as LspInlayHintsDetails).toMatchObject({
			filePath: "/fake/file.rb",
			startLine: 1,
			endLine: 10,
			hints: [],
			totalHints: 0,
			errorKind: "missing_dependency",
		});
	});

	it("#given withLspClient throws No LSP server configured error #when executing #then returns missing dependency details", async () => {
		mockedWithLspClient.mockRejectedValueOnce(new Error("No LSP server configured for .rb"));

		const result = await lsp_inlay_hints.execute(
			"call-5",
			{ filePath: "/fake/file.rb", startLine: 1, endLine: 10 },
			undefined,
			() => {},
			undefined as never,
		);

		expect(result.content[0]).toHaveProperty("type", "text");
		expect(getContentText(result)).toContain("No LSP server configured");
		expect(result.details as LspInlayHintsDetails).toMatchObject({
			errorKind: "missing_dependency",
		});
	});

	it("#given withLspClient throws generic error #when executing #then rethrows", async () => {
		mockedWithLspClient.mockRejectedValueOnce(new Error("transport closed"));

		await expect(
			lsp_inlay_hints.execute(
				"call-6",
				{ filePath: "/fake/file.rb", startLine: 1, endLine: 10 },
				undefined,
				() => {},
				undefined as never,
			),
		).rejects.toThrow("transport closed");
	});
});
