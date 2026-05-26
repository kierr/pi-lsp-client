import type { Theme } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import type { LspInlayHintsDetails } from "../tools/inlay-hints.js";
import { shorten } from "../utils.js";
import type { RenderResultOptions, ResultLike } from "./shared.js";
import { PATH_BUDGET } from "./shared.js";

interface InlayHintsArgs {
	filePath: string;
	startLine: number;
	endLine: number;
}

export function renderInlayHintsCall(args: InlayHintsArgs, theme: Theme): Text {
	const head = theme.fg("toolTitle", theme.bold("lsp_inlay_hints "));
	const loc = theme.fg("accent", `${shorten(args.filePath, PATH_BUDGET)}:${args.startLine}-${args.endLine}`);
	return new Text(head + loc, 0, 0);
}

export function renderInlayHintsResult(
	result: ResultLike<LspInlayHintsDetails>,
	_options: RenderResultOptions,
	theme: Theme,
): Text {
	const details = result.details;
	if (details?.error) {
		return new Text(theme.fg("warning", details.error.split("\n")[0] ?? "error"), 0, 0);
	}
	if (!details || details.hints.length === 0) {
		return new Text(theme.fg("dim", "No inlay hints"), 0, 0);
	}
	const count = details.totalHints;
	return new Text(`${theme.fg("success", "💡 ")}${count} hint(s)`, 0, 0);
}
