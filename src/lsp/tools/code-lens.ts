import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { withLspClient } from "../client-wrapper.js";
import type { CodeLens } from "../types.js";
import { handleMissingDependencyError } from "../utils.js";

const Params = Type.Object({
	filePath: Type.String({ description: "Path to the source file" }),
	resolve: Type.Optional(Type.Boolean({ description: "Resolve lenses for full command details (default: false)" })),
});

export interface LspCodeLensDetails {
	filePath: string;
	lenses: CodeLens[];
	resolved: number;
	error?: string;
	errorKind?: "missing_dependency";
}

function formatCodeLens(lens: CodeLens): string {
	const line = lens.range.start.line + 1;
	const char = lens.range.start.character;
	const title = lens.command?.title ?? "(no command)";
	return `L${line}:${char} ${title}`;
}

export const lsp_code_lens = defineTool({
	name: "lsp_code_lens",
	label: "LSP Code Lens",
	description: "Get code lens items (test run/debug buttons, etc.).",
	parameters: Params,
	async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
		try {
			const result = await withLspClient<CodeLens[] | null>(
				params.filePath,
				async (client) => client.codeLens(params.filePath),
				"codeLens",
				signal === undefined ? {} : { signal },
			);

			const lenses = result ?? [];
			let resolved = 0;

			// Optionally resolve each lens for full command details.
			if (params.resolve && lenses.length > 0) {
				const resolvedLenses = await withLspClient<CodeLens[]>(
					params.filePath,
					async (client) => {
						const out: CodeLens[] = [];
						for (const lens of lenses) {
							try {
								const resolvedLens = await client.codeLensResolve(lens);
								out.push(resolvedLens);
								resolved++;
							} catch {
								// Resolution is best-effort — use the unresolved lens.
								out.push(lens);
							}
						}
						return out;
					},
					"codeLens",
					signal === undefined ? {} : { signal },
				);
				lenses.length = 0;
				lenses.push(...resolvedLenses);
			}

			if (lenses.length === 0) {
				return {
					content: [{ type: "text", text: "No code lenses found" }],
					details: {
						filePath: params.filePath,
						lenses: [],
						resolved: 0,
					} satisfies LspCodeLensDetails,
				};
			}

			const text = lenses.map(formatCodeLens).join("\n");
			return {
				content: [{ type: "text", text }],
				details: {
					filePath: params.filePath,
					lenses,
					resolved,
				} satisfies LspCodeLensDetails,
			};
		} catch (e) {
			const message = handleMissingDependencyError(e);
			if (message) {
				return {
					content: [{ type: "text", text: message }],
					details: {
						filePath: params.filePath,
						lenses: [],
						resolved: 0,
						error: message,
						errorKind: "missing_dependency",
					} satisfies LspCodeLensDetails,
				};
			}
			throw e;
		}
	},
});
