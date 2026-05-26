import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

import type { LspShowSyntaxTreeDetails } from "../tools/show-syntax-tree.js";
import { shorten } from "../utils.js";
import type { RenderResultOptions, ResultLike } from "./shared.js";
import { PATH_BUDGET } from "./shared.js";

interface SyntaxTreeArgs {
	filePath: string;
	startLine?: number;
	startCharacter?: number;
	endLine?: number;
	endCharacter?: number;
}

export function renderShowSyntaxTreeCall(args: SyntaxTreeArgs, theme: Theme): Text {
	const head = theme.fg("toolTitle", theme.bold("lsp_show_syntax_tree "));
	const loc = theme.fg("accent", shorten(args.filePath, PATH_BUDGET));
	return new Text(head + loc, 0, 0);
}

export function renderShowSyntaxTreeResult(
	result: ResultLike<LspShowSyntaxTreeDetails>,
	_options: RenderResultOptions,
	theme: Theme,
): Text {
	const details = result.details;
	if (details?.error) {
		return new Text(theme.fg("warning", details.error.split("\n")[0] ?? "error"), 0, 0);
	}
	if (!details || !details.ast) {
		return new Text(theme.fg("dim", "No syntax tree"), 0, 0);
	}
	const len = details.ast.length;
	return new Text(`${theme.fg("success", "🌳 ")}AST (${len} chars)`, 0, 0);
}
