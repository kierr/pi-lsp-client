import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { withLspClient } from "../client-wrapper.js";
import type { SignatureHelp, SignatureInformation } from "../types.js";
import { handleMissingDependencyError } from "../utils.js";

const Params = Type.Object({
	filePath: Type.String({ description: "Path to the source file" }),
	line: Type.Number({ description: "1-based line number" }),
	character: Type.Number({ description: "0-based column on that line" }),
});

export interface LspSignatureHelpDetails {
	filePath: string;
	line: number;
	character: number;
	signatures: SignatureInformation[];
	activeSignature: number | null;
	activeParameter: number | null;
	error?: string;
	errorKind?: "missing_dependency";
}

function formatSignature(sig: SignatureInformation, activeParameter: number | null): string {
	const label = sig.label;
	const docs = sig.documentation
		? typeof sig.documentation === "string"
			? sig.documentation
			: "value" in sig.documentation
				? sig.documentation.value
				: ""
		: "";

	if (activeParameter !== null && activeParameter >= 0 && sig.parameters) {
		const params = sig.parameters;
		const parts: string[] = [];
		for (let i = 0; i < params.length; i++) {
			const p = params[i];
			const pLabel = p && typeof p.label === "string" ? p.label : `param${i}`;
			parts.push(i === activeParameter ? `»${pLabel}«` : pLabel);
		}
		return `${label}\n  Parameters: ${parts.join(", ")}${docs ? `\n  ${docs}` : ""}`;
	}

	return `${label}${docs ? `\n  ${docs}` : ""}`;
}

export const lsp_signature_help = defineTool({
	name: "lsp_signature_help",
	label: "LSP Signature Help",
	description: "Get parameter hints and method signatures at a position.",
	parameters: Params,
	async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
		try {
			const result = await withLspClient<SignatureHelp | null>(
				params.filePath,
				async (client) => client.signatureHelp(params.filePath, params.line, params.character),
				"signatureHelp",
				signal === undefined ? {} : { signal },
			);

			if (!result || !result.signatures || result.signatures.length === 0) {
				return {
					content: [{ type: "text", text: "No signature help available" }],
					details: {
						filePath: params.filePath,
						line: params.line,
						character: params.character,
						signatures: [],
						activeSignature: null,
						activeParameter: null,
					} satisfies LspSignatureHelpDetails,
				};
			}

			const activeIdx = result.activeSignature ?? 0;
			const activeParam = result.activeParameter ?? null;
			const activeSig = result.signatures[activeIdx];

			const lines: string[] = [];
			if (activeSig) {
				lines.push(`Active signature:`);
				lines.push(formatSignature(activeSig, activeParam));
			}

			if (result.signatures.length > 1) {
				lines.push(`\nOther signatures (${result.signatures.length - 1}):`);
				for (let i = 0; i < result.signatures.length; i++) {
					if (i !== activeIdx) {
						lines.push(`  ${formatSignature(result.signatures[i] as SignatureInformation, null)}`);
					}
				}
			}

			return {
				content: [{ type: "text", text: lines.join("\n") }],
				details: {
					filePath: params.filePath,
					line: params.line,
					character: params.character,
					signatures: result.signatures,
					activeSignature: activeIdx,
					activeParameter: activeParam,
				} satisfies LspSignatureHelpDetails,
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
						signatures: [],
						activeSignature: null,
						activeParameter: null,
						error: message,
						errorKind: "missing_dependency",
					} satisfies LspSignatureHelpDetails,
				};
			}
			throw e;
		}
	},
});
