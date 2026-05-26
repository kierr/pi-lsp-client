// Protocol's PrepareRenameResult is: Range | { range, placeholder } | { defaultBehavior: boolean }
// Re-export as-is; consumers that previously used PrepareRenameDefaultBehavior should match
// the { defaultBehavior: boolean } arm of this union.
// Back-compat alias: SymbolInfo was our local name for SymbolInformation
export type {
	CodeAction,
	CodeActionKind,
	CodeLens,
	Command,
	CompletionItem,
	CompletionItemKind,
	CompletionList,
	CreateFile,
	DeleteFile,
	Diagnostic,
	DocumentLink,
	DocumentSymbol,
	FormattingOptions,
	Hover,
	InlayHint,
	InlayHintKind,
	Location,
	LocationLink,
	MarkupContent,
	MarkupKind,
	ParameterInformation,
	Position,
	PrepareRenameResult,
	Range,
	RenameFile,
	SemanticTokens,
	SignatureHelp,
	SignatureInformation,
	SymbolInformation,
	SymbolInformation as SymbolInfo,
	TextDocumentEdit,
	TextDocumentIdentifier,
	TextEdit,
	TypeHierarchyItem,
	VersionedTextDocumentIdentifier,
	WorkspaceEdit,
} from "vscode-languageserver-protocol";

export interface LspServerConfig {
	id: string;
	command: string[];
	extensions: string[];
	disabled?: boolean;
	env?: Record<string, string>;
	initialization?: Record<string, unknown>;
}

export interface ResolvedServer {
	id: string;
	command: string[];
	extensions: string[];
	priority: number;
	env?: Record<string, string>;
	initialization?: Record<string, unknown>;
}

export interface ServerLookupInfo {
	id: string;
	command: string[];
	extensions: string[];
}

export type ServerLookupResult =
	| { status: "found"; server: ResolvedServer }
	| { status: "not_configured"; extension: string; availableServers: string[] }
	| { status: "not_installed"; server: ServerLookupInfo; installHint: string };

export type SeverityFilter = "error" | "warning" | "information" | "hint" | "all";

// ── RubyLSP custom types (not in vscode-languageserver-protocol) ──────

/** Typed subset of the LSP initialize response. Fields without consumers are omitted. */
export interface LspInitializeResult {
	formatter?: string;
	degraded_mode?: boolean;
	serverInfo?: { name?: string; version?: string };
}

export interface RubyAddon {
	name: string;
	errored: boolean;
	version?: string;
}

export interface RubyDependency {
	name: string;
	version: string;
	source?: string;
	isGemspec: boolean;
}

export interface RubyTestItem {
	id: string;
	label: string;
	uri: string;
	children: RubyTestItem[];
	type: "class" | "method" | string;
	range?: import("vscode-languageserver-protocol").Range;
}
