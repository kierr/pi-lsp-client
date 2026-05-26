import { readFileSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { LspClientConnection } from "./connection.js";
import { getLanguageId } from "./language-mappings.js";
import type {
	CodeAction,
	CodeLens,
	Command,
	CompletionItem,
	CompletionList,
	Diagnostic,
	DocumentLink,
	DocumentSymbol,
	FormattingOptions,
	Hover,
	InlayHint,
	Location,
	LocationLink,
	PrepareRenameResult,
	Range,
	RubyAddon,
	RubyDependency,
	RubyTestItem,
	SemanticTokens,
	SignatureHelp,
	SymbolInfo,
	TextEdit,
	TypeHierarchyItem,
	WorkspaceEdit,
} from "./types.js";

const POST_OPEN_DELAY_MS = 1000;
const POST_DIAGNOSTICS_WAIT_MS = 500;
const MAX_DIAGNOSTIC_PULL_ERRORS = 50;

export class LspClient extends LspClientConnection {
	private readonly openedFiles = new Set<string>();
	private readonly documentVersions = new Map<string, number>();
	private readonly lastSyncedText = new Map<string, string>();
	// Cache file mtimes to skip re-reading unchanged files on subsequent openFile calls.
	private readonly lastSyncedMtime = new Map<string, number>();
	private readonly diagnosticPullErrors: Error[] = [];

	getDiagnosticPullErrors(): readonly Error[] {
		return this.diagnosticPullErrors;
	}

	async openFile(filePath: string): Promise<void> {
		const absPath = resolve(filePath);
		const uri = pathToFileURL(absPath).href;

		if (!this.openedFiles.has(absPath)) {
			const text = readFileSync(absPath, "utf-8");
			const ext = extname(absPath);
			const languageId = getLanguageId(ext);
			const version = 1;

			await this.sendNotification("textDocument/didOpen", {
				textDocument: {
					uri,
					languageId,
					version,
					text,
				},
			});

			this.openedFiles.add(absPath);
			this.documentVersions.set(uri, version);
			this.lastSyncedText.set(uri, text);
			// Cache mtime to avoid re-reading the file if it hasn't changed.
			try {
				this.lastSyncedMtime.set(uri, statSync(absPath).mtimeMs);
			} catch {
				/* empty */
			}
			await new Promise((r) => setTimeout(r, POST_OPEN_DELAY_MS));
			return;
		}

		// Already-opened file: check mtime before re-reading to avoid unnecessary I/O.
		try {
			const currentMtime = statSync(absPath).mtimeMs;
			if (this.lastSyncedMtime.get(uri) === currentMtime) return;
			this.lastSyncedMtime.set(uri, currentMtime);
		} catch {
			/* empty */
		}

		const text = readFileSync(absPath, "utf-8");
		const prevText = this.lastSyncedText.get(uri);
		if (prevText === text) {
			return;
		}

		const nextVersion = (this.documentVersions.get(uri) ?? 1) + 1;
		this.documentVersions.set(uri, nextVersion);
		this.lastSyncedText.set(uri, text);

		await this.sendNotification("textDocument/didChange", {
			textDocument: { uri, version: nextVersion },
			contentChanges: [{ text }],
		});

		await this.sendNotification("textDocument/didSave", {
			textDocument: { uri },
			text,
		});
	}

	// ── Existing methods ──────────────────────────────────────────────────

	async definition(
		filePath: string,
		line: number,
		character: number,
	): Promise<Location | LocationLink | Array<Location | LocationLink> | null> {
		const absPath = resolve(filePath);
		await this.openFile(absPath);
		return this.sendRequest<Location | LocationLink | Array<Location | LocationLink> | null>(
			"textDocument/definition",
			{
				textDocument: { uri: pathToFileURL(absPath).href },
				position: { line: line - 1, character },
			},
		);
	}

	async references(filePath: string, line: number, character: number, includeDeclaration = true): Promise<Location[]> {
		const absPath = resolve(filePath);
		await this.openFile(absPath);
		return this.sendRequest<Location[]>("textDocument/references", {
			textDocument: { uri: pathToFileURL(absPath).href },
			position: { line: line - 1, character },
			context: { includeDeclaration },
		});
	}

	async documentSymbols(filePath: string): Promise<Array<DocumentSymbol | SymbolInfo>> {
		const absPath = resolve(filePath);
		await this.openFile(absPath);
		return this.sendRequest<Array<DocumentSymbol | SymbolInfo>>("textDocument/documentSymbol", {
			textDocument: { uri: pathToFileURL(absPath).href },
		});
	}

	async workspaceSymbols(query: string): Promise<SymbolInfo[]> {
		return this.sendRequest<SymbolInfo[]>("workspace/symbol", { query });
	}

	private isUnsupportedDiagnosticPullError(error: unknown): boolean {
		if (!(error instanceof Error)) return false;
		const code = "code" in error && typeof error.code === "number" ? error.code : undefined;
		if (code === -32601) return true;
		return /unsupported|not supported|method not found|unknown request/i.test(error.message);
	}

	async diagnostics(filePath: string): Promise<{ items: Diagnostic[] }> {
		const absPath = resolve(filePath);
		const uri = pathToFileURL(absPath).href;
		await this.openFile(absPath);
		await new Promise((r) => setTimeout(r, POST_DIAGNOSTICS_WAIT_MS));

		try {
			const result = await this.sendRequest<{ items?: Diagnostic[] }>("textDocument/diagnostic", {
				textDocument: { uri },
			});
			if (result.items) {
				return { items: result.items };
			}
		} catch (error) {
			if (!this.isUnsupportedDiagnosticPullError(error)) {
				// Cap to prevent unbounded growth over long sessions.
				if (this.diagnosticPullErrors.length < MAX_DIAGNOSTIC_PULL_ERRORS) {
					this.diagnosticPullErrors.push(error instanceof Error ? error : new Error(String(error)));
				}
			}
		}

		return { items: this.getStoredDiagnostics(uri) };
	}

	async prepareRename(filePath: string, line: number, character: number): Promise<PrepareRenameResult | null> {
		const absPath = resolve(filePath);
		await this.openFile(absPath);
		return this.sendRequest<PrepareRenameResult | null>("textDocument/prepareRename", {
			textDocument: { uri: pathToFileURL(absPath).href },
			position: { line: line - 1, character },
		});
	}

	async rename(filePath: string, line: number, character: number, newName: string): Promise<WorkspaceEdit | null> {
		const absPath = resolve(filePath);
		await this.openFile(absPath);
		return this.sendRequest<WorkspaceEdit | null>("textDocument/rename", {
			textDocument: { uri: pathToFileURL(absPath).href },
			position: { line: line - 1, character },
			newName,
		});
	}

	// ── New LSP methods ──────────────────────────────────────────────────

	async hover(filePath: string, line: number, character: number): Promise<Hover | null> {
		const absPath = resolve(filePath);
		await this.openFile(absPath);
		return this.sendRequest<Hover | null>("textDocument/hover", {
			textDocument: { uri: pathToFileURL(absPath).href },
			position: { line: line - 1, character },
		});
	}

	async completion(filePath: string, line: number, character: number): Promise<CompletionList | null> {
		const absPath = resolve(filePath);
		await this.openFile(absPath);
		return this.sendRequest<CompletionList | null>("textDocument/completion", {
			textDocument: { uri: pathToFileURL(absPath).href },
			position: { line: line - 1, character },
		});
	}

	async completionResolve(item: CompletionItem): Promise<CompletionItem> {
		return this.sendRequest<CompletionItem>("completionItem/resolve", item);
	}

	async signatureHelp(filePath: string, line: number, character: number): Promise<SignatureHelp | null> {
		const absPath = resolve(filePath);
		await this.openFile(absPath);
		return this.sendRequest<SignatureHelp | null>("textDocument/signatureHelp", {
			textDocument: { uri: pathToFileURL(absPath).href },
			position: { line: line - 1, character },
		});
	}

	async codeActions(
		filePath: string,
		line: number,
		character: number,
		range?: { endLine: number; endCharacter: number },
		only?: string[],
	): Promise<Array<CodeAction | Command> | null> {
		const absPath = resolve(filePath);
		await this.openFile(absPath);
		const rangeParam: Range = range
			? {
					start: { line: line - 1, character },
					end: { line: range.endLine - 1, character: range.endCharacter },
				}
			: { start: { line: line - 1, character }, end: { line: line - 1, character } };
		return this.sendRequest<Array<CodeAction | Command> | null>("textDocument/codeAction", {
			textDocument: { uri: pathToFileURL(absPath).href },
			range: rangeParam,
			context: {
				diagnostics: [],
				only: only ?? undefined,
			},
		});
	}

	async codeActionResolve(action: CodeAction): Promise<CodeAction> {
		return this.sendRequest<CodeAction>("codeAction/resolve", action);
	}

	async formatting(filePath: string, options?: FormattingOptions): Promise<TextEdit[] | null> {
		const absPath = resolve(filePath);
		await this.openFile(absPath);
		return this.sendRequest<TextEdit[] | null>("textDocument/formatting", {
			textDocument: { uri: pathToFileURL(absPath).href },
			options: options ?? { tabSize: 2, insertSpaces: true },
		});
	}

	async rangeFormatting(filePath: string, range: Range, options?: FormattingOptions): Promise<TextEdit[] | null> {
		const absPath = resolve(filePath);
		await this.openFile(absPath);
		return this.sendRequest<TextEdit[] | null>("textDocument/rangeFormatting", {
			textDocument: { uri: pathToFileURL(absPath).href },
			range,
			options: options ?? { tabSize: 2, insertSpaces: true },
		});
	}

	async documentLink(filePath: string): Promise<DocumentLink[] | null> {
		const absPath = resolve(filePath);
		await this.openFile(absPath);
		return this.sendRequest<DocumentLink[] | null>("textDocument/documentLink", {
			textDocument: { uri: pathToFileURL(absPath).href },
		});
	}

	async codeLens(filePath: string): Promise<CodeLens[] | null> {
		const absPath = resolve(filePath);
		await this.openFile(absPath);
		return this.sendRequest<CodeLens[] | null>("textDocument/codeLens", {
			textDocument: { uri: pathToFileURL(absPath).href },
		});
	}

	async codeLensResolve(lens: CodeLens): Promise<CodeLens> {
		return this.sendRequest<CodeLens>("codeLens/resolve", lens);
	}

	async inlayHints(filePath: string, startLine: number, endLine: number): Promise<InlayHint[] | null> {
		const absPath = resolve(filePath);
		await this.openFile(absPath);
		return this.sendRequest<InlayHint[] | null>("textDocument/inlayHint", {
			textDocument: { uri: pathToFileURL(absPath).href },
			range: {
				start: { line: startLine - 1, character: 0 },
				end: { line: endLine - 1, character: 0 },
			},
		});
	}

	async semanticTokensFull(filePath: string): Promise<SemanticTokens | null> {
		const absPath = resolve(filePath);
		await this.openFile(absPath);
		return this.sendRequest<SemanticTokens | null>("textDocument/semanticTokens/full", {
			textDocument: { uri: pathToFileURL(absPath).href },
		});
	}

	async prepareTypeHierarchy(filePath: string, line: number, character: number): Promise<TypeHierarchyItem[] | null> {
		const absPath = resolve(filePath);
		await this.openFile(absPath);
		return this.sendRequest<TypeHierarchyItem[] | null>("textDocument/prepareTypeHierarchy", {
			textDocument: { uri: pathToFileURL(absPath).href },
			position: { line: line - 1, character },
		});
	}

	async typeHierarchySupertypes(item: TypeHierarchyItem): Promise<TypeHierarchyItem[] | null> {
		return this.sendRequest<TypeHierarchyItem[] | null>("typeHierarchy/supertypes", { item });
	}

	// ── RubyLSP custom methods ──────────────────────────────────────────

	async showSyntaxTree(
		filePath: string,
		range?: { startLine: number; startCharacter: number; endLine: number; endCharacter: number },
	): Promise<{ ast: string } | null> {
		const absPath = resolve(filePath);
		await this.openFile(absPath);
		return this.sendRequest<{ ast: string } | null>("rubyLsp/textDocument/showSyntaxTree", {
			textDocument: { uri: pathToFileURL(absPath).href },
			...(range
				? {
						range: {
							start: { line: range.startLine - 1, character: range.startCharacter },
							end: { line: range.endLine - 1, character: range.endCharacter },
						},
					}
				: {}),
		});
	}

	async workspaceDependencies(): Promise<RubyDependency[] | null> {
		return this.sendRequest<RubyDependency[] | null>("rubyLsp/workspace/dependencies", {});
	}

	async discoverTests(filePath: string): Promise<RubyTestItem[] | null> {
		const absPath = resolve(filePath);
		await this.openFile(absPath);
		return this.sendRequest<RubyTestItem[] | null>("rubyLsp/discoverTests", {
			textDocument: { uri: pathToFileURL(absPath).href },
		});
	}

	async resolveTestCommands(items: Array<{ uri: string; id: string }>): Promise<{ commands: string[] } | null> {
		return this.sendRequest<{ commands: string[] } | null>("rubyLsp/resolveTestCommands", {
			items,
		});
	}

	// ── VS Code RubyLSP extension ports ──────────────────────────────────

	// GoToRelevantFile does Dir.glob — never touches the document store.
	// No openFile needed; calling it would cost 1000ms for nothing.
	async relevantFiles(filePath: string): Promise<string[] | null> {
		const absPath = resolve(filePath);
		const result = await this.sendRequest<{ locations: string[] } | null>("experimental/goToRelevantFile", {
			textDocument: { uri: pathToFileURL(absPath).href },
		});
		return result?.locations ?? null;
	}

	// Workspace-level request — no openFile. filePath only used for server
	// resolution via withLspClient. Same pattern as workspaceDependencies().
	async addons(): Promise<RubyAddon[] | null> {
		return this.sendRequest<RubyAddon[] | null>("rubyLsp/workspace/addons", {});
	}
}
