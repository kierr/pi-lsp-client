import type { Theme } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import type { LspFormattingDetails } from "../tools/formatting.js";
import { shorten } from "../utils.js";
import type { RenderResultOptions, ResultLike } from "./shared.js";
import { PATH_BUDGET } from "./shared.js";

interface FormattingArgs {
	filePath: string;
}

export function renderFormattingCall(args: FormattingArgs, theme: Theme): Text {
	const head = theme.fg("toolTitle", theme.bold("lsp_formatting "));
	const loc = theme.fg("accent", shorten(args.filePath, PATH_BUDGET));
	return new Text(head + loc, 0, 0);
}

export function renderFormattingResult(
	result: ResultLike<LspFormattingDetails>,
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
