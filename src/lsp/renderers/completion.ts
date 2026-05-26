import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

import type { LspCompletionDetails } from "../tools/completion.js";
import { shorten } from "../utils.js";
import type { PositionArgs, RenderResultOptions, ResultLike } from "./shared.js";
import { PATH_BUDGET } from "./shared.js";

export function renderCompletionCall(args: PositionArgs, theme: Theme): Text {
	const head = theme.fg("toolTitle", theme.bold("lsp_completion "));
	const loc = theme.fg("accent", `${shorten(args.filePath, PATH_BUDGET)}:${args.line}:${args.character}`);
	return new Text(head + loc, 0, 0);
}

export function renderCompletionResult(
	result: ResultLike<LspCompletionDetails>,
	_options: RenderResultOptions,
	theme: Theme,
): Text {
	const details = result.details;
	if (details?.error) {
		return new Text(theme.fg("warning", details.error.split("\n")[0] ?? "error"), 0, 0);
	}
	if (!details || details.items.length === 0) {
		return new Text(theme.fg("dim", "No completions"), 0, 0);
	}
	const [first] = details.items;
	const label = first?.label ?? "?";
	const more = details.totalItems - 1;
	const resolved = details.resolved > 0 ? theme.fg("dim", ` (${details.resolved} resolved)`) : "";
	const tail = more > 0 ? theme.fg("dim", ` (+${more} more)`) : "";
	return new Text(theme.fg("success", "ⓘ ") + theme.fg("accent", label) + tail + resolved, 0, 0);
}
