# pi-lsp-client — RubyLSP Full Coverage

## Repo overview

This is a fork of [code-yeongyu/pi-lsp-client](https://github.com/code-yeongyu/pi-lsp-client) — an LSP client extension for the [Pi coding agent](https://github.com/mariozechner/pi-mono). It provides a shared `LspManager` with refCount-based lifecycle, idle cleanup, crash retry, and a `/lsp` inspector.

**Goal of this branch:** Add full RubyLSP v0.26.9 coverage — 14 new tools covering completion, hover, formatting, code actions, inlay hints, and RubyLSP custom extensions. Plus Sorbet LSP companion support for semantic features in typed Ruby projects.

## Branches and scope

| Branch | Scope | Upstream PR? |
|---|---|---|
| `feat/rubylsp-full-coverage` | Fix `ruby-lsp` server def (`rubocop --lsp` → `ruby-lsp`) + 14 new tools. All imports stay as `@mariozechner/pi-*`. | **Yes** — PR to `code-yeongyu/pi-lsp-client` |
| `main` on `kierr/pi-lsp-client` | Merge feature branch + peer dep rename `@mariozechner/pi-*` → `@earendil-works/pi-*` + version bump to 0.75.5 to match our pi-harness | **No** — this is the fork's daily-driver main |

The upstream project uses `@mariozechner/pi-*` (public npm, 0.73.x). Our pi-harness uses `@earendil-works/pi-*` (0.75.5). The PR branch must keep `@mariozechner` imports. After merging to fork's `main`, apply the dep rename.

### Workflow
1. Build everything on `feat/rubylsp-full-coverage` with `@mariozechner` imports
2. Push branch, open PR to upstream
3. Merge branch into fork's `main`
4. On fork's `main`: rename all `@mariozechner/pi-*` → `@earendil-works/pi-*` in `package.json` + all source files, bump versions to 0.75.5
5. Push fork's `main` — this is what our pi-harness actually uses

## Architecture

```
src/
├── index.ts              ← Entry: lifecycle hooks + commands. Tool registration delegated to tool-registry.ts
├── lsp/
│   ├── client.ts         ← LspClient class — methods for each LSP request
│   ├── client-wrapper.ts ← withLspClient() — acquire/call/release with retry on dead connections
│   ├── connection.ts     ← LspClientConnection — JSON-RPC send/receive via vscode-jsonrpc
│   ├── transport.ts      ← stdio transport spawning
│   ├── manager.ts        ← Server pool with refCount, idle reaping (5min), init reaping (60s)
│   ├── tool-registry.ts  ← registerAllTools(pi) — centralized tool registration (NEW)
│   ├── tools/            ← One file per tool, exports a defineTool() result
│   ├── renderers/        ← One file per tool for TUI render functions (NEW, decomposed from renderers.ts)
│   │   ├── diagnostics.ts
│   │   ├── goto-definition.ts
│   │   ├── find-references.ts
│   │   ├── rename.ts
│   │   ├── symbols.ts
│   │   ├── hover.ts
│   │   ├── completion.ts
│   │   └── ...
│   ├── types.ts           ← LSP types — import from vscode-languageserver-protocol where available
│   ├── formatters.ts      ← formatLocation, etc.
│   ├── language-mappings.ts ← extension → languageId map (verify .erb → erb exists)
│   └── server-definitions.ts ← Builtin server configs (command + extensions + initialization)
```

### Structural refactors (do these BEFORE adding tools)

These are prerequisite commits that keep the codebase maintainable at 3x scale:

1. **Decompose `renderers.ts` → `renderers/` directory**: Move existing per-tool render functions into `src/lsp/renderers/<tool>.ts`. The monolithic file would hit ~1750 lines with 14 new tools — a merge conflict magnet. One file per tool, same exports.

2. **Extract tool registry from `index.ts`**: Create `src/lsp/tool-registry.ts` with a `registerAllTools(pi)` function. `index.ts` keeps lifecycle hooks and commands (~100 lines). The registry file answers "what tools exist" in one place (~200 lines) instead of interleaving registration with lifecycle.

3. **Switch `types.ts` to `vscode-languageserver-protocol` imports**: `vscode-jsonrpc` (already a dependency) brings `vscode-languageserver-protocol` as a transitive dep. Import types (`Hover`, `CompletionItem`, `SignatureHelp`, `CodeAction`, `TextEdit`, etc.) from there instead of hand-rolling. Keeps types in sync with the protocol. Hand-roll only types that don't exist in the package (e.g., RubyLSP custom response types).

### Adding a new tool (the pattern)

1. **Add a method to `LspClient`** in `src/lsp/client.ts`:
   ```typescript
   async hover(filePath: string, line: number, character: number): Promise<Hover | null> {
     const absPath = resolve(filePath);
     await this.openFile(absPath);
     return this.sendRequest<Hover | null>("textDocument/hover", {
       textDocument: { uri: pathToFileURL(absPath).href },
       position: { line: line - 1, character },
     });
   }
   ```

2. **Create tool file** in `src/lsp/tools/<name>.ts`:
   ```typescript
   import { defineTool } from "@mariozechner/pi-coding-agent";
   import { Type } from "typebox";
   import { withLspClient } from "../client-wrapper.js";
   // ... follow goto-definition.ts pattern exactly
   export const lsp_hover = defineTool({ ... });
   ```

3. **Create renderer** in `src/lsp/renderers/<name>.ts` (decomposed from the old monolithic file):
   ```typescript
   export function renderHoverCall(...) { ... }
   export function renderHoverResult(...) { ... }
   ```

4. **Register in `src/lsp/tool-registry.ts`**:
   ```typescript
   import { lsp_hover } from "./tools/hover.js";
   import { renderHoverCall, renderHoverResult } from "./renderers/hover.js";
   // ...
   pi.registerTool({
     ...lsp_hover,
     renderCall: (args, theme) => renderHoverCall(args as never, theme),
     renderResult: (result, options, theme) =>
       renderHoverResult(result as ResultLike<LspHoverDetails>, options, theme),
   });
   ```

5. **If read-only** (no mutations), add the tool name to `READ_ONLY_RETRY_TOOLS` in `client-wrapper.ts` — this enables automatic retry on dead connections.

### Type conventions
- **Tool parameters**: Use `typebox` (`Type.Object`, `Type.String`, etc.) — existing pattern for input validation
- **Response types**: Import from `vscode-languageserver-protocol` where available, hand-roll in `types.ts` only for types not in the package

## Critical bug to fix first

`src/lsp/server-definitions.ts` line 87-89 — the `ruby-lsp` builtin is configured as:
```typescript
"ruby-lsp": {
  command: ["rubocop", "--lsp"],  // ← WRONG! This is RuboCop's LSP mode, not RubyLSP
  extensions: [".rb", ".rake", ".gemspec", ".ru"],
},
```

Should be:
```typescript
"ruby-lsp": {
  command: ["ruby-lsp"],
  extensions: [".rb", ".rake", ".gemspec", ".ru", ".erb"],
},
```

**But it's not just a command swap.** RubyLSP gates features behind `initializationOptions`. Read `lib/ruby_lsp/server.rb`'s `run_initialize` method to understand what init options it expects. The server definition may need an `initialization` field to enable hover, completion, code actions etc. Also verify `language-mappings.ts` supports `.erb` → `erb`.

`rubocop --lsp` only provides diagnostics + formatting. `ruby-lsp` provides the full feature set (hover, completion, code actions, etc.). Fix this in a dedicated commit before the structural refactors and feature work.

## RubyLSP reference

RubyLSP gem is installed at: `~/.local/share/mise/installs/ruby/3.4.8/lib/ruby/gems/3.4.0/gems/ruby-lsp-0.26.9/`

- `lib/ruby_lsp/server.rb` — all request handlers in the `when` dispatch (lines 23-117), plus `run_initialize` for init options
- `lib/ruby_lsp/requests/` — one file per request type, shows params/return types

## Tools to implement (14 total)

### Existing tools (DO NOT MODIFY unless fixing a bug)
- `lsp_diagnostics` — pull diagnostics
- `lsp_goto_definition` — textDocument/definition
- `lsp_find_references` — textDocument/references
- `lsp_symbols` — textDocument/documentSymbol + workspace/symbol
- `lsp_prepare_rename` — textDocument/prepareRename
- `lsp_rename` — textDocument/rename

### Cut from plan — editor UX, not agent features
- ~~`lsp_on_type_formatting`~~ — designed for keystroke-by-keystroke editing, not how AI agents write code
- ~~`lsp_document_highlight`~~ — visual highlighting in editor; `find_references` already gives the data
- ~~`lsp_folding_range`~~ — editor fold/unfold UX; AI agents don't fold code
- ~~`lsp_selection_range`~~ — editor expand-selection UX; AI agents read whole files

### New tools to add (in priority order)

#### Tier 1 — High value

| # | Tool name | LSP method(s) | RubyLSP request file | Notes |
|---|---|---|---|---|
| 1 | `lsp_hover` | `textDocument/hover` | `hover.rb` | Doc comments, method signatures, type info |
| 2 | `lsp_completion` | `textDocument/completion` + `completionItem/resolve` | `completion.rb` + `completion_resolve.rb` | Method/constant suggestions. Two methods — consider one tool with optional resolve step |
| 3 | `lsp_signature_help` | `textDocument/signatureHelp` | `signature_help.rb` | Parameter hints after typing method name |
| 4 | `lsp_code_actions` | `textDocument/codeAction` + `codeAction/resolve` | `code_actions.rb` + `code_action_resolve.rb` | Quick fixes, extract variable, extract method, switch block style |
| 5 | `lsp_formatting` | `textDocument/formatting` | `formatting.rb` | RuboCop or Syntax Tree formatting (full file) |
| 6 | `lsp_range_formatting` | `textDocument/rangeFormatting` | `range_formatting.rb` | Format selection (Syntax Tree only for Ruby) |

#### Tier 2 — Medium value

| # | Tool name | LSP method(s) | RubyLSP request file | Notes |
|---|---|---|---|---|
| 7 | `lsp_document_link` | `textDocument/documentLink` | `document_link.rb` | Clickable `# source:` links in generated files |
| 8 | `lsp_code_lens` | `textDocument/codeLens` + `codeLens/resolve` | `code_lens.rb` | Test run/debug buttons above test methods |

#### Tier 3 — More complex rendering

| # | Tool name | LSP method(s) | RubyLSP request file | Notes |
|---|---|---|---|---|
| 9 | `lsp_inlay_hints` | `textDocument/inlayHint` | `inlay_hints.rb` | Implicit rescue targets, omitted hash values. Needs range parameter |
| 10 | `lsp_semantic_tokens` | `textDocument/semanticTokens/full` | `semantic_highlighting.rb` | Token type classification. Returns delta-encoded int arrays — needs decoding |
| 11 | `lsp_type_hierarchy` | `textDocument/prepareTypeHierarchy` + `typeHierarchy/supertypes` | `prepare_type_hierarchy.rb` + `type_hierarchy_supertypes.rb` | Ancestor chain (experimental) |

#### Tier 4 — RubyLSP custom extensions

| # | Tool name | LSP method(s) | RubyLSP request file | Notes |
|---|---|---|---|---|
| 12 | `lsp_show_syntax_tree` | `rubyLsp/textDocument/showSyntaxTree` | `show_syntax_tree.rb` | Prism AST visualization |
| 13 | `lsp_workspace_dependencies` | `rubyLsp/workspace/dependencies` | (inline in server.rb) | Dependency tree |
| 14 | `lsp_discover_tests` | `rubyLsp/discoverTests` + `rubyLsp/resolveTestCommands` | `discover_tests.rb` | Test discovery |

### Skip these — RubyLSP does NOT support
- `textDocument/implementation` — not registered
- `textDocument/prepareCallHierarchy` / `callHierarchy/incomingCalls` / `callHierarchy/outgoingCalls` — not registered
- `typeHierarchy/subtypes` — returns nil

## Test strategy

- **Unit tests**: Mock `withLspClient` and verify tool parameter handling, error handling, response formatting. One test file per tool in `test/tools/`.
- **Integration tests**: One test that spawns `ruby-lsp`, opens a fixture `.rb` file, and runs each tool against it. Lives in `test/integration/`. Depends on the gem being installed — skip in CI, run locally before PR.
- Follow existing vitest patterns in the repo.

## Commit order

1. `fix: use ruby-lsp instead of rubocop --lsp in server definitions` — command swap + `.erb` + init options
2. `refactor: decompose renderers.ts into renderers/ directory` — move existing render functions
3. `refactor: extract tool registry from index.ts` — create `tool-registry.ts`
4. `refactor: switch types.ts to vscode-languageserver-protocol imports` — use package types
5. `feat: add lsp_hover tool` — first new tool, proves the pattern
6. `feat: add lsp_completion and lsp_completion_resolve tools`
7. ... one commit per tool ...
8. `test: add unit tests for new tools`
9. `test: add integration tests against ruby-lsp`

Keep commits atomic so upstream can cherry-pick individual tools.
All imports must stay as `@mariozechner/pi-*` — the `@earendil-works/pi-*` rename happens only on fork's `main`.

## PR

```bash
git push origin feat/rubylsp-full-coverage
gh pr create --repo code-yeongyu/pi-lsp-client \
  --title "feat: add full RubyLSP coverage (14 new tools)" \
  --body "Adds 14 LSP tools covering the full RubyLSP v0.26.9 feature set..."
```

Upstream is public — confirm with user before creating public PRs.

## After PR: fork main setup

Once the PR branch is done, merge to fork's `main` and apply the peer dep fix:
- `package.json`: rename all `@mariozechner/pi-ai`, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui` → `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`
- Bump versions to `0.75.5` (or whatever matches our pi-harness)
- All `src/` files: update imports from `@mariozechner/pi-coding-agent` → `@earendil-works/pi-coding-agent`
- Commit and push to fork's `main` — this is the version our pi-harness consumes

## Dev commands

```bash
bun run test            # vitest --run
bun run typecheck       # tsgo --noEmit
bun run lint            # biome check .
bun run check           # typecheck + lint
```
