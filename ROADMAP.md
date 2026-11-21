# GitPilot Roadmap

GitPilot is a simple, cross-platform Git desktop client built with **Tauri, Rust, React, and Vite**. Its goal is to make everyday Git operations understandable without requiring command-line knowledge, a subscription, or a complicated interface.

This is a living roadmap, not a fixed release schedule. Priorities may change as features are tested. **Last updated: November 20, 2026.**

## Status legend

- **Complete** — Implemented and tested.
- **Next** — The next planned development work.
- **Planned** — Agreed direction; not yet implemented.
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

## Phase 3 — Clarity and everyday usability (Next)

- [x] **Contextual tooltips** — Describe controls and Git terminology without requiring a tutorial.
- [x] **Merge direction help** — State clearly that the selected branch is merged **into the currently checked-out branch**.
- [x] **Tracking help** — Explain upstream, Ahead, Behind, and what Fetch changes.
- [x] **File status help** — Explain indicators such as `M`, `A`, `D`, `R`, `??`, and conflicted states.
- [x] **Contextual help popups** — Offer optional, short explanations for unfamiliar operations.
- [ ] **More precise Pull feedback** — Distinguish *Already up to date*, *Fast-forwarded to new commits*, and *Unable to fast-forward*.
- [ ] **Actionable error messages** — Translate common Git errors into concise explanations and next steps.
- [ ] **Refresh selected details** — When a refresh changes or removes a selected commit/file, keep its details accurate or clear the selection gracefully.

## Phase 4 — Additional Git functionality (Considering)

- [ ] **Initialize Repository** — Create a new local Git repository through the interface.
- [ ] **HTTPS authentication** — Support credential workflows in addition to SSH without storing secrets insecurely.
- [ ] **Advanced Pull options** — Consider explicit merge or rebase choices after fast-forward-only Pull is established and documented.
- [ ] **Binary file differences** — Identify binary files clearly instead of presenting a confusing empty textual diff.
- [ ] **Stash changes** — Save and restore unfinished work temporarily.
- [ ] **Discard working changes** — Revert selected uncommitted changes with clear warnings and confirmation.
- [ ] **Repository settings** — Display or edit common Git configuration, such as commit author name and email.

## Recommended implementation order (remaining work)

1. Complete **File status help**, including untracked and conflict indicators.
2. Improve **Pull feedback** and common **Git error messages** so results and next steps are clear.
3. Ensure **selected commit and file details stay accurate after refresh**.
4. Add optional **contextual help popups** only where tooltips are insufficient.
5. Handle **binary file differences** gracefully.
6. Reassess additional Git functionality (Phase 4), then plan **cross-platform testing and packaging**.

## Release preparation (Planned)

- [ ] Test builds and everyday workflows on Linux, Windows, and macOS.
- [ ] Verify application icons, native dialogs, and Git/SSH behavior on each supported platform.
- [ ] Document installation prerequisites and authentication setup.
- [ ] Build and test installable application packages for supported platforms.

## Development workflow

- Make **one incremental change at a time** and compile or test before continuing.
- Provide exact code insertion points when editing React or Rust.
- Test remote operations against a **disposable test repository** before using the main GitPilot repository.
- Prefer simple, reversible behavior and avoid destructive Git operations without explicit confirmation.
- Keep dependencies and ongoing costs minimal; avoid subscription requirements.
- Commit and push a completed, tested feature before starting the next major one.

## Maintenance

Update this file whenever a feature is completed, priorities change, or a new enhancement is agreed upon. Move completed items to the appropriate checked-off section, and keep unimplemented ideas clearly marked.