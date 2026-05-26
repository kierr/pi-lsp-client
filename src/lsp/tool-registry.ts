import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { renderAddonsCall, renderAddonsResult } from "./renderers/addons.js";
import { renderCodeActionsCall, renderCodeActionsResult } from "./renderers/code-actions.js";
import { renderCodeLensCall, renderCodeLensResult } from "./renderers/code-lens.js";
import { renderCompletionCall, renderCompletionResult } from "./renderers/completion.js";
import { renderDiagnosticsCall, renderDiagnosticsResult } from "./renderers/diagnostics.js";
import { renderDiscoverTestsCall, renderDiscoverTestsResult } from "./renderers/discover-tests.js";
import { renderDocumentLinkCall, renderDocumentLinkResult } from "./renderers/document-link.js";
import { renderFindReferencesCall, renderFindReferencesResult } from "./renderers/find-references.js";
import { renderFormattingCall, renderFormattingResult } from "./renderers/formatting.js";
import { renderGotoDefinitionCall, renderGotoDefinitionResult } from "./renderers/goto-definition.js";
import { renderHoverCall, renderHoverResult } from "./renderers/hover.js";
import { renderInlayHintsCall, renderInlayHintsResult } from "./renderers/inlay-hints.js";
import { renderRangeFormattingCall, renderRangeFormattingResult } from "./renderers/range-formatting.js";
import { renderRelevantFilesCall, renderRelevantFilesResult } from "./renderers/relevant-files.js";
import {
	renderPrepareRenameCall,
	renderPrepareRenameResult,
	renderRenameCall,
	renderRenameResult,
} from "./renderers/rename.js";
import { renderSemanticTokensCall, renderSemanticTokensResult } from "./renderers/semantic-tokens.js";
import type { ResultLike } from "./renderers/shared.js";
import { renderShowSyntaxTreeCall, renderShowSyntaxTreeResult } from "./renderers/show-syntax-tree.js";
import { renderSignatureHelpCall, renderSignatureHelpResult } from "./renderers/signature-help.js";
import { renderSymbolsCall, renderSymbolsResult } from "./renderers/symbols.js";
import { renderTypeHierarchyCall, renderTypeHierarchyResult } from "./renderers/type-hierarchy.js";
import {
	renderWorkspaceDependenciesCall,
	renderWorkspaceDependenciesResult,
} from "./renderers/workspace-dependencies.js";
import { type LspAddonsDetails, lsp_addons } from "./tools/addons.js";
import { type LspCodeActionsDetails, lsp_code_actions } from "./tools/code-actions.js";
import { type LspCodeLensDetails, lsp_code_lens } from "./tools/code-lens.js";
import { type LspCompletionDetails, lsp_completion } from "./tools/completion.js";
import { type LspDiagnosticsDetails, lsp_diagnostics } from "./tools/diagnostics.js";
import { type LspDiscoverTestsDetails, lsp_discover_tests } from "./tools/discover-tests.js";
import { type LspDocumentLinksDetails, lsp_document_links } from "./tools/document-link.js";
import { type LspFindReferencesDetails, lsp_find_references } from "./tools/find-references.js";
import { type LspFormattingDetails, lsp_formatting } from "./tools/formatting.js";
import { type LspGotoDefinitionDetails, lsp_goto_definition } from "./tools/goto-definition.js";
import { type LspHoverDetails, lsp_hover } from "./tools/hover.js";
import { type LspInlayHintsDetails, lsp_inlay_hints } from "./tools/inlay-hints.js";
import { type LspRangeFormattingDetails, lsp_range_formatting } from "./tools/range-formatting.js";
import { type LspRelevantFilesDetails, lsp_relevant_files } from "./tools/relevant-files.js";
import { type LspPrepareRenameDetails, type LspRenameDetails, lsp_prepare_rename, lsp_rename } from "./tools/rename.js";
import { type LspSemanticTokensDetails, lsp_semantic_tokens } from "./tools/semantic-tokens.js";
import { type LspShowSyntaxTreeDetails, lsp_show_syntax_tree } from "./tools/show-syntax-tree.js";
import { type LspSignatureHelpDetails, lsp_signature_help } from "./tools/signature-help.js";
import { type LspSymbolsDetails, lsp_symbols } from "./tools/symbols.js";
import { type LspTypeHierarchyDetails, lsp_type_hierarchy } from "./tools/type-hierarchy.js";
import { type LspWorkspaceDependenciesDetails, lsp_workspace_dependencies } from "./tools/workspace-dependencies.js";

export type { ResultLike };

