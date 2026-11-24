# GitPilot Roadmap

GitPilot is a simple Git desktop client built with **Tauri, Rust, React, and Vite**, designed for eventual cross-platform support. Its goal is to make everyday Git operations understandable without requiring command-line knowledge, a subscription, or a complicated interface.

This is a living roadmap, not a fixed release schedule. Priorities may change as features are tested. **Last updated: November 24, 2026.**

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
- [x] **Section-level More Info buttons** — Add consistent help beside major headings and ensure help panels stay readable inside scrolling columns (verified on Ubuntu November 23, 2026).

- [x] **More precise Pull feedback** — Distinguish **Already up to date**, **Fast-forwarded to new commits**, and **Unable to fast-forward**.
- [x] **Sidebar styling cleanup** — Standardize section headings, typography, separator spacing, and contextual help icon alignment.

- [x] **Actionable error messages** — Translate common Git errors into concise explanations and next steps.
- [x] **Refresh selected details** — When a refresh changes or removes a selected commit/file, keep its details accurate or clear the selection gracefully.

## Phase 4 — Additional Git functionality (Complete — Linux verified)

Eight feature areas implemented and functionally tested on Ubuntu 22.04 by November 22, 2026. The final focused Linux regression pass was completed on November 23; Windows/macOS testing is deferred.

- [x] **Initialize Repository** — Initialize Git in an existing selected local folder and open it, including repositories with no commits yet.
- [x] **HTTPS authentication** — Honor configured Git credential helpers (tested with GitHub CLI `gh auth setup-git`) without embedding or storing credentials in GitPilot; preserve SSH support and noninteractive Git operations.
- [x] **Advanced Pull options** — Explicit Fast-forward Only, Merge, and Rebase strategies; Fast-forward Only remains the default. Refuse an unsafe fast-forward on divergence and require confirmation for history-integrating modes.
- [x] **Rebase conflict recovery** — Detect paused rebase, show conflicted files, support keeping upstream or replayed local commit content, and provide Continue Rebase and Abort Rebase. Rebase-specific wording for the confirmation button was corrected after testing.
- [x] **Binary file differences** — Show meaningful binary notices instead of unreadable textual output; verified for untracked and staged binary files.
- [x] **Stash changes** — Save working changes and apply the latest stash while retaining the saved stash as a backup.
- [x] **Discard working changes** — Discard unstaged changes to tracked files after confirmation while preserving staged versions.
- [x] **Repository settings** — Edit repository-local commit author name and email without changing global configuration.

### Phase 4 verification — November 22–23, 2026

- **Local workflows:** Initialized an empty repository, verified first-commit staging, repository author settings, stash/apply, discard safeguards, and binary file notices on Ubuntu 22.04.
- **Remote workflows:** Verified HTTPS Clone, Fetch, Publish Branch, Push, and Pull against a private GitHub test repository using configured Git credentials.
- **Pull strategies:** Confirmed fast-forward refusal on divergence, successful Merge and Rebase pulls, and conflict recovery using Continue Rebase and Abort Rebase.
- **Final UI regression (November 23):** Verified the corrected **Keep Local Commit** confirmation and Cancel behavior, and the empty-repository message.

See [ADVANCED_PULL_TEST_PLAN.md](docs/testing/ADVANCED_PULL_TEST_PLAN.md) for the detailed Advanced Pull test procedure.

### Phase 4 safeguards and remaining validation

- **Initialize Repository** selects an existing folder; it does not create a named folder in GitPilot. A folder-name field is a possible later enhancement.
- **Discard** affects only unstaged changes in tracked files; it excludes untracked files and preserves staged changes.
- **Apply Latest Stash** keeps the saved stash as a backup.
- **Repository Author Settings** affect the local repository, not global Git identity.
- **Advanced Pull** defaults to Fast-forward Only, checks for uncommitted changes, and uses explicit Merge or Rebase selection for divergence. Rebase conflict recovery was tested in disposable repositories.
- **HTTPS credentials** are supplied through the user's configured Git credential helper. Cross-platform credential setup and helper availability still require validation.

