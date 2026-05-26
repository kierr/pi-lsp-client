import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { findWorkspaceRoot, withLspClient } from "../client-wrapper.js";
import { formatApplyResult } from "../formatters.js";
import type { TextEdit } from "../types.js";
import { handleMissingDependencyError } from "../utils.js";
import { type ApplyResult, applyWorkspaceEdit } from "../workspace-edit.js";

const Params = Type.Object({
	filePath: Type.String({ description: "Path to the source file to format" }),
	tabSize: Type.Optional(Type.Number({ description: "Tab size (default: 2)" })),
	insertSpaces: Type.Optional(Type.Boolean({ description: "Use spaces instead of tabs (default: true)" })),
	apply: Type.Optional(Type.Boolean({ description: "Apply edits to file (default: true)" })),
});

export interface LspFormattingDetails {
	filePath: string;
	edits: TextEdit[];
	applied: ApplyResult | null;
	error?: string;
	errorKind?: "missing_dependency";
}

export const lsp_formatting = defineTool({
	name: "lsp_formatting",
	label: "LSP Formatting",
	description: "Format entire file using the language server's formatter. Applies changes by default.",
	parameters: Params,
	executionMode: "sequential",
	async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
		try {
			const options =
				params.tabSize !== undefined || params.insertSpaces !== undefined
					? { tabSize: params.tabSize ?? 2, insertSpaces: params.insertSpaces ?? true }
					: undefined;

			const result = await withLspClient<TextEdit[] | null>(
				params.filePath,
				async (client) => client.formatting(params.filePath, options),
				"formatting",
				signal === undefined ? {} : { signal },
			);

			const edits = result ?? [];

			if (edits.length === 0) {
				return {
					content: [{ type: "text", text: "File is already formatted" }],
					details: {
						filePath: params.filePath,
						edits: [],
						applied: null,
					} satisfies LspFormattingDetails,
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
					edits,
					applied,
				} satisfies LspFormattingDetails,
			};
		} catch (e) {
			const message = handleMissingDependencyError(e);
			if (message) {
				return {
					content: [{ type: "text", text: message }],
					details: {
						filePath: params.filePath,
						edits: [],
						applied: null,
						error: message,
						errorKind: "missing_dependency",
					} satisfies LspFormattingDetails,
				};
			}
			throw e;
		}
	},
});
