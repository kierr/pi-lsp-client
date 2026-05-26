import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

import type { LspSignatureHelpDetails } from "../tools/signature-help.js";
import { shorten } from "../utils.js";
import type { PositionArgs, RenderResultOptions, ResultLike } from "./shared.js";
import { PATH_BUDGET } from "./shared.js";

export function renderSignatureHelpCall(args: PositionArgs, theme: Theme): Text {
	const head = theme.fg("toolTitle", theme.bold("lsp_signature_help "));
	const loc = theme.fg("accent", `${shorten(args.filePath, PATH_BUDGET)}:${args.line}:${args.character}`);
	return new Text(head + loc, 0, 0);
}

export function renderSignatureHelpResult(
	result: ResultLike<LspSignatureHelpDetails>,
	_options: RenderResultOptions,
	theme: Theme,
): Text {
	const details = result.details;
	if (details?.error) {
		return new Text(theme.fg("warning", details.error.split("\n")[0] ?? "error"), 0, 0);
	}
	if (!details || details.signatures.length === 0) {
		return new Text(theme.fg("dim", "No signature help"), 0, 0);
	}
	const activeIdx = details.activeSignature ?? 0;
	const active = details.signatures[activeIdx];
	const label = active?.label ?? "?";
	const more = details.signatures.length - 1;
	const tail = more > 0 ? theme.fg("dim", ` (+${more} more)`) : "";
	return new Text(theme.fg("success", "ⓘ ") + theme.fg("accent", label) + tail, 0, 0);
}