## Phase 5 — First Ubuntu release (Complete — November 24, 2026)

**GitPilot v0.1.0 was publicly released on November 24, 2026**, with a Debian installer tested on **Ubuntu 22.04 LTS (AMD64)**.

- [Download GitPilot v0.1.0](https://github.com/opteryx/gitpilot/releases/tag/v0.1.0)
- Installer: `GitPilot_0.1.0_amd64.deb`
- License: **GNU GPL v3 only** (`GPL-3.0-only`)
- Windows and macOS builds are **not yet available or tested**.

### Preparation and verification — November 23–24, 2026

- [x] Complete a focused Ubuntu regression pass covering repository opening and refresh, staging and commits, branch changes, stash/apply, rebase conflict cancellation and abort, and repositories without commits.
- [x] Retest the corrected **Keep Local Commit** confirmation label and Cancel behavior.
- [x] Add and visually test section-level **More Info** help buttons; correct clipping within the sidebar and details panels.
- [x] Select **GNU GPL v3 only**, add `LICENSE`, and update README and package metadata with copyright, author, license, and publisher information.
- [x] Configure Rust edition 2021 and successfully build the production React/Vite frontend and Rust application.
- [x] Correct application branding to **GitPilot**, including the Ubuntu launcher icon and application window title.
- [x] Build the Ubuntu AMD64 `.deb` package and verify its Git, WebKitGTK, and GTK dependencies without duplicate entries.
- [x] Include Debian copyright documentation and the complete GPL v3 license in the package; verify both files inside the installer and after installation.
- [x] Install and smoke-test the packaged application, including launch, native UI, icon, repository opening, working changes, commit history, and refresh.
- [x] Document Ubuntu installation and SSH/HTTPS authentication in `README.md`, and add an application screenshot.
- [x] Move historical Phase 4 testing documents into `docs/testing/` and update their roadmap reference.

### Publication — November 24, 2026

- [x] Commit and push the release-preparation and documentation changes.
- [x] Review common sensitive filenames and secret patterns in Git history before publication (limited scan; not an exhaustive security audit).
- [x] Make the GitHub repository public.
- [x] Publish the `v0.1.0` GitHub release with `GitPilot_0.1.0_amd64.deb` attached.

### Next — Post-release follow-up

- [ ] Complete a detailed third-party dependency license and attribution review. Preliminary JavaScript and cached Rust license screening found no obvious incompatibility, but was not a complete compliance audit.
- [ ] Expand troubleshooting, authentication, and conflict-recovery documentation based on user needs.
- [ ] Collect feedback from Ubuntu users and address release issues.

### Deferred — Later platforms and enhancements

- [ ] Test and package Windows and macOS releases when test machines are available, including dialogs, paths, icons, SSH/HTTPS credentials, and installed-app behavior.
- [ ] Evaluate further edge cases: stash with untracked files, binary diffs in commit history, and additional conflict/error scenarios.
- [ ] Consider creating a named folder during repository initialization, improved repository navigation, and other usability enhancements based on feedback.

## Development workflow

- Batch related low-risk edits, then compile and run focused regression tests before continuing; isolate authentication and history-rewriting operations.
- Provide exact code insertion points when editing React or Rust.

- Test remote operations against a **disposable test repository** before using the main GitPilot repository.
- Prefer simple, reversible behavior and avoid destructive Git operations without explicit confirmation.

- Keep dependencies and ongoing costs minimal; avoid subscription requirements.
- Commit and push a completed, tested feature before starting the next major one.

## Maintenance

Update this file whenever a feature is completed, priorities change, or a new enhancement is agreed upon. Move completed items to the appropriate checked-off section, and keep unimplemented ideas clearly marked.
