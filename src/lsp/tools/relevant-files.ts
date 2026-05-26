import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { withLspClient } from "../client-wrapper.js";
import { handleMissingDependencyError } from "../utils.js";

const Params = Type.Object({
	filePath: Type.String({ description: "Path to the source file" }),
});

export interface LspRelevantFilesDetails {
	filePath: string;
	locations: string[];
	error?: string;
	errorKind?: "missing_dependency";
}

export const lsp_relevant_files = defineTool({
	name: "lsp_relevant_files",
	label: "LSP Relevant Files (RubyLSP)",
	description:
		"Find files related to the given file (model→test, controller→views, etc.). " +
		"Returns absolute file paths. RubyLSP custom extension (experimental/goToRelevantFile).",
	parameters: Params,
	async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
		try {
			// relevantFiles() does not call openFile — GoToRelevantFile does Dir.glob,
			// never touches the document store. But withLspClient still needs filePath
			// to locate the workspace root and resolve the server.
			const result = await withLspClient<string[] | null>(
				params.filePath,
				async (client) => client.relevantFiles(params.filePath),
				"relevantFiles",
				signal === undefined ? {} : { signal },
			);

			const locations = result ?? [];

			if (locations.length === 0) {
				return {
					content: [{ type: "text", text: "No related files found" }],
					details: {
						filePath: params.filePath,
						locations: [],
					} satisfies LspRelevantFilesDetails,
				};
			}

			const text = locations.join("\n");
			return {
				content: [{ type: "text", text }],
				details: {
					filePath: params.filePath,
					locations,
				} satisfies LspRelevantFilesDetails,
			};
		} catch (e) {
			const message = handleMissingDependencyError(e);
			if (message) {
				return {
					content: [{ type: "text", text: message }],
					details: {
						filePath: params.filePath,
						locations: [],
						error: message,
						errorKind: "missing_dependency",
					} satisfies LspRelevantFilesDetails,
				};
			}
			throw e;
		}
	},
});
