import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { BUILTIN_SERVERS } from "./server-definitions.js";
import type { ResolvedServer } from "./types.js";

interface LspEntry {
	disabled?: boolean;
	command?: string[];
	extensions?: string[];
	priority?: number;
	env?: Record<string, string>;
	initialization?: Record<string, unknown>;
}

interface ConfigJson {
	lsp?: Record<string, LspEntry>;
}

type ConfigSource = "project" | "user";

// ── Config cache ──────────────────────────────────────────────────────
// getMergedServers() is on the hotpath for every tool call. Without caching,
// it reads two JSON files from disk on every invocation. We cache the merged
// result and invalidate when config file mtimes change.
let cachedServers: ServerWithSource[] | null = null;
let cacheMtimes: { project: number | null; user: number | null } = { project: null, user: null };

function getMtimes(): { project: number | null; user: number | null } {
	const paths = getConfigPaths();
	let project: number | null = null;
	let user: number | null = null;
	try {
		if (existsSync(paths.project)) project = statSync(paths.project).mtimeMs;
	} catch {
		/* empty */
	}
	try {
		if (existsSync(paths.user)) user = statSync(paths.user).mtimeMs;
	} catch {
		/* empty */
	}
	return { project, user };
}

function isCacheValid(): boolean {
	if (!cachedServers) return false;
	const current = getMtimes();
	return current.project === cacheMtimes.project && current.user === cacheMtimes.user;
}

/** Invalidate the config cache. Call after modifying config files. */
export function invalidateConfigCache(): void {
	cachedServers = null;
	cacheMtimes = { project: null, user: null };
}
// ── End config cache ──────────────────────────────────────────────────

export interface ServerWithSource extends ResolvedServer {
	source: "project" | "user" | "builtin";
}

export function getConfigPaths(): { project: string; user: string } {
	const cwd = process.cwd();
	return {
		project: join(cwd, ".pi", "lsp-client.json"),
		user: join(homedir(), ".pi", "lsp-client.json"),
	};
}

function loadJsonFile(path: string): ConfigJson | null {
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as ConfigJson;
	} catch {
		return null;
	}
}

export function loadAllConfigs(): Map<ConfigSource, ConfigJson> {
	const paths = getConfigPaths();
	const configs = new Map<ConfigSource, ConfigJson>();

	const project = loadJsonFile(paths.project);
	if (project) configs.set("project", project);

	const user = loadJsonFile(paths.user);
	if (user) configs.set("user", user);

	return configs;
}

export function getMergedServers(): ServerWithSource[] {
	if (isCacheValid() && cachedServers) return cachedServers;

	const configs = loadAllConfigs();
	const servers: ServerWithSource[] = [];
	const disabled = new Set<string>();
	const seen = new Set<string>();

	const sources: ConfigSource[] = ["project", "user"];

	for (const source of sources) {
		const config = configs.get(source);
		if (!config?.lsp) continue;

		for (const [id, entry] of Object.entries(config.lsp)) {
			if (entry.disabled) {
				disabled.add(id);
				continue;
			}

			if (seen.has(id)) continue;
			// Validate shape: command and extensions must be arrays, not strings or other types.
			// Without this guard, a string "command": "evil" passes truthiness but crashes
			// later in spawnProcess when destructured as const [cmd, ...args] = command.
			if (!Array.isArray(entry.command) || !Array.isArray(entry.extensions)) continue;

			servers.push({
				id,
				command: entry.command,
				extensions: entry.extensions,
				priority: entry.priority ?? 0,
				...(entry.env !== undefined ? { env: entry.env } : {}),
				...(entry.initialization !== undefined ? { initialization: entry.initialization } : {}),
				source,
			});
			seen.add(id);
		}
	}

	for (const [id, config] of Object.entries(BUILTIN_SERVERS)) {
		if (disabled.has(id) || seen.has(id)) continue;

		servers.push({
			id,
			command: config.command,
			extensions: config.extensions,
			priority: -100,
			// Spread env and initialization so builtin servers that define these fields
			// (e.g., ruby-lsp with initializationOptions) don't silently lose them.
			...(config.env !== undefined ? { env: config.env } : {}),
			...(config.initialization !== undefined ? { initialization: config.initialization } : {}),
			source: "builtin",
		});
	}

	const sorted = servers.sort((a, b) => {
		if (a.source !== b.source) {
			const order: Record<"project" | "user" | "builtin", number> = {
				project: 0,
				user: 1,
				builtin: 2,
			};
			return order[a.source] - order[b.source];
		}
		return b.priority - a.priority;
	});

	cachedServers = sorted;
	cacheMtimes = getMtimes();
	return sorted;
}

export function getDisabledServerIds(): Set<string> {
	const configs = loadAllConfigs();
	const disabled = new Set<string>();

	for (const config of configs.values()) {
		if (!config.lsp) continue;
		for (const [id, entry] of Object.entries(config.lsp)) {
			if (entry.disabled) disabled.add(id);
		}
	}

	return disabled;
}
