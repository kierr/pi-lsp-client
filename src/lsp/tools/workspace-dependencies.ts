import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { withLspClient } from "../client-wrapper.js";
import type { RubyDependency } from "../types.js";
import { handleMissingDependencyError } from "../utils.js";

const Params = Type.Object({
	filePath: Type.String({
		description: "Path to any Ruby file in the workspace (used to locate the workspace root for the LSP server)",
	}),
});

export interface LspWorkspaceDependenciesDetails {
	dependencies: RubyDependency[];
	total: number;
	error?: string;
	errorKind?: "missing_dependency";
}

function formatDependency(dep: RubyDependency): string {
	const source = dep.source ? ` (${dep.source})` : "";
	const gemspec = dep.isGemspec ? " [gemspec]" : "";
	return `${dep.name} ${dep.version}${source}${gemspec}`;
}

export const lsp_workspace_dependencies = defineTool({
	name: "lsp_workspace_dependencies",
	label: "LSP Workspace Dependencies (RubyLSP)",
	description: "List gem dependencies for the workspace. RubyLSP custom extension.",
	parameters: Params,
	async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
		try {
			// withLspClient needs a filePath to locate the server and workspace root.
			// The actual workspaceDependencies() call doesn't use the file, but the
			// client lifecycle does.
			const result = await withLspClient<RubyDependency[] | null>(
				params.filePath,
				async (client) => client.workspaceDependencies(),
				"workspaceDependencies",
				signal === undefined ? {} : { signal },
			);

			const dependencies = result ?? [];

			if (dependencies.length === 0) {
				return {
					content: [{ type: "text", text: "No dependencies found" }],
					details: {
						dependencies: [],
						total: 0,
					} satisfies LspWorkspaceDependenciesDetails,
				};
			}

			const text = dependencies.map(formatDependency).join("\n");
			return {
				content: [{ type: "text", text }],
				details: {
					dependencies,
					total: dependencies.length,
				} satisfies LspWorkspaceDependenciesDetails,
			};
		} catch (e) {
			const message = handleMissingDependencyError(e);
			if (message) {
				return {
					content: [{ type: "text", text: message }],
					details: {
						dependencies: [],
						total: 0,
						error: message,
						errorKind: "missing_dependency",
					} satisfies LspWorkspaceDependenciesDetails,
				};
			}
			throw e;
		}
	},
});
