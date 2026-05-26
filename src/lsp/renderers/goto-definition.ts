import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

import type { LspGotoDefinitionDetails } from "../tools/goto-definition.js";
import { shorten } from "../utils.js";
import type { PositionArgs, RenderResultOptions, ResultLike } from "./shared.js";
import { locText, PATH_BUDGET } from "./shared.js";

export function renderGotoDefinitionCall(args: PositionArgs, theme: Theme): Text {
	const head = theme.fg("toolTitle", theme.bold("lsp_goto_definition "));
	const loc = theme.fg("accent", `${shorten(args.filePath, PATH_BUDGET)}:${args.line}:${args.character}`);
	return new Text(head + loc, 0, 0);
}

export function renderGotoDefinitionResult(
	result: ResultLike<LspGotoDefinitionDetails>,
	_options: RenderResultOptions,
	theme: Theme,
): Text {
	const details = result.details;
	if (details?.error) {
		return new Text(theme.fg("warning", details.error.split("\n")[0] ?? "error"), 0, 0);
	}
	if (!details || details.locations.length === 0) {
		return new Text(theme.fg("dim", "No definition found"), 0, 0);
	}
	const [head] = details.locations;
	if (!head) {
		return new Text(theme.fg("dim", "No definition found"), 0, 0);
	}
	const more = details.locations.length - 1;
	const headStr = theme.fg("success", "→ ") + theme.fg("accent", locText(head));
	const tail = more > 0 ? theme.fg("dim", ` (+${more} more)`) : "";
	return new Text(headStr + tail, 0, 0);
}
