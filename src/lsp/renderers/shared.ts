import { uriToPath } from "../formatters.js";
import { SYMBOL_KIND_MAP } from "../language-mappings.js";
import type { Location, LocationLink } from "../types.js";
import { shorten } from "../utils.js";

const COLLAPSED_HEAD = 3;
const EXPANDED_HEAD = 20;
const PATH_BUDGET = 80;

interface ResultLike<TDetails> {
	content: ReadonlyArray<{ type: string; text?: string }>;
	details?: TDetails;
}

interface RenderResultOptions {
	expanded?: boolean;
	isPartial?: boolean;
}

interface PositionArgs {
	filePath: string;
	line: number;
	character: number;
}

interface SymbolsArgs {
	filePath: string;
	scope: "document" | "workspace";
	query?: string;
}

interface RenameArgs extends PositionArgs {
	newName: string;
}

interface DiagnosticsArgs {
	filePath: string;
	severity?: string;
}

function locText(loc: Location | LocationLink): string {
	if ("targetUri" in loc) {
		return `${shorten(uriToPath(loc.targetUri), PATH_BUDGET)}:${loc.targetRange.start.line + 1}:${loc.targetRange.start.character}`;
	}
	return `${shorten(uriToPath(loc.uri), PATH_BUDGET)}:${loc.range.start.line + 1}:${loc.range.start.character}`;
}

function diagSeverityKey(severity?: number): "error" | "warning" | "muted" | "dim" {
	switch (severity) {
		case 1:
			return "error";
		case 2:
			return "warning";
		case 3:
			return "muted";
		case 4:
			return "dim";
		default:
			return "muted";
	}
}

function diagSeverityChar(severity?: number): string {
	switch (severity) {
		case 1:
			return "E";
		case 2:
			return "W";
		case 3:
			return "I";
		case 4:
			return "H";
		default:
			return "?";
	}
}

function unique<T>(items: T[], key: (item: T) => string): T[] {
	const seen = new Set<string>();
	const out: T[] = [];
	for (const item of items) {
		const k = key(item);
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(item);
	}
	return out;
}

function symbolKindName(kind: number): string {
	return SYMBOL_KIND_MAP[kind] ?? `Kind(${kind})`;
}

export {
	type ResultLike,
	type RenderResultOptions,
	type PositionArgs,
	type SymbolsArgs,
	type RenameArgs,
	type DiagnosticsArgs,
	COLLAPSED_HEAD,
	EXPANDED_HEAD,
	PATH_BUDGET,
	locText,
	diagSeverityKey,
	diagSeverityChar,
	unique,
	symbolKindName,
};
