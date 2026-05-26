import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LspDiscoverTestsDetails } from "../../src/lsp/tools/discover-tests.js";
import { lsp_discover_tests } from "../../src/lsp/tools/discover-tests.js";

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

describe("lsp_discover_tests", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── Metadata ──────────────────────────────────────────────────────────

	describe("#given discover tests tool #when inspecting metadata", () => {
		it("#then exposes expected name, label, and description", () => {
			expect(lsp_discover_tests.name).toBe("lsp_discover_tests");
			expect(lsp_discover_tests.label).toBe("LSP Discover Tests (RubyLSP)");
			expect(lsp_discover_tests.description).toContain("test");
		});

		it("#then has no executionMode", () => {
			expect(lsp_discover_tests.executionMode).toBeUndefined();
		});

		it("#then requires filePath", () => {
			const params = lsp_discover_tests.parameters;
			expect(params.type).toBe("object");
			expect(params.properties).toHaveProperty("filePath");
			expect(params.properties.filePath.type).toBe("string");
		});

		it("#then has optional resolveCommands parameter", () => {
			const props = lsp_discover_tests.parameters.properties;
			expect(props).toHaveProperty("resolveCommands");
		});
	});

	// ── Execute — successful test discovery ───────────────────────────────

	describe("#given discover tests #when execute returns tests", () => {
		const sampleTests = [
			{
				id: "test_1",
				label: "TestFoo",
				uri: "file:///test.rb",
				type: "class",
				children: [
					{
						id: "test_m1",
						label: "test_method",
						uri: "file:///test.rb",
						type: "method",
						children: [],
					},
				],
			},
		];

		it("#then returns test hierarchy with formatted output", async () => {
			mockWithLspClient.mockResolvedValueOnce(sampleTests);

			const result = await lsp_discover_tests.execute(
				"call-1",
				{ filePath: "/test.rb" },
				undefined as never,
				() => {},
				undefined as never,
			);

			const details = result.details as LspDiscoverTestsDetails;
			expect(details.filePath).toBe("/test.rb");
			expect(details.tests).toHaveLength(1);
			expect(details.tests[0]?.label).toBe("TestFoo");
			expect(details.tests[0]?.children).toHaveLength(1);
			expect(details.tests[0]?.children[0]?.label).toBe("test_method");
			expect(details.commands).toBeNull();

			// Text output should contain both parent and child
			const text = getContentText(result) as string;
			expect(text).toContain("TestFoo");
			expect(text).toContain("test_method");
		});

		it("#then resolves commands when resolveCommands is true", async () => {
			// First call: discoverTests
			mockWithLspClient.mockResolvedValueOnce(sampleTests);
			// Second call: resolveTestCommands
			mockWithLspClient.mockResolvedValueOnce({
				commands: ["bundle exec ruby test.rb"],
			});

			const result = await lsp_discover_tests.execute(
				"call-2",
				{ filePath: "/test.rb", resolveCommands: true },
				undefined as never,
				() => {},
				undefined as never,
			);

			const details = result.details as LspDiscoverTestsDetails;
			expect(details.commands).toEqual(["bundle exec ruby test.rb"]);

			const text = getContentText(result) as string;
			expect(text).toContain("Commands:");
			expect(text).toContain("bundle exec ruby test.rb");

			// Two calls: discover + resolve
			expect(mockWithLspClient).toHaveBeenCalledTimes(2);
		});

		it("#then skips command resolution when resolveCommands is false", async () => {
			mockWithLspClient.mockResolvedValueOnce(sampleTests);

			const result = await lsp_discover_tests.execute(
				"call-3",
				{ filePath: "/test.rb", resolveCommands: false },
				undefined as never,
				() => {},
				undefined as never,
			);

			const details = result.details as LspDiscoverTestsDetails;
			expect(details.commands).toBeNull();
			expect(mockWithLspClient).toHaveBeenCalledTimes(1);
		});

		it("#then skips command resolution when tests are empty even if resolveCommands is true", async () => {
			mockWithLspClient.mockResolvedValueOnce([]);

			const result = await lsp_discover_tests.execute(
				"call-4",
				{ filePath: "/test.rb", resolveCommands: true },
				undefined as never,
				() => {},
				undefined as never,
			);

			// Should only make one call (discoverTests), not two
			expect(mockWithLspClient).toHaveBeenCalledTimes(1);
			expect(getContentText(result)).toBe("No tests discovered");
		});
	});

	// ── Null / empty results ──────────────────────────────────────────────

	describe("#given discover tests #when execute returns null or empty", () => {
		it("#then returns 'No tests discovered' for null result", async () => {
			mockWithLspClient.mockResolvedValueOnce(null);

			const result = await lsp_discover_tests.execute(
				"call-5",
				{ filePath: "/test.rb" },
				undefined as never,
				() => {},
				undefined as never,
			);

			expect(getContentText(result)).toBe("No tests discovered");
			const details = result.details as LspDiscoverTestsDetails;
			expect(details.tests).toEqual([]);
			expect(details.commands).toBeNull();
		});

		it("#then returns 'No tests discovered' for empty array", async () => {
			mockWithLspClient.mockResolvedValueOnce([]);

			const result = await lsp_discover_tests.execute(
				"call-6",
				{ filePath: "/test.rb" },
				undefined as never,
				() => {},
				undefined as never,
			);

			expect(getContentText(result)).toBe("No tests discovered");
		});
	});

	// ── Error handling ────────────────────────────────────────────────────

	describe("#given discover tests #when execute encounters errors", () => {
		it("#then handles missing dependency error", async () => {
			mockWithLspClient.mockRejectedValueOnce(new Error("LSP server 'ruby-lsp' is configured but NOT INSTALLED."));

			const result = await lsp_discover_tests.execute(
				"call-7",
				{ filePath: "/test.rb" },
				undefined as never,
				() => {},
				undefined as never,
			);

			const details = result.details as LspDiscoverTestsDetails;
			expect(details.error).toContain("NOT INSTALLED");
			expect(details.errorKind).toBe("missing_dependency");
			expect(details.tests).toEqual([]);
			expect(details.commands).toBeNull();
			expect(getContentText(result)).toContain("NOT INSTALLED");
		});

		it("#then re-throws non-dependency errors", async () => {
			mockWithLspClient.mockRejectedValueOnce(new Error("Unexpected server error"));

			await expect(
				lsp_discover_tests.execute(
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
