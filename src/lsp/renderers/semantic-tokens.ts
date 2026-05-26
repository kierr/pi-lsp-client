import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

import type { LspSemanticTokensDetails } from "../tools/semantic-tokens.js";
import { shorten } from "../utils.js";
import type { RenderResultOptions, ResultLike } from "./shared.js";
import { PATH_BUDGET } from "./shared.js";

interface FileArgs {
	filePath: string;
}

export function renderSemanticTokensCall(args: FileArgs, theme: Theme): Text {
	const head = theme.fg("toolTitle", theme.bold("lsp_semantic_tokens "));
	const loc = theme.fg("accent", shorten(args.filePath, PATH_BUDGET));
	return new Text(head + loc, 0, 0);
}

export function renderSemanticTokensResult(
	result: ResultLike<LspSemanticTokensDetails>,
	_options: RenderResultOptions,
	theme: Theme,
): Text {
	const details = result.details;
	if (details?.error) {
		return new Text(theme.fg("warning", details.error.split("\n")[0] ?? "error"), 0, 0);
	}
	if (!details || details.tokens.length === 0) {
		return new Text(theme.fg("dim", "No semantic tokens"), 0, 0);
	}
	const count = details.totalTokens;
	return new Text(`${theme.fg("success", "🎨 ")}${count} token(s)`, 0, 0);
}
