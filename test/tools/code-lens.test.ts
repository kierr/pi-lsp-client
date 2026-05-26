import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/lsp/client-wrapper.js", () => ({
	withLspClient: vi.fn(),
	findWorkspaceRoot: vi.fn().mockReturnValue("/fake/workspace"),
	isDirectoryPath: vi.fn().mockReturnValue(false),
	formatServerLookupError: vi.fn().mockReturnValue("lookup error"),
}));

import { withLspClient } from "../../src/lsp/client-wrapper.js";
import type { LspCodeLensDetails } from "../../src/lsp/tools/code-lens.js";
import { lsp_code_lens } from "../../src/lsp/tools/code-lens.js";

const mockedWithLspClient = vi.mocked(withLspClient);


// biome-ignore lint/style/noNonNullAssertion: test assertions on known-non-null arrays
function getContentText(result: { content: Array<{ type: string; text: string }> }): string {
	return result.content[0].text;
}

const FAKE_LENSES = [
	{
		range: { start: { line: 5, character: 0 }, end: { line: 5, character: 20 } },
		command: { title: "Run Test", command: "runTest" },
	},
];

const RESOLVED_LENSES = [
	{
		range: { start: { line: 5, character: 0 }, end: { line: 5, character: 20 } },
		command: { title: "Run Test", command: "runTest", arguments: ["test_example"] },
	},
];

describe("lsp_code_lens", () => {
	it("#given tool metadata #when inspecting definition #then exposes expected name, label, description, and executionMode", () => {
		expect(lsp_code_lens.name).toBe("lsp_code_lens");
		expect(lsp_code_lens.label).toBe("LSP Code Lens");
		expect(lsp_code_lens.description).toContain("code lens");
		expect(lsp_code_lens.executionMode).toBeUndefined();
	});

	it("#given parameter schema #when inspecting #then requires filePath with optional resolve", () => {
		expect(lsp_code_lens.parameters.required).toEqual(["filePath"]);
		expect(lsp_code_lens.parameters.properties).toHaveProperty("filePath");
		expect(lsp_code_lens.parameters.properties).toHaveProperty("resolve");
		expect(lsp_code_lens.parameters.properties.resolve.type).toBe("boolean");
	});

	it("#given withLspClient returning lenses #when executing without resolve #then returns formatted lenses", async () => {
		mockedWithLspClient.mockResolvedValueOnce(FAKE_LENSES);

		const result = await lsp_code_lens.execute(
			"call-1",
			{ filePath: "/fake/test.rb" },
			undefined,
			() => {},
			undefined as never,
		);

		expect(result.content).toEqual([{ type: "text", text: "L6:0 Run Test" }]);
		expect(result.details as LspCodeLensDetails).toEqual({
			filePath: "/fake/test.rb",
			lenses: FAKE_LENSES,
			resolved: 0,
		});
	});

	it("#given withLspClient returning lenses #when executing with resolve=true #then resolves lenses and returns details", async () => {
		// First call: fetch code lenses
		mockedWithLspClient.mockResolvedValueOnce(FAKE_LENSES);
		// Second call: resolve each lens — the callback iterates lenses and calls client.codeLensResolve
		mockedWithLspClient.mockImplementationOnce(
			// biome-ignore lint/suspicious/noExplicitAny: mock callback needs loose typing
			async (_filePath: any, fn: (client: any) => Promise<any>) => {
				const fakeClient = {
					codeLensResolve: vi.fn().mockResolvedValue(RESOLVED_LENSES[0]),
				};
				return fn(fakeClient);
			},
		);

		const result = await lsp_code_lens.execute(
			"call-2",
			{ filePath: "/fake/test.rb", resolve: true },
			undefined,
			() => {},
			undefined as never,
		);

		expect(result.content[0]).toHaveProperty("type", "text");
		expect(result.details as LspCodeLensDetails).toMatchObject({
			filePath: "/fake/test.rb",
			resolved: 1,
		});
		expect((result.details as LspCodeLensDetails).lenses).toHaveLength(1);
	});

	it("#given withLspClient returning null #when executing #then returns no code lenses message", async () => {
		mockedWithLspClient.mockResolvedValueOnce(null);

		const result = await lsp_code_lens.execute(
			"call-3",
			{ filePath: "/fake/test.rb" },
			undefined,
			() => {},
			undefined as never,
		);

		expect(result.content).toEqual([{ type: "text", text: "No code lenses found" }]);
		expect(result.details as LspCodeLensDetails).toEqual({
			filePath: "/fake/test.rb",
			lenses: [],
			resolved: 0,
		});
	});

	it("#given withLspClient returning empty array #when executing #then returns no code lenses message", async () => {
		mockedWithLspClient.mockResolvedValueOnce([]);

		const result = await lsp_code_lens.execute(
			"call-4",
			{ filePath: "/fake/test.rb" },
			undefined,
			() => {},
			undefined as never,
		);

		expect(result.content).toEqual([{ type: "text", text: "No code lenses found" }]);
	});

	it("#given withLspClient throws NOT INSTALLED error #when executing #then returns missing dependency details", async () => {
		mockedWithLspClient.mockRejectedValueOnce(new Error("ruby-lsp is NOT INSTALLED"));

		const result = await lsp_code_lens.execute(
			"call-5",
			{ filePath: "/fake/test.rb" },
			undefined,
			() => {},
			undefined as never,
		);

		expect(result.content[0]).toHaveProperty("type", "text");
		expect(getContentText(result)).toContain("NOT INSTALLED");
		expect(result.details as LspCodeLensDetails).toMatchObject({
			filePath: "/fake/test.rb",
			lenses: [],
			resolved: 0,
			errorKind: "missing_dependency",
		});
	});

	it("#given withLspClient throws generic error #when executing #then rethrows", async () => {
		mockedWithLspClient.mockRejectedValueOnce(new Error("server crashed"));

		await expect(
			lsp_code_lens.execute("call-6", { filePath: "/fake/test.rb" }, undefined, () => {}, undefined as never),
		).rejects.toThrow("server crashed");
	});
});
