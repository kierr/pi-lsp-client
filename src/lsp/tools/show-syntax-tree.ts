import { defineTool } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

import { withLspClient } from "../client-wrapper.js";
import { handleMissingDependencyError } from "../utils.js";

const Params = Type.Object({
	filePath: Type.String({ description: "Path to the Ruby source file" }),
	startLine: Type.Optional(Type.Number({ description: "1-based start line for partial AST" })),
	startCharacter: Type.Optional(Type.Number({ description: "0-based start character" })),
	endLine: Type.Optional(Type.Number({ description: "1-based end line for partial AST" })),
	endCharacter: Type.Optional(Type.Number({ description: "0-based end character" })),
});

interface SyntaxTreeRange {
	startLine: number;
	startCharacter: number;
	endLine: number;
	endCharacter: number;
}

export interface LspShowSyntaxTreeDetails {
	filePath: string;
	range?: SyntaxTreeRange;
	ast: string | null;
	error?: string;
	errorKind?: "missing_dependency";
}

export const lsp_show_syntax_tree = defineTool({
	name: "lsp_show_syntax_tree",
	label: "LSP Show Syntax Tree (RubyLSP)",
	description: "Visualize the Prism AST of Ruby code. RubyLSP custom extension.",
	parameters: Params,
	async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
		try {
			let range: SyntaxTreeRange | undefined;
			if (
				params.startLine !== undefined &&
				params.startCharacter !== undefined &&
				params.endLine !== undefined &&
				params.endCharacter !== undefined
			) {
				range = {
					startLine: params.startLine as number,
					startCharacter: params.startCharacter as number,
					endLine: params.endLine as number,
					endCharacter: params.endCharacter as number,
				};
			}

			const result = await withLspClient<{ ast: string } | null>(
				params.filePath,
				async (client) => client.showSyntaxTree(params.filePath, range),
				"showSyntaxTree",
				signal === undefined ? {} : { signal },
			);

			const ast = result?.ast ?? null;

			const details: LspShowSyntaxTreeDetails = { filePath: params.filePath, ast };
			if (range) details.range = range;

			if (!ast) {
				return {
					content: [{ type: "text", text: "No syntax tree available" }],
					details,
				};
			}

			return {
				content: [{ type: "text", text: ast }],
				details,
			};
		} catch (e) {
			const message = handleMissingDependencyError(e);
			if (message) {
				return {
					content: [{ type: "text", text: message }],
					details: {
						filePath: params.filePath,
						ast: null,
						error: message,
						errorKind: "missing_dependency",
					} satisfies LspShowSyntaxTreeDetails,
				};
			}
			throw e;
		}
	},
});
