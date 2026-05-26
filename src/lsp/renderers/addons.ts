import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

import type { LspAddonsDetails } from "../tools/addons.js";
import { shorten } from "../utils.js";
import type { RenderResultOptions, ResultLike } from "./shared.js";
import { PATH_BUDGET } from "./shared.js";

interface AddonsArgs {
	filePath?: string;
}

export function renderAddonsCall(args: AddonsArgs, theme: Theme): Text {
	const head = theme.fg("toolTitle", theme.bold("lsp_addons "));
	const loc = args.filePath ? theme.fg("accent", shorten(args.filePath, PATH_BUDGET)) : theme.fg("dim", "(workspace)");
	return new Text(head + loc, 0, 0);
}

export function renderAddonsResult(
	result: ResultLike<LspAddonsDetails>,
	_options: RenderResultOptions,
	theme: Theme,
): Text {
	const details = result.details;
	if (details?.error) {
		return new Text(theme.fg("warning", details.error.split("\n")[0] ?? "error"), 0, 0);
	}
	if (!details) {
		return new Text(theme.fg("dim", "No addon info"), 0, 0);
	}
	const addonCount = details.addons.length;
	const degraded = details.degradedMode ? theme.fg("warning", " ⚠ degraded") : "";
	const version = details.serverVersion ? theme.fg("dim", ` v${details.serverVersion}`) : "";
	return new Text(`${theme.fg("success", "\u{1F4E6} ")}${addonCount} addon(s)${version}${degraded}`, 0, 0);
}
