import type { Theme } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import type { LspCodeLensDetails } from "../tools/code-lens.js";
import { shorten } from "../utils.js";
import type { RenderResultOptions, ResultLike } from "./shared.js";
import { PATH_BUDGET } from "./shared.js";

interface FileArgs {
	filePath: string;
}

export function renderCodeLensCall(args: FileArgs, theme: Theme): Text {
	const head = theme.fg("toolTitle", theme.bold("lsp_code_lens "));
	const loc = theme.fg("accent", shorten(args.filePath, PATH_BUDGET));
	return new Text(head + loc, 0, 0);
}

export function renderCodeLensResult(
	result: ResultLike<LspCodeLensDetails>,
	_options: RenderResultOptions,
	theme: Theme,
): Text {
	const details = result.details;
	if (details?.error) {
		return new Text(theme.fg("warning", details.error.split("\n")[0] ?? "error"), 0, 0);
	}
	if (!details || details.lenses.length === 0) {
		return new Text(theme.fg("dim", "No code lenses"), 0, 0);
	}
	const count = details.lenses.length;
	const first = details.lenses[0];
	const title = first?.command?.title ?? "lens";
	const resolved = details.resolved > 0 ? theme.fg("dim", ` (${details.resolved} resolved)`) : "";
	return new Text(
		theme.fg("success", "◎ ") + theme.fg("accent", title) + theme.fg("dim", ` (${count})`) + resolved,
		0,
		0,
	);
}
