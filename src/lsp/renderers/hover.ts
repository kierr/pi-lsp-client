import type { Theme } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import type { LspHoverDetails } from "../tools/hover.js";
import { shorten } from "../utils.js";
import type { PositionArgs, RenderResultOptions, ResultLike } from "./shared.js";
import { PATH_BUDGET } from "./shared.js";

export function renderHoverCall(args: PositionArgs, theme: Theme): Text {
	const head = theme.fg("toolTitle", theme.bold("lsp_hover "));
	const loc = theme.fg("accent", `${shorten(args.filePath, PATH_BUDGET)}:${args.line}:${args.character}`);
	return new Text(head + loc, 0, 0);
}

export function renderHoverResult(
	result: ResultLike<LspHoverDetails>,
	_options: RenderResultOptions,
	theme: Theme,
): Text {
	const details = result.details;
	if (details?.error) {
		return new Text(theme.fg("warning", details.error.split("\n")[0] ?? "error"), 0, 0);
	}
	if (!details || !details.hover || details.contents.length === 0) {
		return new Text(theme.fg("dim", "No hover info"), 0, 0);
	}
	const text = details.contents.join(" ");
	const preview = text.length > 200 ? `${text.slice(0, 197)}...` : text;
	return new Text(theme.fg("success", "ⓘ ") + theme.fg("muted", preview.split("\n")[0] ?? ""), 0, 0);
}
