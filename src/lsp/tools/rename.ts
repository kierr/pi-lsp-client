import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { findWorkspaceRoot, withLspClient } from "../client-wrapper.js";
import { formatApplyResult, formatPrepareRenameResult } from "../formatters.js";
import type { PrepareRenameResult, WorkspaceEdit } from "../types.js";
import { handleMissingDependencyError } from "../utils.js";
import { type ApplyResult, applyWorkspaceEdit } from "../workspace-edit.js";

/**
 * Count the number of files and locations affected by a workspace edit.
 * Handles both `documentChanges` and `changes` variants of WorkspaceEdit.
 */
function countWorkspaceEditChanges(edit: WorkspaceEdit | null): { files: number; locations: number } {
	if (!edit) return { files: 0, locations: 0 };

	if (edit.documentChanges) {
		const files = edit.documentChanges.length;
		const locations = edit.documentChanges.reduce(
			(sum, dc) => sum + ("edits" in dc ? dc.edits.length : 0),
			0,
		);
		return { files, locations };
	}

	if (edit.changes) {
		const edits = Object.values(edit.changes).flat();
		return { files: Object.keys(edit.changes).length, locations: edits.length };
	}

	return { files: 0, locations: 0 };
}

const PrepareParams = Type.Object({
	filePath: Type.String({ description: "Path to the source file" }),
	line: Type.Number({ description: "1-based line of the symbol" }),
	character: Type.Number({ description: "0-based column of the symbol on that line" }),
});

const RenameParams = Type.Object({
	filePath: Type.String({ description: "Path to the source file" }),
	line: Type.Number({ description: "1-based line of the symbol" }),
	character: Type.Number({ description: "0-based column of the symbol on that line" }),
	newName: Type.String({ description: "New symbol name" }),
});

export interface LspPrepareRenameDetails {
	filePath: string;
	line: number;
	character: number;
	result: PrepareRenameResult | null;
	error?: string;
	errorKind?: "missing_dependency";
}

export interface LspRenameDetails {
	filePath: string;
	line: number;
	character: number;
	newName: string;
	apply: ApplyResult | null;
	edit: WorkspaceEdit | null;
	affectedFilesCount: number;
	affectedLocationsCount: number;
	error?: string;
	errorKind?: "missing_dependency";
}

export const lsp_prepare_rename = defineTool({
	name: "lsp_prepare_rename",
	label: "LSP Prepare Rename",
	description: "Check if rename is valid at a given position. Use BEFORE lsp_rename.",
	parameters: PrepareParams,
	async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
		try {
			const result = await withLspClient<PrepareRenameResult | null>(
				params.filePath,
				async (client) => client.prepareRename(params.filePath, params.line, params.character),
				"prepareRename",
				signal === undefined ? {} : { signal },
			);

			const text = formatPrepareRenameResult(result);
			return {
				content: [{ type: "text", text }],
				details: {
					filePath: params.filePath,
					line: params.line,
					character: params.character,
					result,
				} satisfies LspPrepareRenameDetails,
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
						result: null,
						error: message,
						errorKind: "missing_dependency",
					} satisfies LspPrepareRenameDetails,
				};
			}
			throw e;
		}
	},
});

export const lsp_rename = defineTool({
	name: "lsp_rename",
	label: "LSP Rename",
	description:
		"Rename symbol across the entire workspace. APPLIES changes to all files. " +
		"Use lsp_prepare_rename first to validate. For large renames (>10 files), consider reviewing changes first.",
	parameters: RenameParams,
	executionMode: "sequential",
	async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
		try {
			const edit = await withLspClient<WorkspaceEdit | null>(
				params.filePath,
				async (client) => client.rename(params.filePath, params.line, params.character, params.newName),
				"rename",
				signal === undefined ? {} : { signal },
			);

			// Count affected files and locations for safety awareness
			const { files: affectedFilesCount, locations: affectedLocationsCount } = countWorkspaceEditChanges(edit);

			const apply = applyWorkspaceEdit(edit, findWorkspaceRoot(params.filePath));
			let text = formatApplyResult(apply);

			// Add warning for large renames
			if (affectedFilesCount > 10) {
				text =
					`⚠️ LARGE RENAME: This change affected ${affectedFilesCount} files with ${affectedLocationsCount} locations.\n\n` +
					text;
			}

			return {
				content: [{ type: "text", text }],
				details: {
					filePath: params.filePath,
					line: params.line,
					character: params.character,
					newName: params.newName,
					apply,
					edit,
					affectedFilesCount,
					affectedLocationsCount,
				} satisfies LspRenameDetails,
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
						newName: params.newName,
						apply: null,
						edit: null,
						affectedFilesCount: 0,
						affectedLocationsCount: 0,
						error: message,
						errorKind: "missing_dependency",
					} satisfies LspRenameDetails,
				};
			}
			throw e;
		}
	},
});
