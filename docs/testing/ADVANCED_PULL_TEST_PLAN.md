# GitPilot Advanced Pull — Installation and Test Plan

Prepared November 22, 2026, from the uploaded `App(20261122-195918).jsx` and `lib(20261122-195931).rs`.

## Install

From a clean-enough working tree containing the committed HTTPS authentication checkpoint:

```bash
cd ~/Dev/gitpilot
unzip -o ~/Downloads/GitPilot-Advanced-Pull.zip -d .
npm run tauri dev
```

Only `src/App.jsx` and `src-tauri/src/lib.rs` are replaced; this guide is added to the project root. Keep your previously tested `App.css` unchanged. A separate Vite production build may be checked with `npm run build`, followed by `cargo check --manifest-path src-tauri/Cargo.toml` on your Toughbook.

## Intended behavior

- **Fast-forward Only** is the default strategy, resets after a Pull and when switching/opening a repository, and never alters divergent local history.
- **Merge** fetches first, then merges a divergent upstream using `git merge --no-ff --no-edit @{upstream}` after confirmation.
- **Rebase** fetches first, then replays divergent local commits using `git rebase --no-autostash @{upstream}` after confirmation.
- If the local branch has no remote-only commits, nothing is merged or rebased. If the local branch is behind but not ahead, all strategies fast-forward.
- Pull requires a clean worktree and index, an attached current branch, a configured upstream, and no merge/rebase/cherry-pick/revert already in progress.
- During a merge conflict, the existing Merge-in-Progress panel and Abort Merge control remain available.
- During a rebase conflict, a Rebase-in-Progress panel provides **Continue Rebase** and **Abort Rebase**. The conflict resolution buttons are relabeled **Keep Upstream** (Git `--ours`) and **Keep Local Commit** (Git `--theirs`). The **Use Edited File** button stages a manually resolved file.
- During a rebase, ordinary Commit and branch switching are unavailable. No automatic push or force-push occurs.
- Existing SSH and HTTPS credential helper behavior is preserved.

## Regression checklist (run against disposable repositories only)

- [ ] Application compiles (`npm run tauri dev`) and production frontend builds (`npm run build`).
- [ ] Fast-forward Only with no remote changes reports already up to date.
- [ ] Fast-forward Only with a remote-only commit fast-forwards and preserves file contents.
- [ ] Fast-forward Only with diverged commits rejects the update without rewriting local history.
- [ ] Merge with diverged nonconflicting commits creates a two-parent merge commit, retains both changes, and leaves working changes clean.
- [ ] Rebase with diverged nonconflicting commits replays local commits on top of upstream, and leaves working changes clean.
- [ ] Rebase with a conflicting file shows the Rebase-in-Progress panel. Abort Rebase restores the original local commit.
- [ ] Rebase with a conflicting file permits choosing upstream/local whole-file versions, or editing and staging a resolution; Continue Rebase completes and clears the banner.
- [ ] Rebase conflict resolution does not enable regular Create Commit.
- [ ] Existing GitPilot Clone / Fetch / Push / HTTPS credentials and ordinary commit flows still work.

**Important:** A rebase rewrites local commit IDs. Do not rebase commits already shared with collaborators. This update does not offer automatic force-push. If conflicts span multiple replayed commits, Continue Rebase may pause again; resolve each in sequence or abort.

## Validation performed before delivery

- JSX parsed successfully via TypeScript's JSX syntax parser.
- Frontend invokes matched backend command registrations.
- Local, disposable Git repositories exercised: fast-forward, nonconflicting merge, nonconflicting rebase, conflicted rebase abort, and conflicted rebase resolution/continue.
- **The Tauri/Rust application has not been compiled in the preparation environment** (Rust toolchain unavailable); compilation and interactive UI regression tests must be performed on the Toughbook before marking this feature complete.
