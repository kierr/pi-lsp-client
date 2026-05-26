import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LspTypeHierarchyDetails } from "../../src/lsp/tools/type-hierarchy.js";
import { lsp_type_hierarchy } from "../../src/lsp/tools/type-hierarchy.js";

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

describe("lsp_type_hierarchy", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── Metadata ──────────────────────────────────────────────────────────

	describe("#given type hierarchy tool #when inspecting metadata", () => {
		it("#then exposes expected name, label, and description", () => {
			expect(lsp_type_hierarchy.name).toBe("lsp_type_hierarchy");
			expect(lsp_type_hierarchy.label).toBe("LSP Type Hierarchy (Experimental)");
			expect(lsp_type_hierarchy.description).toContain("ancestor");
		});

		it("#then has no executionMode", () => {
			expect(lsp_type_hierarchy.executionMode).toBeUndefined();
		});

		it("#then requires filePath, line, and character", () => {
			const params = lsp_type_hierarchy.parameters;
			expect(params.required).toEqual(["filePath", "line", "character"]);
		});

		it("#then has optional depth parameter", () => {
			const params = lsp_type_hierarchy.parameters;
			expect(params.properties).toHaveProperty("depth");
		});

		it("#then filePath is a string, line and character are numbers", () => {
			const props = lsp_type_hierarchy.parameters.properties;
			expect(props.filePath.type).toBe("string");
			expect(props.line.type).toBe("number");
			expect(props.character.type).toBe("number");
		});
	});

	// ── Execute — successful hierarchy walk ───────────────────────────────

	describe("#given type hierarchy #when execute returns prepared items and supertypes", () => {
		it("#then makes multiple withLspClient calls and accumulates ancestors", async () => {
			// First call: prepareTypeHierarchy returns initial items
			mockWithLspClient.mockResolvedValueOnce([{ name: "MyClass", kind: 5, uri: "file:///test.rb" }]);
			// Second call: typeHierarchySupertypes for the prepared item
			mockWithLspClient.mockResolvedValueOnce([{ name: "Object", kind: 5, uri: "file:///object.rb" }]);
			// Third call: typeHierarchySupertypes for Object (returns null/empty to stop)
			mockWithLspClient.mockResolvedValueOnce(null);

			const result = await lsp_type_hierarchy.execute(
				"call-1",
				{ filePath: "/test.rb", line: 5, character: 3, depth: 2 },
				undefined as never,
				() => {},
				undefined as never,
			);

			const details = result.details as LspTypeHierarchyDetails;
			expect(details.filePath).toBe("/test.rb");
			expect(details.line).toBe(5);
			expect(details.character).toBe(3);
			expect(details.depth).toBe(2);

			// Should contain both the prepared item and its supertype
			expect(details.items.length).toBeGreaterThanOrEqual(2);
			expect(details.items[0]?.name).toBe("MyClass");
			expect(details.items.some((i) => i.name === "Object")).toBe(true);

			// Text output should contain both names
			const text = getContentText(result);
			expect(text).toContain("MyClass");
			expect(text).toContain("Object");

			// Should have made 3 calls: prepare + supertypes for MyClass + supertypes for Object
			expect(mockWithLspClient).toHaveBeenCalledTimes(3);
		});

		it("#then uses default depth of 5 when not specified", async () => {
			mockWithLspClient.mockResolvedValueOnce([{ name: "MyClass", kind: 5, uri: "file:///test.rb" }]);
			mockWithLspClient.mockResolvedValueOnce(null);

			const result = await lsp_type_hierarchy.execute(
				"call-2",
				{ filePath: "/test.rb", line: 1, character: 0 },
				undefined as never,
				() => {},
				undefined as never,
			);

			const details = result.details as LspTypeHierarchyDetails;
			expect(details.depth).toBe(5);
		});
	});

	// ── Null / empty results ──────────────────────────────────────────────

	describe("#given type hierarchy #when execute returns no items", () => {
		it("#then returns 'No type hierarchy found' for null prepare result", async () => {
			mockWithLspClient.mockResolvedValueOnce(null);

			const result = await lsp_type_hierarchy.execute(
				"call-3",
				{ filePath: "/test.rb", line: 1, character: 0 },
				undefined as never,
				() => {},
				undefined as never,
			);

			expect(getContentText(result)).toBe(
				"No type hierarchy found at this position",
			);
			const details = result.details as LspTypeHierarchyDetails;
			expect(details.items).toEqual([]);
		});

		it("#then returns 'No type hierarchy found' for empty prepare result", async () => {
			mockWithLspClient.mockResolvedValueOnce([]);

			const result = await lsp_type_hierarchy.execute(
				"call-4",
				{ filePath: "/test.rb", line: 1, character: 0 },
				undefined as never,
				() => {},
				undefined as never,
			);

			expect(getContentText(result)).toBe(
				"No type hierarchy found at this position",
			);
			const details = result.details as LspTypeHierarchyDetails;
			expect(details.items).toEqual([]);
		});
	});

	// ── Error handling ────────────────────────────────────────────────────

	describe("#given type hierarchy #when execute encounters errors", () => {
		it("#then handles missing dependency error", async () => {
			mockWithLspClient.mockRejectedValueOnce(new Error("LSP server 'ruby-lsp' is configured but NOT INSTALLED."));

			const result = await lsp_type_hierarchy.execute(
				"call-5",
				{ filePath: "/test.rb", line: 1, character: 0 },
				undefined as never,
				() => {},
				undefined as never,
			);

			const details = result.details as LspTypeHierarchyDetails;
			expect(details.error).toContain("NOT INSTALLED");
			expect(details.errorKind).toBe("missing_dependency");
			expect(getContentText(result)).toContain("NOT INSTALLED");
		});

		it("#then re-throws non-dependency errors", async () => {
			mockWithLspClient.mockRejectedValueOnce(new Error("Unexpected server error"));

			await expect(
				lsp_type_hierarchy.execute(
					"call-6",
					{ filePath: "/test.rb", line: 1, character: 0 },
					undefined as never,
					() => {},
					undefined as never,
				),
			).rejects.toThrow("Unexpected server error");
		});

		it("#then tolerates errors during supertype resolution (best-effort)", async () => {
			// prepare succeeds
			mockWithLspClient.mockResolvedValueOnce([{ name: "MyClass", kind: 5, uri: "file:///test.rb" }]);
			// supertypes call throws — should be caught, not propagated
			mockWithLspClient.mockRejectedValueOnce(new Error("supertype lookup failed"));

			// Should not throw — the tool catches errors in the supertype loop
			const result = await lsp_type_hierarchy.execute(
				"call-7",
				{ filePath: "/test.rb", line: 1, character: 0, depth: 1 },
				undefined as never,
				() => {},
				undefined as never,
			);

			const details = result.details as LspTypeHierarchyDetails;
			// Should still have the prepared items
			expect(details.items).toHaveLength(1);
			expect(details.items[0]?.name).toBe("MyClass");
		});
	});
});
