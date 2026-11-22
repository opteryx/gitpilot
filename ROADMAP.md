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

- [x] Detect merge conflicts, resolve using **Keep Current** or **Keep Incoming**, and abort a merge.

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

- [x] **More precise Pull feedback** — Distinguish **Already up to date**, **Fast-forwarded to new commits**, and **Unable to fast-forward**.

- [x] **Sidebar styling cleanup** — Standardize section headings, typography, separator spacing, and contextual help icon alignment.

- [x] **Actionable error messages** — Translate common Git errors into concise explanations and next steps.

- [x] **Refresh selected details** — When a refresh changes or removes a selected commit/file, keep its details accurate or clear the selection gracefully.

## Phase 4 — Additional Git functionality (Complete — Linux verified)

Eight feature areas implemented and functionally tested on Ubuntu 22.04 by November 22, 2026. Cross-platform and additional edge-case testing remain part of Phase 5 release preparation.

- [x] **Initialize Repository** — Initialize Git in an existing selected local folder and open it, including repositories with no commits yet.
- [x] **HTTPS authentication** — Honor configured Git credential helpers (tested with GitHub CLI `gh auth setup-git`) without embedding or storing credentials in GitPilot; preserve SSH support and noninteractive Git operations.
- [x] **Advanced Pull options** — Explicit Fast-forward Only, Merge, and Rebase strategies; Fast-forward Only remains the default. Refuse an unsafe fast-forward on divergence and require confirmation for history-integrating modes.
- [x] **Rebase conflict recovery** — Detect paused rebase, show conflicted files, support keeping upstream or replayed local commit content, and provide Continue Rebase and Abort Rebase. Rebase-specific wording for the confirmation button was corrected after testing.
- [x] **Binary file differences** — Show meaningful binary notices instead of unreadable textual output; verified for untracked and staged binary files.
- [x] **Stash changes** — Save working changes and apply the latest stash while retaining the saved stash as a backup.
- [x] **Discard working changes** — Discard unstaged changes to tracked files after confirmation while preserving staged versions.
- [x] **Repository settings** — Edit repository-local commit author name and email without changing global configuration.

### Phase 4 test results — November 22, 2026

- **Application build:** Vite started and the Tauri/Rust backend compiled successfully on Ubuntu 22.04, including the Advanced Pull changes.
- **Initialize Repository:** Initialized an empty directory, opened the repository, and created its first commit.
- **Unstage regression fix:** Verified Unstage and Unstage All in a repository with no HEAD commit.
- **Repository author settings:** Verified local identity changes with `git config --local`.
- **Stash / Apply Latest Stash:** Saved and restored a modified tracked file; retained the stash backup.
- **Discard changes:** Verified unstaged-only and staged-plus-unstaged cases; staged changes survived.
- **Binary file handling:** Verified untracked preview and staged diff notices.
- **HTTPS authentication:** Used a private GitHub test repository to verify HTTPS Clone, Fetch, Publish Branch, Push, and Pull (both already-up-to-date and with an incoming commit).
- **Fast-forward Only:** Confirmed it remains the default and refuses divergent histories without altering commits.
- **Merge Pull:** Combined independent local and remote commits without conflicts; confirmed merge commit, clean tree, Ahead 2 / Behind 0.
- **Rebase Pull:** Replayed a local commit above the remote commit without conflicts; confirmed clean tree, Ahead 1 / Behind 0.
- **Rebase conflict detection:** Confirmed conflicted file, Rebase in Progress warning, and recovery controls.
- **Continue Rebase:** Resolved a conflict using the replayed local commit version and successfully completed the rebase.
- **Abort Rebase:** Aborted a conflicting rebase, restored the original local branch and commit, and confirmed a clean working tree with Ahead 1 / Behind 1.
- **UI label fix:** Updated the Rebase confirmation button from “Keep Incoming” to “Keep Local Commit.” The one-line change has passed `git diff --check`; the revised button text has not yet been retested in a new conflict scenario.

### Phase 4 safeguards and remaining validation

- **Initialize Repository** selects an existing folder; it does not create a named folder in GitPilot. A folder-name field is a possible later enhancement.
- **Discard** affects only unstaged changes in tracked files; it excludes untracked files and preserves staged changes.
- **Apply Latest Stash** keeps the saved stash as a backup.
- **Repository Author Settings** affect the local repository, not global Git identity.
- **Advanced Pull** defaults to Fast-forward Only, checks for uncommitted changes, and uses explicit Merge or Rebase selection for divergence. Rebase conflict recovery was tested in disposable repositories.
- **HTTPS credentials** are supplied through the user's configured Git credential helper. Cross-platform credential setup and helper availability still require validation.
- **Further regression coverage:** Test stash with untracked files, binary diffs in commit history, additional conflict/error scenarios, and the new Rebase confirmation label before release.
- **Small UI cleanup:** Recheck the empty-history wording in a newly initialized empty repository during the final smoke test.

## Phase 5 — Release preparation (Next)

1. Perform a final Linux smoke test, including the corrected Rebase dialog label and no-commit repository behavior.
2. Commit and push the completed Advanced Pull implementation, test plan, and updated roadmap. HTTPS authentication was committed separately as its own rollback checkpoint.
3. Expand edge-case and regression coverage on disposable repositories.
4. Document prerequisites (Git, platform-specific credential helpers, optional GitHub CLI), common workflows, authentication, and conflict recovery.
5. Test builds and everyday workflows on Linux, Windows, and macOS; verify native dialogs, application icons, SSH/HTTPS authentication, and filesystem behavior.
6. Build and test installable packages for supported platforms; prepare first-release documentation.

### Phase 5 release checklist (Planned)

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