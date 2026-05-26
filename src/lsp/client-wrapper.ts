import { existsSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

import type { LspClient } from "./client.js";
import {
	isLspDeadConnectionError,
	LspInvalidPathError,
	LspRequestTimeoutError,
	LspServerInitializingError,
	LspServerLookupError,
} from "./errors.js";
import { getLspManager, type LspManager } from "./manager.js";
import { findCompanionServer, findServerForExtension } from "./server-resolution.js";
import type { ResolvedServer, ServerLookupResult } from "./types.js";

const WORKSPACE_MARKERS = [".git", "package.json", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml", "build.gradle"];

export function isDirectoryPath(filePath: string): boolean {
	try {
		return statSync(filePath).isDirectory();
	} catch {
		return false;
	}
}

export function findWorkspaceRoot(filePath: string): string {
	const abs = resolve(filePath);
	let dir = abs;

	if (!isDirectoryPath(dir)) {
		dir = dirname(dir);
	}

	let prevDir = "";
	while (dir !== prevDir) {
		for (const marker of WORKSPACE_MARKERS) {
			if (existsSync(join(dir, marker))) {
				return dir;
			}
		}
		prevDir = dir;
		dir = dirname(dir);
	}

	return dirname(abs);
}

export function formatServerLookupError(result: Exclude<ServerLookupResult, { status: "found" }>): string {
	if (result.status === "not_installed") {
		const { server, installHint } = result;
		return [
			`LSP server '${server.id}' is configured but NOT INSTALLED.`,
			"",
			`Command not found: ${server.command[0]}`,
			"",
			"To install:",
			`  ${installHint}`,
			"",
			`Supported extensions: ${server.extensions.join(", ")}`,
			"",
			"After installation, the server will be available automatically.",
		].join("\n");
	}

	return [
		`No LSP server configured for extension: ${result.extension}`,
		"",
		`Available servers: ${result.availableServers.slice(0, 10).join(", ")}${
			result.availableServers.length > 10 ? "..." : ""
		}`,
		"",
		"Configure a custom server in '.pi/lsp-client.json':",
		"  {",
		'    "lsp": {',
		'      "my-server": {',
		'        "command": ["my-lsp", "--stdio"],',
		`        "extensions": ["${result.extension}"]`,
		"      }",
		"    }",
		"  }",
	].join("\n");
}

export interface WithLspClientOptions {
	signal?: AbortSignal;
	manager?: LspManager;
	/** Skip server resolution and use this server directly. Used by withSemanticFallback for companion servers. */
	serverOverride?: ResolvedServer;
}

const READ_ONLY_RETRY_TOOLS = new Set([
	"diagnostics",
	"definition",
	"references",
	"documentSymbols",
	"workspaceSymbols",
	"prepareRename",
	// New read-only tools — retry on dead connections
	"hover",
	"completion",
	"signatureHelp",
	"documentLink",
	"codeLens",
	"inlayHints",
	"semanticTokens",
	"typeHierarchy",
	// RubyLSP custom — read-only
	"showSyntaxTree",
	"workspaceDependencies",
	"discoverTests",
]);

export async function withLspClient<T>(
	filePath: string,
	fn: (client: LspClient) => Promise<T>,
	toolName: string,
	options: WithLspClientOptions = {},
): Promise<T> {
	const absPath = resolve(filePath);

	if (isDirectoryPath(absPath)) {
		throw new LspInvalidPathError(
			"Directory paths are not supported by this LSP tool. " +
				"Use lsp_diagnostics with a directory path for directory diagnostics.",
		);
	}

	const ext = extname(absPath);

	// When serverOverride is provided, skip server resolution entirely.
	// This is used by withSemanticFallback to route requests to companion servers.
	let server: ResolvedServer;
	if (options.serverOverride) {
		server = options.serverOverride;
	} else {
		const result = findServerForExtension(ext);
		if (result.status !== "found") {
			throw new LspServerLookupError(formatServerLookupError(result));
		}
		server = result.server;
	}

	const root = findWorkspaceRoot(absPath);
	const manager = options.manager ?? getLspManager();

	const acquireAndCall = async (allowRetry: boolean): Promise<T> => {
		const client = await manager.getClient(root, server, options.signal);

		try {
			return await fn(client);
		} catch (err) {
			if (allowRetry && READ_ONLY_RETRY_TOOLS.has(toolName) && isLspDeadConnectionError(err)) {
				manager.invalidateClient(root, server.id, client);
				return acquireAndCall(false);
			}

			if (err instanceof LspRequestTimeoutError) {
				if (manager.isServerInitializing(root, server.id)) {
					throw new LspServerInitializingError(err);
				}
			}
			throw err;
		} finally {
			manager.releaseClient(root, server.id);
		}
	};

	return acquireAndCall(true);
}

/**
 * Semantic fallback: try the primary server first, then fall back to its
 * companion server if the primary returns null.
 *
 * Use this for tools that query semantic information (hover, completion,
 * definition, signature help, code actions). In Sorbet-typed Ruby projects,
 * ruby-lsp intentionally returns null for these and delegates to sorbet.
 *
 * For non-null results (success or error), the primary's response is returned
 * directly — no fallback is attempted.
 */
export async function withSemanticFallback<T>(
	filePath: string,
	fn: (client: LspClient) => Promise<T>,
	toolName: string,
	options: WithLspClientOptions = {},
): Promise<T> {
	const absPath = resolve(filePath);
	const ext = extname(absPath);

	// Step 1: Try primary server (resolved by extension).
	const primaryResult = await withLspClient<T>(filePath, fn, toolName, options);

	// Only attempt fallback when primary returned null — not on errors or non-null results.
	// `null` is the LSP convention for "I don't handle this request".
	if (primaryResult !== null) return primaryResult;

	// Step 2: Look up companion for the primary server.
	const lookup = findServerForExtension(ext);
	if (lookup.status !== "found") return primaryResult;

	const companion = findCompanionServer(lookup.server.id, ext);
	if (!companion) return primaryResult;

	// Step 3: Try companion server.
	try {
		return await withLspClient<T>(filePath, fn, toolName, {
			...options,
			serverOverride: companion,
		});
	} catch {
		// Companion failed (not installed, crashed, etc.) — return primary's null.
		return primaryResult;
	}
}
