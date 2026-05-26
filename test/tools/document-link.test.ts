import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/lsp/client-wrapper.js", () => ({
	withLspClient: vi.fn(),
	findWorkspaceRoot: vi.fn().mockReturnValue("/fake/workspace"),
	isDirectoryPath: vi.fn().mockReturnValue(false),
	formatServerLookupError: vi.fn().mockReturnValue("lookup error"),
}));

import { withLspClient } from "../../src/lsp/client-wrapper.js";
import type { LspDocumentLinksDetails } from "../../src/lsp/tools/document-link.js";
import { lsp_document_links } from "../../src/lsp/tools/document-link.js";

const mockedWithLspClient = vi.mocked(withLspClient);


// biome-ignore lint/style/noNonNullAssertion: test assertions on known-non-null arrays
function getContentText(result: { content: Array<{ type: string; text: string }> }): string {
	return result.content[0].text;
}

const FAKE_LINKS = [
	{
		range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
		target: "file:///foo.rb",
		tooltip: "source",
	},
];

describe("lsp_document_links", () => {
	it("#given tool metadata #when inspecting definition #then exposes expected name, label, description, and executionMode", () => {
		expect(lsp_document_links.name).toBe("lsp_document_links");
		expect(lsp_document_links.label).toBe("LSP Document Links");
		expect(lsp_document_links.description).toContain("link");
		expect(lsp_document_links.executionMode).toBeUndefined();
	});

	it("#given parameter schema #when inspecting #then requires filePath and has no other required params", () => {
		expect(lsp_document_links.parameters.required).toEqual(["filePath"]);
		expect(lsp_document_links.parameters.properties).toHaveProperty("filePath");
		expect(lsp_document_links.parameters.properties.filePath.type).toBe("string");
	});

	it("#given withLspClient returning links #when executing #then returns formatted links and details", async () => {
		mockedWithLspClient.mockResolvedValueOnce(FAKE_LINKS);

		const result = await lsp_document_links.execute(
			"call-1",
			{ filePath: "/fake/file.rb" },
			undefined,
			() => {},
			undefined as never,
		);

		expect(result.content).toEqual([{ type: "text", text: "1:0 → file:///foo.rb — source" }]);
		expect(result.details as LspDocumentLinksDetails).toEqual({
			filePath: "/fake/file.rb",
			links: FAKE_LINKS,
			totalLinks: 1,
		});
	});

	it("#given withLspClient returning null #when executing #then returns no document links message", async () => {
		mockedWithLspClient.mockResolvedValueOnce(null);

		const result = await lsp_document_links.execute(
			"call-2",
			{ filePath: "/fake/empty.rb" },
			undefined,
			() => {},
			undefined as never,
		);

		expect(result.content).toEqual([{ type: "text", text: "No document links found" }]);
		expect(result.details as LspDocumentLinksDetails).toEqual({
			filePath: "/fake/empty.rb",
			links: [],
			totalLinks: 0,
		});
	});

	it("#given withLspClient returning empty array #when executing #then returns no document links message", async () => {
		mockedWithLspClient.mockResolvedValueOnce([]);

		const result = await lsp_document_links.execute(
			"call-3",
			{ filePath: "/fake/empty.rb" },
			undefined,
			() => {},
			undefined as never,
		);

		expect(result.content).toEqual([{ type: "text", text: "No document links found" }]);
		expect((result.details as LspDocumentLinksDetails).totalLinks).toBe(0);
	});

	it("#given withLspClient throws NOT INSTALLED error #when executing #then returns missing dependency details", async () => {
		mockedWithLspClient.mockRejectedValueOnce(new Error("ruby-lsp is NOT INSTALLED"));

		const result = await lsp_document_links.execute(
			"call-4",
			{ filePath: "/fake/file.rb" },
			undefined,
			() => {},
			undefined as never,
		);

		expect(result.content[0]).toHaveProperty("type", "text");
		expect(getContentText(result)).toContain("NOT INSTALLED");
		expect(result.details as LspDocumentLinksDetails).toMatchObject({
			filePath: "/fake/file.rb",
			links: [],
			totalLinks: 0,
			errorKind: "missing_dependency",
		});
	});

	it("#given withLspClient throws generic error #when executing #then rethrows", async () => {
		mockedWithLspClient.mockRejectedValueOnce(new Error("connection failed"));

		await expect(
			lsp_document_links.execute("call-5", { filePath: "/fake/file.rb" }, undefined, () => {}, undefined as never),
		).rejects.toThrow("connection failed");
	});
});
