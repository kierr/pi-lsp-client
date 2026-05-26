import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

import type { LspCodeActionsDetails } from "../tools/code-actions.js";
import { shorten } from "../utils.js";
import type { PositionArgs, RenderResultOptions, ResultLike } from "./shared.js";
import { PATH_BUDGET } from "./shared.js";

export function renderCodeActionsCall(args: PositionArgs, theme: Theme): Text {
	const head = theme.fg("toolTitle", theme.bold("lsp_code_actions "));
	const loc = theme.fg("accent", `${shorten(args.filePath, PATH_BUDGET)}:${args.line}:${args.character}`);
	return new Text(head + loc, 0, 0);
}

export function renderCodeActionsResult(
	result: ResultLike<LspCodeActionsDetails>,
	_options: RenderResultOptions,
	theme: Theme,
): Text {
	const details = result.details;
	if (details?.error) {
		return new Text(theme.fg("warning", details.error.split("\n")[0] ?? "error"), 0, 0);
	}
	if (!details || details.actions.length === 0) {
		return new Text(theme.fg("dim", "No code actions"), 0, 0);
	}
	const [first] = details.actions;
	const title = first?.title ?? "?";
	const more = details.actions.length - 1;
	const applied = details.applied ? theme.fg("success", " ✓") : "";
	const tail = more > 0 ? theme.fg("dim", ` (+${more} more)`) : "";
	return new Text(theme.fg("success", "⚡ ") + theme.fg("accent", title) + tail + applied, 0, 0);
}
