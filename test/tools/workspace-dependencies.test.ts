import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LspWorkspaceDependenciesDetails } from "../../src/lsp/tools/workspace-dependencies.js";
import { lsp_workspace_dependencies } from "../../src/lsp/tools/workspace-dependencies.js";

vi.mock("../../src/lsp/client-wrapper.js", () => ({
	withLspClient: vi.fn(),
	findWorkspaceRoot: vi.fn().mockReturnValue("/fake/workspace"),
	isDirectoryPath: vi.fn().mockReturnValue(false),
	formatServerLookupError: vi.fn().mockReturnValue("lookup error"),
}));

import { withLspClient } from "../../src/lsp/client-wrapper.js";

const mockWithLspClient = vi.mocked(withLspClient);


// biome-ignore lint/style/noNonNullAssertion: test assertions on known-non-null arrays
function getContentText(result: { content: Array<{ type: string; text: string }> }): string {
	return result.content[0].text;
}

describe("lsp_workspace_dependencies", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── Metadata ──────────────────────────────────────────────────────────

	describe("#given workspace dependencies tool #when inspecting metadata", () => {
		it("#then exposes expected name, label, and description", () => {
			expect(lsp_workspace_dependencies.name).toBe("lsp_workspace_dependencies");
			expect(lsp_workspace_dependencies.label).toBe("LSP Workspace Dependencies (RubyLSP)");
			expect(lsp_workspace_dependencies.description).toContain("dependencies");
		});

		it("#then has no executionMode", () => {
			expect(lsp_workspace_dependencies.executionMode).toBeUndefined();
		});

		it("#then has filePath as a string parameter", () => {
			const params = lsp_workspace_dependencies.parameters;
			expect(params.type).toBe("object");
			expect(params.properties).toHaveProperty("filePath");
			expect(params.properties.filePath.type).toBe("string");
		});
	});

	// ── Execute — successful dependency listing ───────────────────────────

	describe("#given workspace dependencies #when execute returns dependencies", () => {
		it("#then formats and returns all dependencies", async () => {
			mockWithLspClient.mockResolvedValueOnce([
				{ name: "rails", version: "7.1.0", source: "gem", isGemspec: false },
				{ name: "my_gem", version: "0.1.0", isGemspec: true },
			]);

			const result = await lsp_workspace_dependencies.execute(
				"call-1",
				{ filePath: "/test.rb" },
				undefined as never,
				() => {},
				undefined as never,
			);

			const details = result.details as LspWorkspaceDependenciesDetails;
			expect(details.dependencies).toHaveLength(2);
			expect(details.total).toBe(2);

			// Verify dependency data preserved
			expect(details.dependencies[0]?.name).toBe("rails");
			expect(details.dependencies[0]?.version).toBe("7.1.0");
			expect(details.dependencies[1]?.name).toBe("my_gem");
			expect(details.dependencies[1]?.isGemspec).toBe(true);

			// Verify text formatting
			const text = getContentText(result) as string;
			expect(text).toContain("rails 7.1.0 (gem)");
			expect(text).toContain("my_gem 0.1.0 [gemspec]");
		});

		it("#then formats dependencies without source", async () => {
			mockWithLspClient.mockResolvedValueOnce([{ name: "simple", version: "1.0.0", isGemspec: false }]);

			const result = await lsp_workspace_dependencies.execute(
				"call-2",
				{ filePath: "/test.rb" },
				undefined as never,
				() => {},
				undefined as never,
			);

			const text = getContentText(result) as string;
			expect(text).toBe("simple 1.0.0");
		});
	});

	// ── Null / empty results ──────────────────────────────────────────────

	describe("#given workspace dependencies #when execute returns null or empty", () => {
		it("#then returns 'No dependencies found' for null result", async () => {
			mockWithLspClient.mockResolvedValueOnce(null);

			const result = await lsp_workspace_dependencies.execute(
				"call-3",
				{ filePath: "/test.rb" },
				undefined as never,
				() => {},
				undefined as never,
			);

			expect(getContentText(result)).toBe("No dependencies found");
			const details = result.details as LspWorkspaceDependenciesDetails;
			expect(details.dependencies).toEqual([]);
			expect(details.total).toBe(0);
		});

		it("#then returns 'No dependencies found' for empty array", async () => {
			mockWithLspClient.mockResolvedValueOnce([]);

			const result = await lsp_workspace_dependencies.execute(
				"call-4",
				{ filePath: "/test.rb" },
				undefined as never,
				() => {},
				undefined as never,
			);

			expect(getContentText(result)).toBe("No dependencies found");
			const details = result.details as LspWorkspaceDependenciesDetails;
			expect(details.total).toBe(0);
		});
	});

	// ── Error handling ────────────────────────────────────────────────────

	describe("#given workspace dependencies #when execute encounters errors", () => {
		it("#then handles missing dependency error", async () => {
			mockWithLspClient.mockRejectedValueOnce(new Error("LSP server 'ruby-lsp' is configured but NOT INSTALLED."));

			const result = await lsp_workspace_dependencies.execute(
				"call-5",
				{ filePath: "/test.rb" },
				undefined as never,
				() => {},
				undefined as never,
			);

			const details = result.details as LspWorkspaceDependenciesDetails;
			expect(details.error).toContain("NOT INSTALLED");
			expect(details.errorKind).toBe("missing_dependency");
			expect(details.dependencies).toEqual([]);
			expect(details.total).toBe(0);
			expect(getContentText(result)).toContain("NOT INSTALLED");
		});

		it("#then re-throws non-dependency errors", async () => {
			mockWithLspClient.mockRejectedValueOnce(new Error("Unexpected server error"));

			await expect(
				lsp_workspace_dependencies.execute(
					"call-6",
					{ filePath: "/test.rb" },
					undefined as never,
					() => {},
					undefined as never,
				),
			).rejects.toThrow("Unexpected server error");
		});
	});
});
