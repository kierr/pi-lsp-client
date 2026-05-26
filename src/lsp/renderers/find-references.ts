import type { Theme } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import { uriToPath } from "../formatters.js";
import type { LspFindReferencesDetails } from "../tools/find-references.js";
import { shorten } from "../utils.js";
import type { PositionArgs, RenderResultOptions, ResultLike } from "./shared.js";
import { COLLAPSED_HEAD, EXPANDED_HEAD, locText, PATH_BUDGET, unique } from "./shared.js";

export function renderFindReferencesCall(args: PositionArgs & { includeDeclaration?: boolean }, theme: Theme): Text {
	const head = theme.fg("toolTitle", theme.bold("lsp_find_references "));
	const loc = theme.fg("accent", `${shorten(args.filePath, PATH_BUDGET)}:${args.line}:${args.character}`);
	return new Text(head + loc, 0, 0);
}

export function renderFindReferencesResult(
	result: ResultLike<LspFindReferencesDetails>,
	options: RenderResultOptions,
	theme: Theme,
): Text {
	const details = result.details;
	if (details?.error) {
		return new Text(theme.fg("warning", details.error.split("\n")[0] ?? "error"), 0, 0);
	}
	if (!details || details.totalReferences === 0) {
		return new Text(theme.fg("dim", "No references"), 0, 0);
	}
	const total = details.totalReferences;
	const fileCount = unique(details.references, (r) => r.uri).length;
	const summary =
		theme.fg("success", `${total} reference${total === 1 ? "" : "s"}`) +
		theme.fg("muted", ` • ${fileCount} file${fileCount === 1 ? "" : "s"}`) +
		(details.truncated ? theme.fg("warning", " (truncated)") : "");

	if (!options.expanded) {
		const head = unique(details.references, (r) => r.uri).slice(0, COLLAPSED_HEAD);
		const lines: string[] = [summary];
		for (const ref of head) {
			lines.push(theme.fg("muted", `  ${shorten(uriToPath(ref.uri), PATH_BUDGET)}`));
		}
		if (fileCount > COLLAPSED_HEAD) {
			lines.push(theme.fg("dim", `  … ${fileCount - COLLAPSED_HEAD} more files`));
		}
		return new Text(lines.join("\n"), 0, 0);
	}

	const display = details.references.slice(0, EXPANDED_HEAD);
	const lines: string[] = [summary, ""];
	for (const ref of display) {
		lines.push(theme.fg("accent", locText(ref)));
	}
	if (total > EXPANDED_HEAD) {
		lines.push(theme.fg("dim", `… ${total - EXPANDED_HEAD} more references`));
	}
	return new Text(lines.join("\n"), 0, 0);
}
