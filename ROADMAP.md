# GitPilot Roadmap

GitPilot is a simple, cross-platform Git desktop client built with **Tauri, Rust, React, and Vite**. Its goal is to make everyday Git operations understandable without requiring command-line knowledge, a subscription, or a complicated interface.

This is a living roadmap, not a fixed release schedule. Priorities may change as features are tested.

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

## Phase 2 — Repository setup and remote management (Next)

Implement these incrementally, with a working test after each feature.

- [X] **Clone Repository** — Accept a remote repository URL, let the user choose a local destination, and open the resulting repository in GitPilot. Support SSH first, using the existing noninteractive Git approach.
- [X] **Add Remote** — Connect an existing local repository to an existing GitHub (or other Git-hosted) repository without using a terminal.
- [X] **Manage Remotes** — View, edit, and remove configured remote URLs, distinguishing fetch and push URLs when necessary.
- [X] **Set Upstream** — Choose the remote branch tracked by a local branch; make it possible to publish a branch that has no upstream yet.
- [X] **Create GitHub Repository** — Create a public or private repository in the user's GitHub account. Requires an authentication strategy; do not assume the existing Git SSH key provides GitHub API authorization.
- [X] **Publish Repository** — Guide the user through creating or selecting a remote, attaching it to a local project, setting upstream tracking, and pushing the initial branch.

### Phase 2 design principles

- Show the exact destination and branch before any operation that publishes or changes remote configuration.
- Do not overwrite existing folders or replace remote URLs silently.
- Give clear errors for missing authentication, existing remotes, and repositories with no commits.
- Prefer using existing Git functionality rather than creating a separate implementation of Git behavior.

## Phase 3 — Clarity and everyday usability (Planned)

- [X] **Contextual tooltips** — Describe controls and Git terminology without requiring a tutorial.
- [X] **Merge direction help** — State clearly that the selected branch is merged **into the currently checked-out branch**.
- [X] **Tracking help** — Explain upstream, Ahead, Behind, and what Fetch changes.
- [ ] **File status help** — Explain indicators such as `M`, `A`, `D`, `R`, `??`, and conflicted states.
- [ ] **Contextual help popups** — Offer optional, short explanations for unfamiliar operations.
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

## Recommended implementation order

1. Clone Repository.
2. Add Remote.
3. Manage Remotes and Set Upstream.
4. Add essential tooltips and improve common error messages.
5. Create GitHub Repository and Publish Repository.
6. Reassess the Phase 4 backlog based on actual usage.

## Development workflow

- Make **one incremental change at a time** and compile or test before continuing.
- Provide exact code insertion points when editing React or Rust.
- Test remote operations against a **disposable test repository** before using the main GitPilot repository.
- Prefer simple, reversible behavior and avoid destructive Git operations without explicit confirmation.
- Keep dependencies and ongoing costs minimal; avoid subscription requirements.
- Commit and push a completed, tested feature before starting the next major one.

## Maintenance

Update this file whenever a feature is completed, priorities change, or a new enhancement is agreed upon. Move completed items to the appropriate checked-off section, and keep unimplemented ideas clearly marked.
