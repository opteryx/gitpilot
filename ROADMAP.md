# GitPilot Roadmap

GitPilot is a simple, cross-platform Git desktop client built with **Tauri, Rust, React, and Vite**. Its goal is to make everyday Git operations understandable without requiring command-line knowledge, a subscription, or a complicated interface.

This is a living roadmap, not a fixed release schedule. Priorities may change as features are tested. **Last updated: November 22, 2026.**

## Status legend

- **Complete** — Implemented and tested.
- **In Progress** — Some work is complete, with other work or validation remaining.
- **Next** — The next planned development work.
- **Planned** — Agreed direction; not yet implemented.
- **Deferred** — Explicitly postponed for separate design or testing.
- **Considering** — A possible enhancement, subject to scope and usability.

## Phase 1 — Core Git operations (Complete)

- [x] Open an existing local Git repository and identify its root.
- [x] Display current branch and local branches.
- [x] Create, switch, and delete local branches.
- [x] Merge a selected branch into the current branch.
- [x] Detect merge conflicts, resolve using *Keep Current* or *Keep Incoming*, and abort a merge.
- [x] Display commit history, commit metadata, messages, and changed files.
- [x] Display working changes and staged/unstaged file differences.
- [x] Colorize textual diffs (additions, removals, headers, and hunks).
- [x] Stage and unstage individual files or all files.
- [x] Create commits with an optional description separated from the summary by a blank line.
- [x] List configured remote repositories.
- [x] Show upstream tracking and ahead/behind counts.
- [x] Fetch from a remote repository.
- [x] Push the current branch to its configured upstream.
- [x] Pull using **fast-forward-only** behavior; refuse operations when local changes or divergent histories would make the operation unsafe.
- [x] Manually refresh repository information without contacting GitHub.
- [x] Automatically refresh repository information when the GitPilot window regains focus.

## Phase 2 — Repository setup and remote management (Complete)

Implemented incrementally and tested using disposable repositories.

- [x] **Clone Repository** — Accept a remote repository URL, let the user choose a local destination, and open the resulting repository in GitPilot. Support SSH first, using the existing noninteractive Git approach.
- [x] **Add Remote** — Connect an existing local repository to an existing GitHub (or other Git-hosted) repository without using a terminal.
- [x] **Manage Remotes** — View, edit, and remove configured remote URLs, distinguishing fetch and push URLs when necessary.
- [x] **Set Upstream** — Choose the remote branch tracked by a local branch; make it possible to publish a branch that has no upstream yet.
- [x] **Create GitHub Repository** — Create a GitHub repository using GitHub CLI (`gh`) authentication; SSH authentication for Git operations is separate from GitHub CLI authentication.
- [x] **Publish Repository** — Guide the user through creating or selecting a remote, attaching it to a local project, setting upstream tracking, and pushing the initial branch.

### Phase 2 design principles

- Show the exact destination and branch before any operation that publishes or changes remote configuration.
- Do not overwrite existing folders or replace remote URLs silently.
- Give clear errors for missing authentication, existing remotes, and repositories with no commits.
- Prefer using existing Git functionality rather than creating a separate implementation of Git behavior.

## Application branding (Complete)

- [x] Add the GitPilot logo to the application masthead alongside the title and subtitle.
- [x] Adjust masthead styling and logo sizing for the application layout.
- [x] Replace the default Tauri desktop/application icons with GitPilot icons, including the bundled PNG, ICNS, and ICO assets.
- [x] Verify the application displays the new icon instead of the default Tauri icon.
- [x] Commit and push the branding changes (`Add GitPilot branding and application icons`, November 20, 2026).

## Phase 3 — Clarity and everyday usability (Complete)

- [x] **Contextual tooltips** — Describe controls and Git terminology without requiring a tutorial.
- [x] **Merge direction help** — State clearly that the selected branch is merged **into the currently checked-out branch**.
- [x] **Tracking help** — Explain upstream, Ahead, Behind, and what Fetch changes.
- [x] **File status help** — Explain indicators such as `M`, `A`, `D`, `R`, `??`, and conflicted states.
- [x] **Contextual help popups** — Offer optional, short explanations for unfamiliar operations.
- [x] **More precise Pull feedback** — Distinguish *Already up to date*, *Fast-forwarded to new commits*, and *Unable to fast-forward*.
- [x] **Sidebar styling cleanup** — Standardize section headings, typography, separator spacing, and contextual help icon alignment.
- [x] **Actionable error messages** — Translate common Git errors into concise explanations and next steps.
- [x] **Refresh selected details** — When a refresh changes or removes a selected commit/file, keep its details accurate or clear the selection gracefully.

## Phase 4 — Additional Git functionality (In Progress: 5 tested, 2 deferred)

