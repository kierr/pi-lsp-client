import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { findWorkspaceRoot, withLspClient } from "../client-wrapper.js";
import { formatApplyResult } from "../formatters.js";
import type { Range, TextEdit } from "../types.js";
import { handleMissingDependencyError } from "../utils.js";
import { type ApplyResult, applyWorkspaceEdit } from "../workspace-edit.js";

const Params = Type.Object({
	filePath: Type.String({ description: "Path to the source file" }),
	line: Type.Number({ description: "1-based start line" }),
	character: Type.Number({ description: "0-based start column" }),
	endLine: Type.Number({ description: "1-based end line" }),
	endCharacter: Type.Number({ description: "0-based end column" }),
	tabSize: Type.Optional(Type.Number({ description: "Tab size (default: 2)" })),
	insertSpaces: Type.Optional(Type.Boolean({ description: "Use spaces instead of tabs (default: true)" })),
	apply: Type.Optional(Type.Boolean({ description: "Apply edits to file (default: true)" })),
});

export interface LspRangeFormattingDetails {
	filePath: string;
	range: Range;
	edits: TextEdit[];
	applied: ApplyResult | null;
	error?: string;
	errorKind?: "missing_dependency";
}

export const lsp_range_formatting = defineTool({
	name: "lsp_range_formatting",
	label: "LSP Range Formatting",
	description: "Format a range of lines. Note: RubyLSP only supports range formatting with SyntaxTree formatter.",
	parameters: Params,
	executionMode: "sequential",
	async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
		try {
			const range: Range = {
				start: { line: params.line - 1, character: params.character },
				end: { line: params.endLine - 1, character: params.endCharacter },
			};

			const options =
				params.tabSize !== undefined || params.insertSpaces !== undefined
					? { tabSize: params.tabSize ?? 2, insertSpaces: params.insertSpaces ?? true }
					: undefined;

			const result = await withLspClient<TextEdit[] | null>(
				params.filePath,
				async (client) => client.rangeFormatting(params.filePath, range, options),
				"rangeFormatting",
				signal === undefined ? {} : { signal },
			);

			const edits = result ?? [];

			if (edits.length === 0) {
				return {
					content: [{ type: "text", text: "Range is already formatted" }],
					details: {
						filePath: params.filePath,
						range,
						edits: [],
						applied: null,
					} satisfies LspRangeFormattingDetails,
				};
			}

			let applied: ApplyResult | null = null;
			const shouldApply = params.apply !== false; // default true

			if (shouldApply) {
				const workspaceEdit = {
					documentChanges: [
						{
							textDocument: { uri: `file://${params.filePath}`, version: null },
							edits,
						},
					],
				};
				applied = applyWorkspaceEdit(workspaceEdit, findWorkspaceRoot(params.filePath));
			}

			const text = applied
				? formatApplyResult(applied)
				: `${edits.length} formatting edit(s) available (not applied)`;
			return {
				content: [{ type: "text", text }],
				details: {
					filePath: params.filePath,
					range,
					edits,
					applied,
				} satisfies LspRangeFormattingDetails,
			};
		} catch (e) {
			const message = handleMissingDependencyError(e);
			if (message) {
				return {
					content: [{ type: "text", text: message }],
					details: {
						filePath: params.filePath,
						range: {
							start: { line: params.line - 1, character: params.character },
							end: { line: params.endLine - 1, character: params.endCharacter },
						},
						edits: [],
						applied: null,
						error: message,
						errorKind: "missing_dependency",
					} satisfies LspRangeFormattingDetails,
				};
			}
			throw e;
		}
	},
});
