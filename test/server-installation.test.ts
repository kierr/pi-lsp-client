import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAdditionalPathBases, isServerInstalled } from "../src/lsp/server-installation.js";

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		existsSync: vi.fn(),
	};
});

const mockedExistsSync = vi.mocked(existsSync);

describe("isServerInstalled", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns false for empty command", () => {
		expect(isServerInstalled([])).toBe(false);
	});

	it("returns true when command contains a path separator and file exists", () => {
		mockedExistsSync.mockReturnValue(true);
		expect(isServerInstalled(["/usr/local/bin/node"])).toBe(true);
	});

	it("returns false when command contains a path separator but file does not exist", () => {
		mockedExistsSync.mockReturnValue(false);
		expect(isServerInstalled(["/usr/local/bin/nonexistent"])).toBe(false);
	});

	it("finds binary in project-local node_modules/.bin BEFORE system PATH", () => {
		const workspaceRoot = "/project/root";
		const localBin = join(workspaceRoot, "node_modules", ".bin");
		const systemPath = "/usr/local/bin";

		// Simulate: project-local biome exists, system biome also exists.
		// isServerInstalled should return true on the FIRST hit — the local one.
		mockedExistsSync.mockImplementation((p) => {
			const str = String(p);
			return str.startsWith(localBin) || str.startsWith(systemPath);
		});

		const origPath = process.env["PATH"];
		process.env["PATH"] = systemPath;
		try {
			expect(isServerInstalled(["biome", "--stdio"], workspaceRoot)).toBe(true);
			// Verify the first existsSync call was for the project-local path,
			// not the system one — confirming search order.
			const firstCallPath = String(mockedExistsSync.mock.calls[0]);
			expect(firstCallPath).toContain("node_modules/.bin");
		} finally {
			process.env["PATH"] = origPath;
		}
	});

	it("falls back to system PATH when project-local binary not found", () => {
		const workspaceRoot = "/project/root";
		const localBin = join(workspaceRoot, "node_modules", ".bin");
		const systemPath = "/usr/local/bin";

		// Simulate: project-local does NOT exist, but system one does.
		mockedExistsSync.mockImplementation((p) => {
			const str = String(p);
			return !str.startsWith(localBin) && str.startsWith(systemPath);
		});

		const origPath = process.env["PATH"];
		process.env["PATH"] = systemPath;
		try {
			expect(isServerInstalled(["biome", "--stdio"], workspaceRoot)).toBe(true);
		} finally {
			process.env["PATH"] = origPath;
		}
	});

	it("returns false when binary not found anywhere", () => {
		mockedExistsSync.mockReturnValue(false);
		const origPath = process.env["PATH"];
		process.env["PATH"] = "/nonexistent";
		try {
			expect(isServerInstalled(["biome", "--stdio"], "/project/root")).toBe(false);
		} finally {
			process.env["PATH"] = origPath;
		}
	});

	it("returns true for 'node' command even if not found on PATH", () => {
		mockedExistsSync.mockReturnValue(false);
		expect(isServerInstalled(["node"])).toBe(true);
	});
});

describe("getAdditionalPathBases", () => {
	it("returns node_modules/.bin relative to the given directory", () => {
		const bases = getAdditionalPathBases("/project/root");
		expect(bases).toEqual([join("/project/root", "node_modules", ".bin")]);
	});
});
