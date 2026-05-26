import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

import type { LspRelevantFilesDetails } from "../tools/relevant-files.js";
import { shorten } from "../utils.js";
import type { RenderResultOptions, ResultLike } from "./shared.js";
import { PATH_BUDGET } from "./shared.js";

interface RelevantFilesArgs {
	filePath: string;
}

export function renderRelevantFilesCall(args: RelevantFilesArgs, theme: Theme): Text {
	const head = theme.fg("toolTitle", theme.bold("lsp_relevant_files "));
	const loc = theme.fg("accent", shorten(args.filePath, PATH_BUDGET));
	return new Text(head + loc, 0, 0);
}

export function renderRelevantFilesResult(
	result: ResultLike<LspRelevantFilesDetails>,
	_options: RenderResultOptions,
	theme: Theme,
): Text {
	const details = result.details;
	if (details?.error) {
		return new Text(theme.fg("warning", details.error.split("\n")[0] ?? "error"), 0, 0);
	}
	if (!details || details.locations.length === 0) {
		return new Text(theme.fg("dim", "No related files"), 0, 0);
	}
	const count = details.locations.length;
	return new Text(`${theme.fg("success", "\u{1F517} ")}${count} related file(s)`, 0, 0);
}
