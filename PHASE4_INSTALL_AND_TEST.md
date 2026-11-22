# GitPilot Phase 4 — Installation and test plan

Updated November 22, 2026. This batch changes exactly four project source files: `src/App.jsx`, `src/App.css`, `src-tauri/src/lib.rs`, and `ROADMAP.md`. It adds no dependencies.

## Included features (awaiting on-device testing)

1. **Initialize Repository:** Choose an existing folder; initialize a repository there and open it immediately, including when it has no commits. Refuses nested repositories.
2. **Binary file differences:** Clearly indicate untracked, staged/unstaged, and historical binary files. Text previews of untracked files are limited to 1 MiB to protect UI responsiveness.
3. **Stash Changes / Apply Latest Stash:** Stash staged, unstaged, and untracked files; apply the latest stash only when the working directory is clean. Applying does **not** delete the backup stash. Ignored files are excluded.
4. **Discard:** Permanently discard **unstaged** changes in a tracked file, with explicit confirmation. Staged changes are preserved. Untracked files and merge conflicts cannot be discarded through this button.
5. **Repository Author Settings:** Read/update the repository-local `user.name` and `user.email`. Blank values clear local overrides; global settings are never modified.

**Not included:** HTTPS credential workflows and merge/rebase Pull modes. Existing fast-forward-only Pull is unchanged.

## Before installing

In VS Code's terminal, run:

```bash
cd ~/Dev/gitpilot
git status --short
```

Do not overwrite the project files while they contain uncommitted changes. Make a commit or back them up first. A clean output is ideal.

## Install after checking the working tree

The ZIP archive is arranged to extract into the GitPilot project root, preserving the required paths:

```text
GitPilot-Phase4.zip
├── src/
│   ├── App.jsx
│   └── App.css
├── src-tauri/
│   └── src/
│       └── lib.rs
├── ROADMAP.md
└── PHASE4_INSTALL_AND_TEST.md
```

Extract the archive into `~/Dev/gitpilot/` only after checking that the working tree is safe to overwrite. The file names are deliberately the application's normal file names.

## Build and test batches

1. **Build and launch:** Run `npm run tauri dev` from the GitPilot project root. Report any Rust compiler, Vite, or runtime errors before proceeding.
2. **Initialize & first commit:** Create a disposable directory *outside* `~/Dev/gitpilot/`, initialize it through GitPilot, verify that the app opens it with no history, then add a text file, Stage, Commit, and Refresh. Attempt to initialize the same folder again and confirm that it refuses.
3. **Binary files:** Add an untracked binary file (e.g., a PNG) in the disposable repository; select it and verify the clear non-text preview. Stage it, select Staged, commit it, and select it under Commit History. Verify explanatory notices rather than a UTF-8 error or blank diff.
4. **Stash:** Modify a tracked text file, stage it, make another unstaged edit, and add an untracked text file. Click Stash Changes and confirm that all three changes disappear from Working Changes. Apply Latest Stash and confirm that all return in their original states; the stash entry should remain.
5. **Discard:** With a tracked file containing both staged and unstaged changes, confirm Discard removes only the unstaged changes. Canceling its warning must do nothing. Confirm the button is absent on untracked and conflicted entries.
6. **Author settings:** Set a test author name and email in the disposable repository, close/reopen the dialog and verify persistence. Confirm `git config --local --get user.name` and `git config --local --get user.email` match the values. Empty fields should remove local overrides.
7. **Regression:** Open an existing disposable remote-connected repo and smoke-test Refresh, Fetch, Push, fast-forward-only Pull, branch switching, staging, and commit details as applicable.

Only mark Phase 4 checkboxes complete and commit/push these changes after the respective tests pass.

## Validation performed outside your Toughbook

- JavaScript JSX transpiler syntax check: passed.
- CSS parser: passed.
- Registration/calls for all seven new Tauri commands: verified.
- Equivalent Git CLI operations exercised in temporary disposable repositories: initialize, empty HEAD, nested repository check, stash/apply with stage preservation, discard while keeping staged data, repository-local config, and binary diff indication all passed.
- Full Rust/Tauri compilation and graphical UI tests: **not available in this environment**. The first on-device build is required.
