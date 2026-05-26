import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { withLspClient } from "../client-wrapper.js";
import type { RubyTestItem } from "../types.js";
import { handleMissingDependencyError } from "../utils.js";

const Params = Type.Object({
	filePath: Type.String({ description: "Path to the test file or directory" }),
	resolveCommands: Type.Optional(
		Type.Boolean({ description: "Resolve test commands for execution (default: false)" }),
	),
});

export interface LspDiscoverTestsDetails {
	filePath: string;
	tests: RubyTestItem[];
	commands: string[] | null;
	error?: string;
	errorKind?: "missing_dependency";
}

function formatTestItem(item: RubyTestItem, indent: number): string {
	const prefix = "  ".repeat(indent);
	const kind = item.type ? ` [${item.type}]` : "";
	const range = item.range ? ` L${item.range.start.line + 1}:${item.range.start.character}` : "";
	let result = `${prefix}${item.label}${kind}${range}`;
	for (const child of item.children ?? []) {
		result += `\n${formatTestItem(child, indent + 1)}`;
	}
	return result;
}

/** Flatten test items into (uri, id) pairs for resolveTestCommands. */
function flattenTestItems(items: RubyTestItem[]): Array<{ uri: string; id: string }> {
	const result: Array<{ uri: string; id: string }> = [];
	for (const item of items) {
		if (item.uri && item.id) {
			result.push({ uri: item.uri, id: item.id });
		}
		if (item.children) {
			result.push(...flattenTestItems(item.children));
		}
	}
	return result;
}

export const lsp_discover_tests = defineTool({
	name: "lsp_discover_tests",
	label: "LSP Discover Tests (RubyLSP)",
	description: "Discover test classes and methods. RubyLSP custom extension.",
	parameters: Params,
	async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
		try {
			const result = await withLspClient<RubyTestItem[] | null>(
				params.filePath,
				async (client) => client.discoverTests(params.filePath),
				"discoverTests",
				signal === undefined ? {} : { signal },
			);

			const tests = result ?? [];
			let commands: string[] | null = null;

			// Optionally resolve test commands.
			if (params.resolveCommands && tests.length > 0) {
				const flatItems = flattenTestItems(tests);
				if (flatItems.length > 0) {
					const resolved = await withLspClient<{ commands: string[] } | null>(
						params.filePath,
						async (client) => client.resolveTestCommands(flatItems),
						"discoverTests",
						signal === undefined ? {} : { signal },
					);
					commands = resolved?.commands ?? null;
				}
			}

			if (tests.length === 0) {
				return {
					content: [{ type: "text", text: "No tests discovered" }],
					details: {
						filePath: params.filePath,
						tests: [],
						commands: null,
					} satisfies LspDiscoverTestsDetails,
				};
			}

			const lines = tests.map((item) => formatTestItem(item, 0));
			if (commands && commands.length > 0) {
				lines.push("", "Commands:");
				for (const cmd of commands) {
					lines.push(`  ${cmd}`);
				}
			}
			const text = lines.join("\n");

			return {
				content: [{ type: "text", text }],
				details: {
					filePath: params.filePath,
					tests,
					commands,
				} satisfies LspDiscoverTestsDetails,
			};
		} catch (e) {
			const message = handleMissingDependencyError(e);
			if (message) {
				return {
					content: [{ type: "text", text: message }],
					details: {
						filePath: params.filePath,
						tests: [],
						commands: null,
						error: message,
						errorKind: "missing_dependency",
					} satisfies LspDiscoverTestsDetails,
				};
			}
			throw e;
		}
	},
});
