// Protocol's PrepareRenameResult is: Range | { range, placeholder } | { defaultBehavior: boolean }
// Re-export as-is; consumers that previously used PrepareRenameDefaultBehavior should match
// the { defaultBehavior: boolean } arm of this union.
// Back-compat alias: SymbolInfo was our local name for SymbolInformation
export type {
	CreateFile,
	DeleteFile,
	Diagnostic,
	DocumentSymbol,
	Location,
	LocationLink,
	Position,
	PrepareRenameResult,
	Range,
	RenameFile,
	SymbolInformation,
	SymbolInformation as SymbolInfo,
	TextDocumentEdit,
	TextDocumentIdentifier,
	TextEdit,
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
