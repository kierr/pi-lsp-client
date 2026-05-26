import { pathToFileURL } from "node:url";

import { LspClientTransport } from "./transport.js";
import type { LspInitializeResult } from "./types.js";

const INITIALIZE_SETTLE_MS = 300;

export class LspClientConnection extends LspClientTransport {
	public formatter?: string | undefined;
	public serverVersion?: string | undefined;
	public degradedMode = false;

	async initialize(): Promise<void> {
		const rootUri = pathToFileURL(this.root).href;
		const result = await this.sendRequest<LspInitializeResult>("initialize", {
			processId: process.pid,
			rootUri,
			rootPath: this.root,
			workspaceFolders: [{ uri: rootUri, name: "workspace" }],
			capabilities: {
				textDocument: {
					hover: { contentFormat: ["markdown", "plaintext"] },
					definition: { linkSupport: true },
					references: {},
					documentSymbol: { hierarchicalDocumentSymbolSupport: true },
					publishDiagnostics: {},
					rename: {
						prepareSupport: true,
						prepareSupportDefaultBehavior: 1,
						honorsChangeAnnotations: true,
					},
					completion: {
						completionItem: {
							snippetSupport: false,
							resolveSupport: {
								properties: ["documentation", "detail", "additionalTextEdits"],
							},
						},
					},
					signatureHelp: {
						signatureInformation: { documentationFormat: ["markdown", "plaintext"] },
					},
					documentLink: { tooltipSupport: true },
					codeLens: {},
					inlayHint: {
						resolveSupport: { properties: ["tooltip", "textEdits", "label"] },
					},
					formatting: {},
					rangeFormatting: {},
					semanticTokens: { full: true, delta: false, range: false },
					typeHierarchy: {},
					codeAction: {
						codeActionLiteralSupport: {
							codeActionKind: {
								valueSet: [
									"quickfix",
									"refactor",
									"refactor.extract",
									"refactor.inline",
									"refactor.rewrite",
									"source",
									"source.organizeImports",
									"source.fixAll",
								],
							},
						},
						isPreferredSupport: true,
						disabledSupport: true,
						dataSupport: true,
						resolveSupport: {
							properties: ["edit", "command"],
						},
					},
				},
				workspace: {
					symbol: {},
					workspaceFolders: true,
					configuration: true,
					applyEdit: true,
					workspaceEdit: {
						documentChanges: true,
					},
				},
			},
			initializationOptions: this.server.initialization,
		});
		this.formatter = result.formatter;
		this.serverVersion = result.serverInfo?.version;
		this.degradedMode = result.degraded_mode ?? false;
		if (this.degradedMode) {
			// Surface degraded state immediately so the agent knows the server may
			// return incomplete results, rather than discovering this only when calling
			// lsp_addons or noticing missing features.
			this.stderrBuffer.push(
				"[pi-lsp-client] WARNING: RubyLSP started in degraded mode — some features may be unavailable\n",
			);
		}
		await this.sendNotification("initialized");
		await this.sendNotification("workspace/didChangeConfiguration", {
			settings: { json: { validate: { enable: true } } },
		});
		// Some servers accept initialized before their diagnostics/indexing handlers are ready.
		await new Promise((r) => setTimeout(r, INITIALIZE_SETTLE_MS));
	}
}
