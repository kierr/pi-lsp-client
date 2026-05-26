import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { withLspClient } from "../client-wrapper.js";
import type { DocumentLink } from "../types.js";
import { handleMissingDependencyError } from "../utils.js";

const Params = Type.Object({
	filePath: Type.String({ description: "Path to the source file" }),
});

export interface LspDocumentLinksDetails {
	filePath: string;
	links: DocumentLink[];
	totalLinks: number;
	error?: string;
	errorKind?: "missing_dependency";
}

function formatDocumentLink(link: DocumentLink): string {
	const line = link.range.start.line + 1;
	const char = link.range.start.character;
	const target = link.target ?? "(no target)";
	const tooltip = link.tooltip ? ` — ${link.tooltip}` : "";
	return `${line}:${char} → ${target}${tooltip}`;
}

export const lsp_document_links = defineTool({
	name: "lsp_document_links",
	label: "LSP Document Links",
	description: "Find clickable links in a file (e.g., # source: annotations).",
	parameters: Params,
	async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
		try {
			const result = await withLspClient<DocumentLink[] | null>(
				params.filePath,
				async (client) => client.documentLink(params.filePath),
				"documentLink",
				signal === undefined ? {} : { signal },
			);

			const links = result ?? [];

			if (links.length === 0) {
				return {
					content: [{ type: "text", text: "No document links found" }],
					details: {
						filePath: params.filePath,
						links: [],
						totalLinks: 0,
					} satisfies LspDocumentLinksDetails,
				};
			}

			const text = links.map(formatDocumentLink).join("\n");
			return {
				content: [{ type: "text", text }],
				details: {
					filePath: params.filePath,
					links,
					totalLinks: links.length,
				} satisfies LspDocumentLinksDetails,
			};
		} catch (e) {
			const message = handleMissingDependencyError(e);
			if (message) {
				return {
					content: [{ type: "text", text: message }],
					details: {
						filePath: params.filePath,
						links: [],
						totalLinks: 0,
						error: message,
						errorKind: "missing_dependency",
					} satisfies LspDocumentLinksDetails,
				};
			}
			throw e;
		}
	},
});
