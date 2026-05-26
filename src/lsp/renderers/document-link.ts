import type { Theme } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import type { LspDocumentLinksDetails } from "../tools/document-link.js";
import { shorten } from "../utils.js";
import type { RenderResultOptions, ResultLike } from "./shared.js";
import { PATH_BUDGET } from "./shared.js";

interface FileArgs {
	filePath: string;
}

export function renderDocumentLinkCall(args: FileArgs, theme: Theme): Text {
	const head = theme.fg("toolTitle", theme.bold("lsp_document_links "));
	const loc = theme.fg("accent", shorten(args.filePath, PATH_BUDGET));
	return new Text(head + loc, 0, 0);
}

export function renderDocumentLinkResult(
	result: ResultLike<LspDocumentLinksDetails>,
	_options: RenderResultOptions,
	theme: Theme,
): Text {
	const details = result.details;
	if (details?.error) {
		return new Text(theme.fg("warning", details.error.split("\n")[0] ?? "error"), 0, 0);
	}
	if (!details || details.links.length === 0) {
		return new Text(theme.fg("dim", "No links"), 0, 0);
	}
	const count = details.totalLinks;
	const more = count > 1 ? theme.fg("dim", ` (+${count - 1} more)`) : "";
	return new Text(`${theme.fg("success", "🔗 ")}${count} link(s)${more}`, 0, 0);
}
