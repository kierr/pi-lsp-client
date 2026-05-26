import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { renderDiagnosticsCall, renderDiagnosticsResult } from "./renderers/diagnostics.js";
import { renderFindReferencesCall, renderFindReferencesResult } from "./renderers/find-references.js";
import { renderGotoDefinitionCall, renderGotoDefinitionResult } from "./renderers/goto-definition.js";
import {
	renderPrepareRenameCall,
	renderPrepareRenameResult,
	renderRenameCall,
	renderRenameResult,
} from "./renderers/rename.js";
import type { ResultLike } from "./renderers/shared.js";
import { renderSymbolsCall, renderSymbolsResult } from "./renderers/symbols.js";
import { type LspDiagnosticsDetails, lsp_diagnostics } from "./tools/diagnostics.js";
import { type LspFindReferencesDetails, lsp_find_references } from "./tools/find-references.js";
import { type LspGotoDefinitionDetails, lsp_goto_definition } from "./tools/goto-definition.js";
import { type LspPrepareRenameDetails, type LspRenameDetails, lsp_prepare_rename, lsp_rename } from "./tools/rename.js";
import { type LspSymbolsDetails, lsp_symbols } from "./tools/symbols.js";

export type { ResultLike };

export function registerAllTools(pi: ExtensionAPI): void {
	pi.registerTool({
		...lsp_diagnostics,
		renderCall: (args, theme) => renderDiagnosticsCall(args as never, theme),
		renderResult: (result, options, theme) =>
			renderDiagnosticsResult(result as ResultLike<LspDiagnosticsDetails>, options, theme),
	});

	pi.registerTool({
		...lsp_goto_definition,
		renderCall: (args, theme) => renderGotoDefinitionCall(args as never, theme),
		renderResult: (result, options, theme) =>
			renderGotoDefinitionResult(result as ResultLike<LspGotoDefinitionDetails>, options, theme),
	});

	pi.registerTool({
		...lsp_find_references,
		renderCall: (args, theme) => renderFindReferencesCall(args as never, theme),
		renderResult: (result, options, theme) =>
			renderFindReferencesResult(result as ResultLike<LspFindReferencesDetails>, options, theme),
	});

	pi.registerTool({
		...lsp_symbols,
		renderCall: (args, theme) => renderSymbolsCall(args as never, theme),
		renderResult: (result, options, theme) =>
			renderSymbolsResult(result as ResultLike<LspSymbolsDetails>, options, theme),
	});

	pi.registerTool({
		...lsp_prepare_rename,
		renderCall: (args, theme) => renderPrepareRenameCall(args as never, theme),
		renderResult: (result, options, theme) =>
			renderPrepareRenameResult(result as ResultLike<LspPrepareRenameDetails>, options, theme),
	});

	pi.registerTool({
		...lsp_rename,
		renderCall: (args, theme) => renderRenameCall(args as never, theme),
		renderResult: (result, options, theme) =>
			renderRenameResult(result as ResultLike<LspRenameDetails>, options, theme),
	});
}
