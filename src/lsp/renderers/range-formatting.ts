import type { Theme } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import type { LspRangeFormattingDetails } from "../tools/range-formatting.js";
import { shorten } from "../utils.js";
import type { PositionArgs, RenderResultOptions, ResultLike } from "./shared.js";
import { PATH_BUDGET } from "./shared.js";

interface RangeFormattingArgs extends PositionArgs {
	endLine: number;
	endCharacter: number;
}

export function renderRangeFormattingCall(args: RangeFormattingArgs, theme: Theme): Text {
	const head = theme.fg("toolTitle", theme.bold("lsp_range_formatting "));
	const loc = theme.fg(
		"accent",
		`${shorten(args.filePath, PATH_BUDGET)}:${args.line}:${args.character}-${args.endLine}:${args.endCharacter}`,
	);
	return new Text(head + loc, 0, 0);
}

export function renderRangeFormattingResult(
	result: ResultLike<LspRangeFormattingDetails>,
	_options: RenderResultOptions,
	theme: Theme,
): Text {
	const details = result.details;
	if (details?.error) {
		return new Text(theme.fg("warning", details.error.split("\n")[0] ?? "error"), 0, 0);
	}
	if (!details || details.edits.length === 0) {
		return new Text(theme.fg("dim", "Already formatted"), 0, 0);
	}
	const count = details.edits.length;
	const applied = details.applied?.success ? theme.fg("success", " ✓") : theme.fg("warning", " ✗");
	return new Text(`${theme.fg("success", "↻ ")}${count} edit(s)${applied}`, 0, 0);
}
