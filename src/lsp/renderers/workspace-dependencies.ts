import type { Theme } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import type { LspWorkspaceDependenciesDetails } from "../tools/workspace-dependencies.js";
import { shorten } from "../utils.js";
import type { RenderResultOptions, ResultLike } from "./shared.js";
import { PATH_BUDGET } from "./shared.js";

interface WorkspaceDepsArgs {
	filePath?: string;
}

export function renderWorkspaceDependenciesCall(args: WorkspaceDepsArgs, theme: Theme): Text {
	const head = theme.fg("toolTitle", theme.bold("lsp_workspace_dependencies "));
	const loc = args.filePath ? theme.fg("accent", shorten(args.filePath, PATH_BUDGET)) : theme.fg("dim", "(workspace)");
	return new Text(head + loc, 0, 0);
}

export function renderWorkspaceDependenciesResult(
	result: ResultLike<LspWorkspaceDependenciesDetails>,
	_options: RenderResultOptions,
	theme: Theme,
): Text {
	const details = result.details;
	if (details?.error) {
		return new Text(theme.fg("warning", details.error.split("\n")[0] ?? "error"), 0, 0);
	}
	if (!details || details.dependencies.length === 0) {
		return new Text(theme.fg("dim", "No dependencies"), 0, 0);
	}
	const count = details.total;
	return new Text(`${theme.fg("success", "📦 ")}${count} deps`, 0, 0);
}