Five features were implemented and tested on Linux in a disposable repository on **November 22, 2026**. HTTPS authentication and advanced Pull are deferred and are not part of this implementation batch.

- [x] **Initialize Repository** — Initialize Git in an existing selected local folder and open the new repository in GitPilot, including repositories with no commits yet.
- [ ] **HTTPS authentication (Deferred)** — Add secure HTTPS credential workflows alongside SSH; do not store secrets insecurely.
- [ ] **Advanced Pull options (Deferred)** — Evaluate explicit merge/rebase choices in a separate design and regression-testing effort. Keep fast-forward-only Pull as the default for now.
- [x] **Binary file differences** — Identify binary content and display meaningful notices rather than unreadable output. Verified for untracked and staged binary files.
- [x] **Stash changes** — Save working changes and apply the latest stash without deleting the saved stash. Verified with a modified tracked file.
- [x] **Discard working changes** — Discard unstaged changes to a tracked file after confirmation while preserving any staged version. Verified with both unstaged-only and staged-plus-unstaged changes.
- [x] **Repository settings** — Edit repository-local commit author name and email without changing global Git configuration. Saved values were independently verified with `git config --local`.

### Phase 4 test results — November 22, 2026

- **Application build:** Vite started and the Tauri/Rust backend compiled successfully on Ubuntu 22.04.
- **Initialize Repository:** Selected an empty existing directory, initialized `main`, opened it, and successfully created the first commit.
- **Unstage regression fix:** Found that `git restore --staged` fails before the first commit because `HEAD` does not yet resolve. Updated the Rust backend; **Unstage** and **Unstage All** were both retested successfully in a repository without commits.
- **Repository author settings:** Saved `GitPilot Test` and `gitpilot-test@example.com`; confirmed both using `git config --local`.
- **Stash / Apply Latest Stash:** Stashed a tracked-file modification, confirmed a clean working tree, applied the stash, and confirmed the modification returned while the stash backup remained.
- **Discard changes:** Verified a confirmation warning and successful discard of unstaged changes. Repeated with staged and unstaged edits on the same file; the unstaged edit disappeared and the staged edit remained intact.
- **Binary file handling:** An untracked binary file displayed a no-text-preview notice; after staging, its diff displayed a clear binary-change notice.
- **Commit workflow:** Created the initial commit and a second commit containing the staged text and binary test files.

### Phase 4 safeguards and remaining validation

- **Initialize Repository** operates on a selected existing folder; it does not yet create a named folder from inside GitPilot. A possible UX enhancement is a folder-name field similar to Clone Repository.
- **Discard** is limited to unstaged changes in tracked files. It does not discard untracked files or intentionally resolve merge conflicts; staged changes are preserved.
- **Apply Latest Stash** retains the original stash entry as a backup rather than popping it.
- **Repository Author Settings** change local repository identity, not global Git identity.
- **Further regression coverage:** Test additional edge cases before release, including stash behavior with untracked files, binary diffs in commit history, conflicted/error scenarios, and cross-platform behavior.
- **Small UI cleanup:** The empty commit-history help text was made conditional on whether a repository is open. Recheck that wording in a newly initialized empty repository during the final smoke test.

## Recommended implementation order (remaining work)

1. Run a **final compile and smoke test** of the current Phase 4 code, including the latest empty-history text change; resolve any regressions.
2. **Commit and push the verified Phase 4 batch**, including the no-commit Unstage fix and this updated roadmap.
3. Expand regression coverage for remaining edge cases and prepare **Linux, Windows, and macOS** testing.
4. Design **HTTPS credential support** as a separate feature with secure platform-appropriate authentication.
5. Decide whether **advanced Pull merge/rebase** belongs in the first release; retain safe fast-forward-only Pull in the meantime.
6. Complete documentation, installers, and release packaging.

## Release preparation (Planned)

- [ ] Test builds and everyday workflows on Linux, Windows, and macOS.
- [ ] Verify application icons, native dialogs, and Git/SSH behavior on each supported platform.
- [ ] Document installation prerequisites and authentication setup.
- [ ] Build and test installable application packages for supported platforms.

## Development workflow

- Batch related low-risk edits, then compile and run focused regression tests before continuing; isolate authentication and history-rewriting operations.
- Provide exact code insertion points when editing React or Rust.
- Test remote operations against a **disposable test repository** before using the main GitPilot repository.
- Prefer simple, reversible behavior and avoid destructive Git operations without explicit confirmation.
- Keep dependencies and ongoing costs minimal; avoid subscription requirements.
- Commit and push a completed, tested feature before starting the next major one.

## Maintenance

Update this file whenever a feature is completed, priorities change, or a new enhancement is agreed upon. Move completed items to the appropriate checked-off section, and keep unimplemented ideas clearly marked.