import { getDisabledServerIds, getMergedServers } from "./config-loader.js";
import { BUILTIN_SERVERS, COMPANION_SERVERS, LSP_INSTALL_HINTS } from "./server-definitions.js";
import { isServerInstalled } from "./server-installation.js";
import type { ResolvedServer, ServerLookupResult } from "./types.js";

export function findServerForExtension(ext: string): ServerLookupResult {
	const servers = getMergedServers();

	for (const server of servers) {
		if (server.extensions.includes(ext) && isServerInstalled(server.command)) {
			return {
				status: "found",
				server: {
					id: server.id,
					command: server.command,
					extensions: server.extensions,
					priority: server.priority,
					...(server.env !== undefined ? { env: server.env } : {}),
					...(server.initialization !== undefined ? { initialization: server.initialization } : {}),
				},
			};
		}
	}

	for (const server of servers) {
		if (server.extensions.includes(ext)) {
			const installHint =
				LSP_INSTALL_HINTS[server.id] ?? `Install '${server.command[0]}' and ensure it's in your PATH`;
			return {
				status: "not_installed",
				server: {
					id: server.id,
					command: server.command,
					extensions: server.extensions,
				},
				installHint,
			};
		}
	}

	const availableServers = [...new Set(servers.map((s) => s.id))];
	return {
		status: "not_configured",
		extension: ext,
		availableServers,
	};
}

export interface ServerStatus {
	id: string;
	installed: boolean;
	extensions: string[];
	disabled: boolean;
	source: string;
	priority: number;
}

export function getAllServers(): ServerStatus[] {
	const servers = getMergedServers();
	const disabled = getDisabledServerIds();

	const result: ServerStatus[] = [];
	const seen = new Set<string>();

	for (const server of servers) {
		if (seen.has(server.id)) continue;
		result.push({
			id: server.id,
			installed: isServerInstalled(server.command),
			extensions: server.extensions,
			disabled: false,
			source: server.source,
			priority: server.priority,
		});
		seen.add(server.id);
	}

	for (const id of disabled) {
		if (seen.has(id)) continue;
		const builtin = BUILTIN_SERVERS[id];
		result.push({
			id,
			installed: builtin ? isServerInstalled(builtin.command) : false,
			extensions: builtin?.extensions ?? [],
			disabled: true,
			source: "disabled",
			priority: 0,
		});
	}

	return result;
}

/**
 * Find a companion server for a given primary server + file extension.
 * Returns null if no companion is defined, not installed, or doesn't support the extension.
 *
 * Companions provide semantic features that the primary delegates. For example,
 * ruby-lsp delegates hover/completion/definition to sorbet when sorbet-static is
 * in the Gemfile.
 */
export function findCompanionServer(primaryServerId: string, ext: string): ResolvedServer | null {
	const companionId = COMPANION_SERVERS[primaryServerId];
	if (!companionId) return null;

	// Check user/project config first, then builtins.
	const servers = getMergedServers();
	const match = servers.find((s) => s.id === companionId);
	if (!match) return null;

	// Companion must support the same extension.
	if (!match.extensions.includes(ext)) return null;

	// Companion must be installed.
	if (!isServerInstalled(match.command)) return null;

	return {
		id: match.id,
		command: match.command,
		extensions: match.extensions,
		priority: match.priority,
		...(match.env !== undefined ? { env: match.env } : {}),
		...(match.initialization !== undefined ? { initialization: match.initialization } : {}),
	};
}
