import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

export function getAdditionalPathBases(workingDirectory: string): string[] {
	return [join(workingDirectory, "node_modules", ".bin")];
}

/**
 * Check whether the first element of a command array is findable on PATH.
 *
 * @param command The command array (e.g., ["typescript-language-server", "--stdio"]).
 * @param workspaceRoot The workspace root directory. When supplied, node_modules/.bin
 *   inside the workspace is also searched. Falls back to process.cwd() for callers
 *   that don't have a workspace root available.
 */
export function isServerInstalled(command: string[], workspaceRoot?: string): boolean {
	if (command.length === 0) return false;

	const [cmd] = command;
	if (!cmd) return false;

	if (cmd.includes("/") || cmd.includes("\\")) {
		if (existsSync(cmd)) return true;
	}

	const isWindows = process.platform === "win32";

	let exts = [""];
	if (isWindows) {
		const pathExt = process.env["PATHEXT"] ?? "";
		if (pathExt) {
			const systemExts = pathExt.split(";").filter(Boolean);
			exts = [...new Set([...exts, ...systemExts, ".exe", ".cmd", ".bat", ".ps1"])];
		} else {
			exts = ["", ".exe", ".cmd", ".bat", ".ps1"];
		}
	}

	let pathEnv = process.env["PATH"] ?? "";
	if (isWindows && !pathEnv) {
		pathEnv = process.env["Path"] ?? "";
	}

	const paths = pathEnv.split(delimiter);

	for (const p of paths) {
		for (const suffix of exts) {
			if (existsSync(join(p, cmd + suffix))) {
				return true;
			}
		}
	}

	// Search node_modules/.bin in both the workspace root and cwd.
	// transport.ts adds workspaceRoot's node_modules/.bin to PATH when spawning,
	// so the install check must search the same location.
	const searchRoots = workspaceRoot ? [workspaceRoot] : [];
	const cwd = process.cwd();
	if (!searchRoots.includes(cwd)) searchRoots.push(cwd);

	for (const root of searchRoots) {
		for (const base of getAdditionalPathBases(root)) {
			for (const suffix of exts) {
				if (existsSync(join(base, cmd + suffix))) {
					return true;
				}
			}
		}
	}

	if (cmd === "node") return true;

	return false;
}
