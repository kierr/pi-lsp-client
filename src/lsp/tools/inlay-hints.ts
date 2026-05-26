import { defineTool } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

import { withLspClient } from "../client-wrapper.js";
import type { InlayHint } from "../types.js";
import { handleMissingDependencyError } from "../utils.js";

const Params = Type.Object({
	filePath: Type.String({ description: "Path to the source file" }),
	startLine: Type.Number({ description: "1-based start line of the range" }),
	endLine: Type.Number({ description: "1-based end line of the range" }),
});

export interface LspInlayHintsDetails {
	filePath: string;
	startLine: number;
	endLine: number;
	hints: InlayHint[];
	totalHints: number;
	error?: string;
	errorKind?: "missing_dependency";
}

const INLAY_KIND_NAME: Record<number, string> = {
	1: "Type",
	2: "Parameter",
};

function formatInlayHint(hint: InlayHint): string {
	const line = hint.position.line + 1;
	const char = hint.position.character;
	const kind = hint.kind !== undefined ? (INLAY_KIND_NAME[hint.kind as number] ?? `Kind(${hint.kind})`) : "Other";
	// label is string | InlayHintLabelPart[]. Flatten to string for display.
	const label = typeof hint.label === "string" ? hint.label : hint.label.map((part) => part.value).join("");
	const tooltip = hint.tooltip
		? typeof hint.tooltip === "string"
			? ` — ${hint.tooltip}`
			: hint.tooltip.value
				? ` — ${hint.tooltip.value}`
				: ""
		: "";
	return `${line}:${char} [${kind}] ${label}${tooltip}`;
}

export const lsp_inlay_hints = defineTool({
	name: "lsp_inlay_hints",
	label: "LSP Inlay Hints",
	description: "Get inline hints like implicit types, omitted hash values for a range of lines.",
	parameters: Params,
	async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
		try {
			const result = await withLspClient<InlayHint[] | null>(
				params.filePath,
				async (client) => client.inlayHints(params.filePath, params.startLine, params.endLine),
				"inlayHints",
				signal === undefined ? {} : { signal },
			);

			const hints = result ?? [];

			if (hints.length === 0) {
				return {
					content: [{ type: "text", text: "No inlay hints found" }],
					details: {
						filePath: params.filePath,
						startLine: params.startLine,
						endLine: params.endLine,
						hints: [],
						totalHints: 0,
					} satisfies LspInlayHintsDetails,
				};
			}

			const text = hints.map(formatInlayHint).join("\n");
			return {
				content: [{ type: "text", text }],
				details: {
					filePath: params.filePath,
					startLine: params.startLine,
					endLine: params.endLine,
					hints,
					totalHints: hints.length,
				} satisfies LspInlayHintsDetails,
			};
		} catch (e) {
			const message = handleMissingDependencyError(e);
			if (message) {
				return {
					content: [{ type: "text", text: message }],
					details: {
						filePath: params.filePath,
						startLine: params.startLine,
						endLine: params.endLine,
						hints: [],
						totalHints: 0,
						error: message,
						errorKind: "missing_dependency",
					} satisfies LspInlayHintsDetails,
				};
			}
			throw e;
		}
	},
});
