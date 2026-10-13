import { describe, expect, it, vi } from "vitest";

import { withLspClient } from "../../src/lsp/client-wrapper.js";
import type { LspFindReferencesDetails } from "../../src/lsp/tools/find-references.js";
import { isDependencyReference, lsp_find_references } from "../../src/lsp/tools/find-references.js";

vi.mock("../../src/lsp/client-wrapper.js", () => {
	const withLspClient = vi.fn();
	return {
		withLspClient,
		withSemanticFallback: vi.fn((...args: unknown[]) => withLspClient(...args)),
		findWorkspaceRoot: vi.fn().mockReturnValue("/fake/workspace"),
		isDirectoryPath: vi.fn().mockReturnValue(false),
		formatServerLookupError: vi.fn().mockReturnValue("lookup error"),
	};
});

const mockedWithLspClient = vi.mocked(withLspClient);

const BASE_PARAMS = {
	filePath: "/fake/workspace/lib/foo.ts",
	line: 10,
	character: 5,
};

// given / when / then body comments per repo convention.

function loc(uri: string) {
	return { uri, range: { start: { line: 1, character: 2 }, end: { line: 1, character: 5 } } };
}

describe("isDependencyReference", () => {
	it("flags a node_modules path segment", () => {
		// given a resolved-import reference inside the dependency tree
		// when classifying it
		// then it is dependency noise
		expect(isDependencyReference(loc("file:///fake/workspace/node_modules/lodash/index.js"))).toBe(true);
	});

	it("flags a nested node_modules path segment", () => {
		// given a transitively nested dependency reference
		// when classifying it
		// then it is dependency noise
		expect(isDependencyReference(loc("file:///fake/workspace/node_modules/a/node_modules/b/index.js"))).toBe(true);
	});

	it("keeps a workspace path that merely contains the segment name", () => {
		// given a workspace file whose name contains the segment text without being the segment
		// when classifying it
		// then it is kept (segment match, not substring match)
		expect(isDependencyReference(loc("file:///fake/workspace/lib/my_node_modules_helper.ts"))).toBe(false);
	});

	it("keeps a plain workspace path", () => {
		// given an ordinary workspace reference
		// when classifying it
		// then it is kept
		expect(isDependencyReference(loc("file:///fake/workspace/lib/foo.ts"))).toBe(false);
	});

	it("keeps a LocationLink by its targetUri", () => {
		// given a LocationLink whose target sits in the dependency tree
		// when classifying it
		// then the target URI decides
		expect(
			isDependencyReference({
				targetUri: "file:///fake/workspace/node_modules/x/index.d.ts",
				targetRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
				targetSelectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
				originSelectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
			}),
		).toBe(true);
	});

	it("keeps an unparseable URI", () => {
		// given a location whose URI cannot be parsed to a path
		// when classifying it
		// then it is kept: unclassifiable is not provably noise
		expect(isDependencyReference(loc("not a uri :::"))).toBe(false);
	});
});

describe("lsp_find_references tool", () => {
	describe("#given server response mixing workspace and node_modules hits #when executing", () => {
		it("#then excludes node_modules from text and details", async () => {
			mockedWithLspClient.mockResolvedValueOnce([
				loc("file:///fake/workspace/lib/foo.ts"),
				loc("file:///fake/workspace/node_modules/lodash/index.js"),
				loc("file:///fake/workspace/lib/bar.ts"),
			]);

			const result = await lsp_find_references.execute("tc-dep-1", BASE_PARAMS, undefined, undefined, {} as never);

			const text = (result.content[0] as { type: "text"; text: string }).text;
			expect(text).toContain("foo.ts");
			expect(text).toContain("bar.ts");
			expect(text).not.toContain("node_modules");
			const details = result.details as LspFindReferencesDetails;
			expect(details.totalReferences).toBe(2);
			expect(details.references).toHaveLength(2);
			expect(details.truncated).toBe(false);
		});
	});

	describe("#given server response with only node_modules hits #when executing", () => {
		it("#then reports no references found", async () => {
			mockedWithLspClient.mockResolvedValueOnce([loc("file:///fake/workspace/node_modules/lodash/index.js")]);

			const result = await lsp_find_references.execute("tc-dep-2", BASE_PARAMS, undefined, undefined, {} as never);

			expect(result.content).toEqual([{ type: "text", text: "No references found" }]);
			const details = result.details as LspFindReferencesDetails;
			expect(details.totalReferences).toBe(0);
			expect(details.references).toEqual([]);
		});
	});
});
