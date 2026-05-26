import { defineTool } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

import { withLspClient } from "../client-wrapper.js";
import type { TypeHierarchyItem } from "../types.js";
import { handleMissingDependencyError } from "../utils.js";

const Params = Type.Object({
	filePath: Type.String({ description: "Path to the source file" }),
	line: Type.Number({ description: "1-based line number of the type" }),
	character: Type.Number({ description: "0-based column of the type on that line" }),
	depth: Type.Optional(Type.Number({ description: "Max ancestor depth (default: 5)" })),
});

export interface LspTypeHierarchyDetails {
	filePath: string;
	line: number;
	character: number;
	items: TypeHierarchyItem[];
	depth: number;
	error?: string;
	errorKind?: "missing_dependency";
}

function formatHierarchyItem(item: TypeHierarchyItem, indent: number): string {
	const prefix = "  ".repeat(indent);
	const name = item.name;
	const detail = item.detail ? ` — ${item.detail}` : "";
	const kind = item.kind !== undefined ? ` [${item.kind}]` : "";
	return `${prefix}${name}${kind}${detail}`;
}

export const lsp_type_hierarchy = defineTool({
	name: "lsp_type_hierarchy",
	label: "LSP Type Hierarchy (Experimental)",
	description: "Get ancestor chain of a type. Experimental LSP feature.",
	parameters: Params,
	async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
		try {
			const maxDepth = params.depth ?? 5;

			// Step 1: prepare — get the initial hierarchy items at the position.
			const prepared = await withLspClient<TypeHierarchyItem[] | null>(
				params.filePath,
				async (client) => client.prepareTypeHierarchy(params.filePath, params.line, params.character),
				"typeHierarchy",
				signal === undefined ? {} : { signal },
			);

			if (!prepared || prepared.length === 0) {
				return {
					content: [{ type: "text", text: "No type hierarchy found at this position" }],
					details: {
						filePath: params.filePath,
						line: params.line,
						character: params.character,
						items: [],
						depth: maxDepth,
					} satisfies LspTypeHierarchyDetails,
				};
			}

			// Step 2: walk supertypes up to maxDepth levels.
			const allItems: TypeHierarchyItem[] = [...prepared];
			let currentLevel = [...prepared];

			for (let d = 0; d < maxDepth && currentLevel.length > 0; d++) {
				const nextLevel: TypeHierarchyItem[] = [];
				for (const item of currentLevel) {
					try {
						const supertypes = await withLspClient<TypeHierarchyItem[] | null>(
							params.filePath,
							async (client) => client.typeHierarchySupertypes(item),
							"typeHierarchy",
							signal === undefined ? {} : { signal },
						);
						if (supertypes) {
							allItems.push(...supertypes);
							nextLevel.push(...supertypes);
						}
					} catch {
						// Best-effort — some items may not support supertypes.
					}
				}
				currentLevel = nextLevel;
			}

			// Format: show the initial items, then ancestors indented.
			const lines: string[] = [];
			for (const item of prepared) {
				lines.push(formatHierarchyItem(item, 0));
			}
			// Show remaining ancestors at indent level 1 for simplicity.
			const ancestors = allItems.slice(prepared.length);
			for (const item of ancestors) {
				const idx = allItems.indexOf(item);
				// Compute indent from the depth of the item.
				const indent = Math.min(Math.floor((idx - prepared.length) / Math.max(prepared.length, 1)) + 1, maxDepth);
				lines.push(formatHierarchyItem(item, indent));
			}

			const text = lines.join("\n");
			return {
				content: [{ type: "text", text }],
				details: {
					filePath: params.filePath,
					line: params.line,
					character: params.character,
					items: allItems,
					depth: maxDepth,
				} satisfies LspTypeHierarchyDetails,
			};
		} catch (e) {
			const message = handleMissingDependencyError(e);
			if (message) {
				return {
					content: [{ type: "text", text: message }],
					details: {
						filePath: params.filePath,
						line: params.line,
						character: params.character,
						items: [],
						depth: params.depth ?? 5,
						error: message,
						errorKind: "missing_dependency",
					} satisfies LspTypeHierarchyDetails,
				};
			}
			throw e;
		}
	},
});
