/** Directories to skip during recursive directory walks (diagnostics, extension inference). */
export const SKIP_DIRECTORIES = new Set(["node_modules", ".git", "dist", "build", ".next", "out"]);

export const DEFAULT_MAX_REFERENCES = 200;
export const DEFAULT_MAX_SYMBOLS = 200;
export const DEFAULT_MAX_DIAGNOSTICS = 200;
export const DEFAULT_MAX_DIRECTORY_FILES = 50;

/** Delay after opening a file before requesting diagnostics. Ruby LSP needs time to run RuboCop/Sorbet. */
export const POST_OPEN_DELAY_MS = 1000;
/** Wait time after opening a file before pulling diagnostics. Ruby LSP publishes diagnostics asynchronously. */
export const POST_DIAGNOSTICS_WAIT_MS = 2000;
/** Maximum number of diagnostic pull errors to store before capping. */
export const MAX_DIAGNOSTIC_PULL_ERRORS = 50;

export const REQUEST_TIMEOUT_MS = 15_000;
export const INIT_TIMEOUT_MS = 60_000;
export const IDLE_TIMEOUT_MS = 5 * 60_000;
export const REAPER_INTERVAL_MS = 60_000;
export const STOP_HARD_KILL_TIMEOUT_MS = 5_000;
export const STOP_SIGKILL_GRACE_MS = 1_000;
