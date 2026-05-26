import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { withSemanticFallback } from "../client-wrapper.js";
import type { Hover, MarkupContent } from "../types.js";
import { handleMissingDependencyError } from "../utils.js";

const Params = Type.Object({
	filePath: Type.String({ description: "Path to the source file" }),
	line: Type.Number({ description: "1-based line number" }),
	character: Type.Number({ description: "0-based column on that line" }),
});

export interface LspHoverDetails {
	filePath: string;
	line: number;
	character: number;
	hover: Hover | null;
	contents: string[];
	error?: string;
	errorKind?: "missing_dependency";
}

function extractHoverText(hover: Hover): string[] {
	const contents = hover.contents;
	if (typeof contents === "string") return [contents];
	if ("kind" in contents) return [(contents as MarkupContent).value];
	if (Array.isArray(contents)) {
		return contents.map((item) => {
			if (typeof item === "string") return item;
			return `\`\`\`${item.language}\n${item.value}\n\`\`\``;
		});
	}
	return [String(contents)];
}

export const lsp_hover = defineTool({
	name: "lsp_hover",
	label: "LSP Hover",
	description: "Get type info, doc comments, and signature at a position.",
	parameters: Params,
	async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
		try {
			const result = await withSemanticFallback<Hover | null>(
				params.filePath,
				async (client) => client.hover(params.filePath, params.line, params.character),
				"hover",
				signal === undefined ? {} : { signal },
			);

			if (!result) {
				return {
					content: [{ type: "text", text: "No hover information available" }],
					details: {
						filePath: params.filePath,
						line: params.line,
						character: params.character,
						hover: null,
						contents: [],
					} satisfies LspHoverDetails,
				};
			}

			const contents = extractHoverText(result);
			const text = contents.join("\n---\n");
			return {
				content: [{ type: "text", text }],
				details: {
					filePath: params.filePath,
					line: params.line,
					character: params.character,
					hover: result,
					contents,
				} satisfies LspHoverDetails,
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
						hover: null,
						contents: [],
						error: message,
						errorKind: "missing_dependency",
					} satisfies LspHoverDetails,
				};
			}
			throw e;
		}
	},
});
