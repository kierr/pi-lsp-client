import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { uriToPath } from "./formatters.js";
import type { TextEdit, WorkspaceEdit } from "./types.js";

export interface ApplyResult {
	success: boolean;
	filesModified: string[];
	totalEdits: number;
	errors: string[];
}

interface FileApplyResult {
	success: boolean;
	editCount: number;
	error?: string;
}

/** Detect the dominant line ending in a string (CRLF or LF). */
function detectLineEnding(text: string): "\r\n" | "\n" {
	let crlf = 0;
	let lf = 0;
	for (let i = 0; i < text.length && crlf + lf < 500; i++) {
		if (text[i] === "\r" && text[i + 1] === "\n") {
			crlf++;
			i++; // skip the \n
		} else if (text[i] === "\n") {
			lf++;
		}
	}
	return crlf > lf ? "\r\n" : "\n";
}

/** Validate that a resolved file path stays within the workspace root. */
function assertWithinWorkspace(filePath: string, root: string): void {
	const resolved = resolve(filePath);
	const resolvedRoot = resolve(root);
	if (!resolved.startsWith(`${resolvedRoot}/`) && resolved !== resolvedRoot) {
		throw new Error(
			`Path escapes workspace boundary: ${resolved} is outside ${resolvedRoot}. ` +
				"Rejecting workspace edit to prevent unintended file modifications.",
		);
	}
}

function applyTextEditsToFile(filePath: string, edits: TextEdit[]): FileApplyResult {
	try {
		const content = readFileSync(filePath, "utf-8");
		// Preserve the original line ending style instead of normalizing CRLF → LF
		const lineEnding = detectLineEnding(content);
		const lines = content.split(/\r?\n/);

		const sortedEdits = [...edits].sort((a, b) => {
			if (b.range.start.line !== a.range.start.line) {
				return b.range.start.line - a.range.start.line;
			}
			return b.range.start.character - a.range.start.character;
		});

		for (const edit of sortedEdits) {
			const startLine = edit.range.start.line;
			const startChar = edit.range.start.character;
			const endLine = edit.range.end.line;
			const endChar = edit.range.end.character;

			if (startLine === endLine) {
				const line = lines[startLine] ?? "";
				lines[startLine] = line.substring(0, startChar) + edit.newText + line.substring(endChar);
			} else {
				const firstLine = lines[startLine] ?? "";
				const lastLine = lines[endLine] ?? "";
				const newContent = firstLine.substring(0, startChar) + edit.newText + lastLine.substring(endChar);
				lines.splice(startLine, endLine - startLine + 1, ...newContent.split(/\r?\n/));
			}
		}

		writeFileSync(filePath, lines.join(lineEnding), "utf-8");
		return { success: true, editCount: edits.length };
	} catch (err) {
		return {
			success: false,
			editCount: 0,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

export function applyWorkspaceEdit(edit: WorkspaceEdit | null, workspaceRoot?: string): ApplyResult {
	if (!edit) {
		return { success: false, filesModified: [], totalEdits: 0, errors: ["No edit provided"] };
	}

	const result: ApplyResult = { success: true, filesModified: [], totalEdits: 0, errors: [] };

	// LSP spec: documentChanges is preferred. Only fall back to changes when absent.
	// Processing both would double-apply edits when a server provides both fields.
	if (edit.documentChanges) {
		for (const change of edit.documentChanges) {
			if (!("kind" in change)) {
				const filePath = uriToPath(change.textDocument.uri);
				if (workspaceRoot) assertWithinWorkspace(filePath, workspaceRoot);
				const applyResult = applyTextEditsToFile(filePath, change.edits);

				if (applyResult.success) {
					result.filesModified.push(filePath);
					result.totalEdits += applyResult.editCount;
				} else {
					result.success = false;
					result.errors.push(`${filePath}: ${applyResult.error}`);
				}
				continue;
			}

			if (change.kind === "create") {
				try {
					const filePath = uriToPath(change.uri);
					if (workspaceRoot) assertWithinWorkspace(filePath, workspaceRoot);
					writeFileSync(filePath, "", "utf-8");
					result.filesModified.push(filePath);
				} catch (err) {
					result.success = false;
					result.errors.push(`Create ${change.uri}: ${String(err)}`);
				}
			} else if (change.kind === "rename") {
				try {
					const oldPath = uriToPath(change.oldUri);
					const newPath = uriToPath(change.newUri);
					if (workspaceRoot) {
						assertWithinWorkspace(oldPath, workspaceRoot);
						assertWithinWorkspace(newPath, workspaceRoot);
					}
					const content = readFileSync(oldPath, "utf-8");
					writeFileSync(newPath, content, "utf-8");
					unlinkSync(oldPath);
					result.filesModified.push(newPath);
				} catch (err) {
					result.success = false;
					result.errors.push(`Rename ${change.oldUri}: ${String(err)}`);
				}
			} else if (change.kind === "delete") {
				try {
					const filePath = uriToPath(change.uri);
					if (workspaceRoot) assertWithinWorkspace(filePath, workspaceRoot);
					unlinkSync(filePath);
					result.filesModified.push(filePath);
				} catch (err) {
					result.success = false;
					result.errors.push(`Delete ${change.uri}: ${String(err)}`);
				}
			}
		}
	} else if (edit.changes) {
		for (const [uri, edits] of Object.entries(edit.changes)) {
			const filePath = uriToPath(uri);
			if (workspaceRoot) assertWithinWorkspace(filePath, workspaceRoot);
			const applyResult = applyTextEditsToFile(filePath, edits);

			if (applyResult.success) {
				result.filesModified.push(filePath);
				result.totalEdits += applyResult.editCount;
			} else {
				result.success = false;
				result.errors.push(`${filePath}: ${applyResult.error}`);
			}
		}
	}

	return result;
}
