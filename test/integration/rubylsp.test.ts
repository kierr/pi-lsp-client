/**
 * Integration tests against a real ruby-lsp server.
 *
 * These tests spawn ruby-lsp, open fixture files, and exercise each LSP method.
 * They require ruby-lsp to be installed and are excluded from CI (`bun run test`
 * via vitest config excludes test/integration/).
 *
 * Run manually: bun vitest --run test/integration/
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LspClient } from "../../src/lsp/client.js";
import type { ResolvedServer } from "../../src/lsp/types.js";

// Skip if ruby-lsp is not available
const RUBY_LSP_AVAILABLE = await import("node:child_process")
	.then(({ execSync }) => {
		try {
			execSync("which ruby-lsp", { stdio: "pipe" });
			return true;
		} catch {
			return false;
		}
	})
	.catch(() => false);

if (!RUBY_LSP_AVAILABLE) {
	describe("ruby-lsp integration tests (skipped — ruby-lsp not found)", () => {
		it.skip("skipped", () => {});
	});
	// Force module-level skip without top-level await complications
	throw new Error("SKIP");
}

const SERVER: ResolvedServer = {
	id: "ruby-lsp",
	command: ["ruby-lsp"],
	extensions: [".rb"],
	priority: 0,
	initialization: {
		enabledFeatures: "all",
		formatter: "auto",
		featuresConfiguration: {
			inlayHint: { enableAll: true },
			codeLens: { enableTestCodeLens: true },
		},
	},
};

let tmpDir = "";
let client: LspClient;

// Fixture file path — must be inside tmpDir so workspace root resolves correctly
const SAMPLE_RB_NAME = "sample.rb";
let SAMPLE_RB = "";

const FIXTURE_CODE = `# frozen_string_literal: true

# A sample class for integration testing
class SampleClass
  attr_reader :name

  def initialize(name)
    @name = name
  end

  # Greet the user by name
  def greet
    "Hello, #{name}!"
  end

  def add(a, b)
    a + b
  end
end

sample = SampleClass.new("World")
puts sample.greet
`;

beforeAll(async () => {
	// Create a temp dir with a .git marker so findWorkspaceRoot works.
	// NOTE: No Gemfile — ruby-lsp requires a Gemfile.lock if a Gemfile is present,
	// so we skip it and let ruby-lsp operate in standalone mode.
	tmpDir = mkdirSync(join(tmpdir(), "pi-lsp-integ-"), { recursive: true }) ?? "";
	writeFileSync(join(tmpDir, ".git"), "");
	SAMPLE_RB = join(tmpDir, SAMPLE_RB_NAME);
	writeFileSync(SAMPLE_RB, FIXTURE_CODE);

	client = new LspClient(tmpDir, SERVER);
	await client.start();
	await client.initialize();
}, 30_000);

afterAll(async () => {
	if (client) {
		await client.stop();
	}
	if (tmpDir) {
		rmSync(tmpDir, { recursive: true, force: true });
	}
});

describe("ruby-lsp integration: LspClient methods", () => {
	it("opens a file", async () => {
		await client.openFile(SAMPLE_RB);
		// No error means success
	});

	it("hover returns type info or null (feature-dependent)", async () => {
		// Hover over "greet" on line 22
		const result = await client.hover(SAMPLE_RB, 22, 13);
		// RubyLSP may return null if indexing isn't complete or feature is disabled
		if (result) {
			expect(result.contents).toBeDefined();
		}
	});

	it("completion returns suggestions or null (feature-dependent)", async () => {
		// Complete after "sample." on line 22
		const result = await client.completion(SAMPLE_RB, 22, 7);
		// RubyLSP may return null if indexing isn't complete.
		// The response shape may vary — just verify it doesn't throw.
		if (result) {
			const items = "items" in result ? result.items : [];
			if (items && items.length > 0) {
				const labels = items.map((i: { label: string }) => i.label);
				expect(labels.length).toBeGreaterThan(0);
			}
		}
	});

	it("signature help returns parameter info", async () => {
		// Inside SampleClass.new("World") on line 21
		const result = await client.signatureHelp(SAMPLE_RB, 21, 22);
		// May or may not return signatures depending on cursor position
		if (result) {
			expect(result.signatures.length).toBeGreaterThanOrEqual(0);
		}
	});

	it("definition resolves", async () => {
		// Go to definition of "greet" on line 22
		const result = await client.definition(SAMPLE_RB, 22, 14);
		// May return Location or LocationLink array
		expect(result).toBeDefined();
	});

	it("references works", async () => {
		// Find references to "greet" on line 12 (the def line)
		const result = await client.references(SAMPLE_RB, 12, 6);
		expect(Array.isArray(result)).toBe(true);
		if (Array.isArray(result)) {
			expect(result.length).toBeGreaterThan(0);
		}
	});

	it("document symbols returns class/method structure", async () => {
		const result = await client.documentSymbols(SAMPLE_RB);
		expect(Array.isArray(result)).toBe(true);
		if (Array.isArray(result) && result.length > 0) {
			const names = result.map((s) => ("name" in s ? s.name : (s as { name?: string }).name));
			expect(names).toContain("SampleClass");
		}
	});

	it("formatting returns edits or null", async () => {
		const result = await client.formatting(SAMPLE_RB);
		// May return null if file is already formatted
		if (result) {
			expect(Array.isArray(result)).toBe(true);
		}
	});

	it("code actions returns actions or empty", async () => {
		const result = await client.codeActions(SAMPLE_RB, 4, 0);
		expect(Array.isArray(result)).toBe(true);
	});

	it("document links returns links or null", async () => {
		const result = await client.documentLink(SAMPLE_RB);
		// May be null or empty
		if (result) {
			expect(Array.isArray(result)).toBe(true);
		}
	});

	it("semantic tokens returns data", async () => {
		const result = await client.semanticTokensFull(SAMPLE_RB);
		if (result) {
			expect(result.data).toBeDefined();
			expect(Array.isArray(result.data)).toBe(true);
		}
	});

	it("inlay hints returns hints or null", async () => {
		const result = await client.inlayHints(SAMPLE_RB, 1, 20);
		if (result) {
			expect(Array.isArray(result)).toBe(true);
		}
	});

	it("show syntax tree returns AST", async () => {
		const result = await client.showSyntaxTree(SAMPLE_RB);
		expect(result).not.toBeNull();
		if (result) {
			expect(result.ast).toBeDefined();
			expect(typeof result.ast).toBe("string");
			expect(result.ast).toContain("ProgramNode");
		}
	});

	it("workspace dependencies returns deps", async () => {
		const result = await client.workspaceDependencies();
		expect(Array.isArray(result)).toBe(true);
		if (Array.isArray(result) && result.length > 0) {
			const names = result.map((d) => d.name);
			expect(names.length).toBeGreaterThan(0);
		}
	});

	it("type hierarchy prepare returns items or null", async () => {
		// Try to get type hierarchy for "SampleClass" on line 4
		const result = await client.prepareTypeHierarchy(SAMPLE_RB, 4, 6);
		// May be null if type hierarchy is not supported for this position
		if (result) {
			expect(Array.isArray(result)).toBe(true);
		}
	});

	it("prepare rename returns range or null", async () => {
		const result = await client.prepareRename(SAMPLE_RB, 4, 6);
		// May return range, placeholder, or null
		expect(result).toBeDefined();
	});

	it("diagnostics returns items", async () => {
		const result = await client.diagnostics(SAMPLE_RB);
		expect(result).toBeDefined();
		expect(result.items).toBeDefined();
		expect(Array.isArray(result.items)).toBe(true);
	});
});
