import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { withLspClient } from "../client-wrapper.js";
import type { SemanticTokens } from "../types.js";
import { handleMissingDependencyError } from "../utils.js";

const Params = Type.Object({
	filePath: Type.String({ description: "Path to the source file" }),
});

export interface DecodedToken {
	line: number;
	character: number;
	length: number;
	type: number;
	modifiers: number;
}

export interface LspSemanticTokensDetails {
	filePath: string;
	tokens: DecodedToken[];
	totalTokens: number;
	error?: string;
	errorKind?: "missing_dependency";
}

// Semantic tokens are delta-encoded 5-tuples:
// [deltaLine, deltaStartChar, length, tokenType, tokenModifiers]
// Accumulate deltas to get absolute positions.
function decodeSemanticTokens(data: number[]): DecodedToken[] {
	const tokens: DecodedToken[] = [];
	let line = 0;
	let char = 0;
	for (let i = 0; i < data.length; i += 5) {
		const deltaLine = data[i] ?? 0;
		const deltaChar = data[i + 1] ?? 0;
		const len = data[i + 2] ?? 0;
		const type = data[i + 3] ?? 0;
		const mods = data[i + 4] ?? 0;

		// When deltaLine > 0, the character resets to deltaChar.
		// When deltaLine === 0, the character increments by deltaChar.
		line += deltaLine;
		char = deltaLine === 0 ? char + deltaChar : deltaChar;

		tokens.push({ line: line + 1, character: char, length: len, type, modifiers: mods });
	}
	return tokens;
}

function formatToken(token: DecodedToken): string {
	const mods = token.modifiers > 0 ? `(${token.modifiers})` : "";
	return `${token.line}:${token.character} [${token.length}] type=${token.type}${mods}`;
}

export const lsp_semantic_tokens = defineTool({
	name: "lsp_semantic_tokens",
	label: "LSP Semantic Tokens",
	description: "Get semantic token classification for the entire file. Returns decoded token list.",
	parameters: Params,
	async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
		try {
			const result = await withLspClient<SemanticTokens | null>(
				params.filePath,
				async (client) => client.semanticTokensFull(params.filePath),
				"semanticTokens",
				signal === undefined ? {} : { signal },
			);

			if (!result?.data || result.data.length === 0) {
				return {
					content: [{ type: "text", text: "No semantic tokens found" }],
					details: {
						filePath: params.filePath,
						tokens: [],
						totalTokens: 0,
					} satisfies LspSemanticTokensDetails,
				};
			}

			const tokens = decodeSemanticTokens(result.data);
			const text = tokens.map(formatToken).join("\n");
			return {
				content: [{ type: "text", text }],
				details: {
					filePath: params.filePath,
					tokens,
					totalTokens: tokens.length,
				} satisfies LspSemanticTokensDetails,
			};
		} catch (e) {
			const message = handleMissingDependencyError(e);
			if (message) {
				return {
					content: [{ type: "text", text: message }],
					details: {
						filePath: params.filePath,
						tokens: [],
						totalTokens: 0,
						error: message,
						errorKind: "missing_dependency",
					} satisfies LspSemanticTokensDetails,
				};
			}
			throw e;
		}
	},
});