export function registerAllTools(pi: ExtensionAPI): void {
	// --- Existing tools (6) ---

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

	// --- Tier 1: High value (6) ---

	pi.registerTool({
		...lsp_hover,
		renderCall: (args, theme) => renderHoverCall(args as never, theme),
		renderResult: (result, options, theme) =>
			renderHoverResult(result as ResultLike<LspHoverDetails>, options, theme),
	});

	pi.registerTool({
		...lsp_completion,
		renderCall: (args, theme) => renderCompletionCall(args as never, theme),
		renderResult: (result, options, theme) =>
			renderCompletionResult(result as ResultLike<LspCompletionDetails>, options, theme),
	});

	pi.registerTool({
		...lsp_signature_help,
		renderCall: (args, theme) => renderSignatureHelpCall(args as never, theme),
		renderResult: (result, options, theme) =>
			renderSignatureHelpResult(result as ResultLike<LspSignatureHelpDetails>, options, theme),
	});

	pi.registerTool({
		...lsp_code_actions,
		renderCall: (args, theme) => renderCodeActionsCall(args as never, theme),
		renderResult: (result, options, theme) =>
			renderCodeActionsResult(result as ResultLike<LspCodeActionsDetails>, options, theme),
	});

	pi.registerTool({
		...lsp_formatting,
		renderCall: (args, theme) => renderFormattingCall(args as never, theme),
		renderResult: (result, options, theme) =>
			renderFormattingResult(result as ResultLike<LspFormattingDetails>, options, theme),
	});

	pi.registerTool({
		...lsp_range_formatting,
		renderCall: (args, theme) => renderRangeFormattingCall(args as never, theme),
		renderResult: (result, options, theme) =>
			renderRangeFormattingResult(result as ResultLike<LspRangeFormattingDetails>, options, theme),
	});

	// --- Tier 2: Medium value (2) ---

	pi.registerTool({
		...lsp_document_links,
		renderCall: (args, theme) => renderDocumentLinkCall(args as never, theme),
		renderResult: (result, options, theme) =>
			renderDocumentLinkResult(result as ResultLike<LspDocumentLinksDetails>, options, theme),
	});

	pi.registerTool({
		...lsp_code_lens,
		renderCall: (args, theme) => renderCodeLensCall(args as never, theme),
		renderResult: (result, options, theme) =>
			renderCodeLensResult(result as ResultLike<LspCodeLensDetails>, options, theme),
	});

	// --- Tier 3: More complex rendering (3) ---

	pi.registerTool({
		...lsp_inlay_hints,
		renderCall: (args, theme) => renderInlayHintsCall(args as never, theme),
		renderResult: (result, options, theme) =>
			renderInlayHintsResult(result as ResultLike<LspInlayHintsDetails>, options, theme),
	});

	pi.registerTool({
		...lsp_semantic_tokens,
		renderCall: (args, theme) => renderSemanticTokensCall(args as never, theme),
		renderResult: (result, options, theme) =>
			renderSemanticTokensResult(result as ResultLike<LspSemanticTokensDetails>, options, theme),
	});

	pi.registerTool({
		...lsp_type_hierarchy,
		renderCall: (args, theme) => renderTypeHierarchyCall(args as never, theme),
		renderResult: (result, options, theme) =>
			renderTypeHierarchyResult(result as ResultLike<LspTypeHierarchyDetails>, options, theme),
	});

	// --- Tier 4: RubyLSP custom extensions (3) ---

	pi.registerTool({
		...lsp_show_syntax_tree,
		renderCall: (args, theme) => renderShowSyntaxTreeCall(args as never, theme),
		renderResult: (result, options, theme) =>
			renderShowSyntaxTreeResult(result as ResultLike<LspShowSyntaxTreeDetails>, options, theme),
	});

	pi.registerTool({
		...lsp_workspace_dependencies,
		renderCall: (args, theme) => renderWorkspaceDependenciesCall(args as never, theme),
		renderResult: (result, options, theme) =>
			renderWorkspaceDependenciesResult(result as ResultLike<LspWorkspaceDependenciesDetails>, options, theme),
	});

	pi.registerTool({
		...lsp_discover_tests,
		renderCall: (args, theme) => renderDiscoverTestsCall(args as never, theme),
		renderResult: (result, options, theme) =>
			renderDiscoverTestsResult(result as ResultLike<LspDiscoverTestsDetails>, options, theme),
	});

	// --- VS Code RubyLSP extension ports (2) ---

	pi.registerTool({
		...lsp_relevant_files,
		renderCall: (args, theme) => renderRelevantFilesCall(args as never, theme),
		renderResult: (result, options, theme) =>
			renderRelevantFilesResult(result as ResultLike<LspRelevantFilesDetails>, options, theme),
	});

	pi.registerTool({
		...lsp_addons,
		renderCall: (args, theme) => renderAddonsCall(args as never, theme),
		renderResult: (result, options, theme) =>
			renderAddonsResult(result as ResultLike<LspAddonsDetails>, options, theme),
	});
}
