import { defineTool } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

import { withLspClient } from "../client-wrapper.js";
import type { CompletionItem, CompletionList } from "../types.js";
import { handleMissingDependencyError } from "../utils.js";

const COMPLETION_KIND_NAME: Record<number, string> = {
	1: "Text",
	2: "Method",
	3: "Function",
	4: "Constructor",
	5: "Field",
	6: "Variable",
	7: "Class",
	8: "Interface",
	9: "Module",
	10: "Property",
	11: "Unit",
	12: "Value",
	13: "Enum",
	14: "Keyword",
	15: "Snippet",
	16: "Color",
	17: "File",
	18: "Reference",
	19: "Folder",
	20: "EnumMember",
	21: "Constant",
	22: "Struct",
	23: "Event",
	24: "Operator",
	25: "TypeParameter",
};

const DEFAULT_LIMIT = 50;
const MAX_RESOLVE = 20;

const Params = Type.Object({
	filePath: Type.String({ description: "Path to the source file" }),
	line: Type.Number({ description: "1-based line number" }),
	character: Type.Number({ description: "0-based column on that line" }),
	resolve: Type.Optional(Type.Boolean({ description: "Resolve completion items for full docs (default: false)" })),
	limit: Type.Optional(Type.Number({ description: "Max items to return (default: 50)" })),
});

export interface LspCompletionDetails {
	filePath: string;
	line: number;
	character: number;
	items: CompletionItem[];
	isIncomplete: boolean;
	totalItems: number;
	resolved: number;
	truncated: boolean;
	error?: string;
	errorKind?: "missing_dependency";
}

function formatItem(item: CompletionItem): string {
	const label = item.label;
	const kind = item.kind ? (COMPLETION_KIND_NAME[item.kind] ?? `Kind(${item.kind})`) : "";
	const detail = item.detail ? ` — ${item.detail}` : "";
	return kind ? `${label} [${kind}]${detail}` : `${label}${detail}`;
}

export const lsp_completion = defineTool({
	name: "lsp_completion",
	label: "LSP Completion",
	description: "Get completion suggestions at a position. Optionally resolve items for full documentation.",
	parameters: Params,
	async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
		try {
			const result = await withLspClient<CompletionList | null>(
				params.filePath,
				async (client) => client.completion(params.filePath, params.line, params.character),
				"completion",
				signal === undefined ? {} : { signal },
			);

			if (!result) {
				return {
					content: [{ type: "text", text: "No completions available" }],
					details: {
						filePath: params.filePath,
						line: params.line,
						character: params.character,
						items: [],
						isIncomplete: false,
						totalItems: 0,
						resolved: 0,
						truncated: false,
					} satisfies LspCompletionDetails,
				};
			}

			const allItems = result.items ?? [];
			const total = allItems.length;
			const limit = Math.min(params.limit ?? DEFAULT_LIMIT, DEFAULT_LIMIT);
			const truncated = total > limit;
			const limited = truncated ? allItems.slice(0, limit) : allItems;

			let resolved = 0;
			if (params.resolve) {
				const toResolve = limited.filter((item) => item.data !== undefined).slice(0, MAX_RESOLVE);
				for (const item of toResolve) {
					try {
						const resolvedItem = await withLspClient<CompletionItem>(
							params.filePath,
							async (client) => client.completionResolve(item),
							"completion",
							signal === undefined ? {} : { signal },
						);
						// Patch the item in-place with resolved data.
						if (resolvedItem["documentation"] !== undefined)
							(item as Record<string, unknown>)["documentation"] = resolvedItem.documentation;
						if (resolvedItem["detail"] !== undefined)
							(item as Record<string, unknown>)["detail"] = resolvedItem.detail;
						if (resolvedItem["additionalTextEdits"] !== undefined)
							(item as Record<string, unknown>)["additionalTextEdits"] = resolvedItem.additionalTextEdits;
						resolved++;
					} catch {
						// Resolution failure is non-fatal; the item is still usable.
					}
				}
			}

			if (total === 0) {
				return {
					content: [{ type: "text", text: "No completions available" }],
					details: {
						filePath: params.filePath,
						line: params.line,
						character: params.character,
						items: [],
						isIncomplete: result.isIncomplete ?? false,
						totalItems: 0,
						resolved: 0,
						truncated: false,
					} satisfies LspCompletionDetails,
				};
			}

			const lines = limited.map(formatItem);
			if (truncated) {
				lines.unshift(`Found ${total} completions (showing first ${limit}):`);
			}
			const text = lines.join("\n");
			return {
				content: [{ type: "text", text }],
				details: {
					filePath: params.filePath,
					line: params.line,
					character: params.character,
					items: allItems,
					isIncomplete: result.isIncomplete ?? false,
					totalItems: total,
					resolved,
					truncated,
				} satisfies LspCompletionDetails,
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
						isIncomplete: false,
						totalItems: 0,
						resolved: 0,
						truncated: false,
						error: message,
						errorKind: "missing_dependency",
					} satisfies LspCompletionDetails,
				};
			}
			throw e;
		}
	},
});
