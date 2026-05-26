import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { findWorkspaceRoot, withLspClient, withSemanticFallback } from "../client-wrapper.js";
import { formatApplyResult } from "../formatters.js";
import type { CodeAction, Command } from "../types.js";
import { handleMissingDependencyError } from "../utils.js";
import { type ApplyResult, applyWorkspaceEdit } from "../workspace-edit.js";

const Params = Type.Object({
	filePath: Type.String({ description: "Path to the source file" }),
	line: Type.Number({ description: "1-based line number" }),
	character: Type.Number({ description: "0-based column on that line" }),
	endLine: Type.Optional(Type.Number({ description: "1-based end line for range (optional)" })),
	endCharacter: Type.Optional(Type.Number({ description: "0-based end column for range (optional)" })),
	only: Type.Optional(Type.Array(Type.String(), { description: "Filter to specific CodeActionKinds" })),
	applyIndex: Type.Optional(Type.Number({ description: "Index of action to resolve and apply (0-based)" })),
});

export interface LspCodeActionsDetails {
	filePath: string;
	line: number;
	character: number;
	actions: Array<{ title: string; kind?: string; isPreferred?: boolean; command?: string }>;
	applied: ApplyResult | null;
	error?: string;
	errorKind?: "missing_dependency";
}

function summarizeAction(action: CodeAction | Command, index: number): string {
	if ("kind" in action) {
		const kind = action.kind ?? "";
		const preferred = action.isPreferred ? " ★" : "";
		return `[${index}] ${action.title} (${kind})${preferred}`;
	}
	const cmd = typeof action.command === "string" ? action.command : (action.command?.title ?? "unknown");
	return `[${index}] ${action.title} (command: ${cmd})`;
}

export const lsp_code_actions = defineTool({
	name: "lsp_code_actions",
	label: "LSP Code Actions",
	description: "Get quick fixes, refactors, and code actions. Use applyIndex to apply a specific action.",
	parameters: Params,
	executionMode: "sequential",
	async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
		try {
			const range =
				params.endLine !== undefined && params.endCharacter !== undefined
					? { endLine: params.endLine, endCharacter: params.endCharacter }
					: undefined;

			const result = await withSemanticFallback<Array<CodeAction | Command> | null>(
				params.filePath,
				async (client) => client.codeActions(params.filePath, params.line, params.character, range, params.only),
				"codeActions",
				signal === undefined ? {} : { signal },
			);

			const actions = result ?? [];

			if (actions.length === 0) {
				return {
					content: [{ type: "text", text: "No code actions available" }],
					details: {
						filePath: params.filePath,
						line: params.line,
						character: params.character,
						actions: [],
						applied: null,
					} satisfies LspCodeActionsDetails,
				};
			}

			let applied: ApplyResult | null = null;

			// If applyIndex is specified, resolve the CodeAction and apply its edit.
			if (params.applyIndex !== undefined) {
				const target = actions[params.applyIndex];
				if (target && "kind" in target) {
					// Resolve to get the full edit.
					const resolved = await withLspClient<CodeAction>(
						params.filePath,
						async (client) => client.codeActionResolve(target),
						"codeActions",
						signal === undefined ? {} : { signal },
					);
					applied = applyWorkspaceEdit(resolved.edit ?? null, findWorkspaceRoot(params.filePath));
				}
			}

			const summary = actions.map((a, i) => summarizeAction(a, i)).join("\n");
			const applyNote = applied ? `\n\n${formatApplyResult(applied)}` : "";

			return {
				content: [{ type: "text", text: `${summary}${applyNote}` }],
				details: {
					filePath: params.filePath,
					line: params.line,
					character: params.character,
					actions: actions.map((a) => {
						const summary: { title: string; kind?: string; isPreferred?: boolean; command?: string } = {
							title: a.title,
						};
						if ("kind" in a && a.kind) summary.kind = a.kind;
						if ("isPreferred" in a && a.isPreferred) summary.isPreferred = a.isPreferred;
						if ("command" in a) {
							summary.command = typeof a.command === "string" ? a.command : a.command?.title;
						}
						return summary;
					}),
					applied,
				} satisfies LspCodeActionsDetails,
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
						actions: [],
						applied: null,
						error: message,
						errorKind: "missing_dependency",
					} satisfies LspCodeActionsDetails,
				};
			}
			throw e;
		}
	},
});
