import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { withLspClient } from "../client-wrapper.js";
import type { RubyAddon } from "../types.js";
import { handleMissingDependencyError } from "../utils.js";

const Params = Type.Object({
	filePath: Type.String({
		description: "Path to any Ruby file in the workspace (used to locate the workspace root for the LSP server)",
	}),
});

export interface LspAddonsDetails {
	addons: RubyAddon[];
	formatter?: string | undefined;
	serverVersion?: string | undefined;
	degradedMode: boolean;
	error?: string;
	errorKind?: "missing_dependency";
}

function formatAddon(addon: RubyAddon): string {
	const version = addon.version ? `@${addon.version}` : "";
	const errored = addon.errored ? " [ERRORED]" : "";
	return `${addon.name}${version}${errored}`;
}

export const lsp_addons = defineTool({
	name: "lsp_addons",
	label: "LSP Addons (RubyLSP)",
	description:
		"List active RubyLSP addons (e.g., ruby-lsp-rails). Shows addon name, version, and error status. " +
		"Also shows server metadata (formatter, version, degraded mode).",
	parameters: Params,
	async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
		try {
			// withLspClient needs a filePath to locate the server and workspace root.
			// The actual addons() call is workspace-level and doesn't use the file.
			const { addons: addonList, clientInfo } = await withLspClient<{
				addons: RubyAddon[] | null;
				clientInfo: { formatter?: string | undefined; serverVersion?: string | undefined; degradedMode: boolean };
			}>(
				params.filePath,
				async (client) => ({
					addons: await client.addons(),
					clientInfo: {
						formatter: client.formatter,
						serverVersion: client.serverVersion,
						degradedMode: client.degradedMode,
					},
				}),
				"addons",
				signal === undefined ? {} : { signal },
			);

			const addons = addonList ?? [];
			const { formatter, serverVersion, degradedMode } = clientInfo;

			const headerParts: string[] = [];
			if (formatter) headerParts.push(`Formatter: ${formatter}`);
			if (serverVersion) headerParts.push(`Server: ruby-lsp ${serverVersion}`);
			if (degradedMode) headerParts.push("Mode: DEGRADED");

			const lines: string[] = [];
			if (headerParts.length > 0) {
				lines.push(headerParts.join(" | "));
				lines.push("");
			}

			if (addons.length === 0) {
				lines.push("No addons detected");
			} else {
				for (const addon of addons) {
					lines.push(formatAddon(addon));
				}
			}

			return {
				content: [{ type: "text", text: lines.join("\n") }],
				details: {
					addons,
					formatter,
					serverVersion,
					degradedMode,
				} satisfies LspAddonsDetails,
			};
		} catch (e) {
			const message = handleMissingDependencyError(e);
			if (message) {
				return {
					content: [{ type: "text", text: message }],
					details: {
						addons: [],
						degradedMode: false,
						error: message,
						errorKind: "missing_dependency",
					} satisfies LspAddonsDetails,
				};
			}
			throw e;
		}
	},
});
