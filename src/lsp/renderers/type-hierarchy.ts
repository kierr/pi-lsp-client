import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

import type { LspTypeHierarchyDetails } from "../tools/type-hierarchy.js";
import { shorten } from "../utils.js";
import type { PositionArgs, RenderResultOptions, ResultLike } from "./shared.js";
import { PATH_BUDGET } from "./shared.js";

export function renderTypeHierarchyCall(args: PositionArgs, theme: Theme): Text {
	const head = theme.fg("toolTitle", theme.bold("lsp_type_hierarchy "));
	const loc = theme.fg("accent", `${shorten(args.filePath, PATH_BUDGET)}:${args.line}:${args.character}`);
	return new Text(head + loc, 0, 0);
}

export function renderTypeHierarchyResult(
	result: ResultLike<LspTypeHierarchyDetails>,
	_options: RenderResultOptions,
	theme: Theme,
): Text {
	const details = result.details;
	if (details?.error) {
		return new Text(theme.fg("warning", details.error.split("\n")[0] ?? "error"), 0, 0);
	}
	if (!details || details.items.length === 0) {
		return new Text(theme.fg("dim", "No type hierarchy"), 0, 0);
	}
	const [first] = details.items;
	const name = first?.name ?? "?";
	const depth = theme.fg("dim", ` (depth ${details.depth})`);
	return new Text(theme.fg("success", "↑ ") + theme.fg("accent", name) + depth, 0, 0);
}
