use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

// Shared Git command runner for upcoming remote operations. Git's arguments
// are passed separately (not through a shell) to avoid shell interpretation.
// Existing local commands remain unchanged to preserve tested behavior.
fn run_git(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .args(args)
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("Git exited with status {}", output.status)
        } else {
            stderr
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
fn get_repository_root(repo_path: String) -> Result<String, String> {
    run_git(&repo_path, &["rev-parse", "--show-toplevel"])
}

#[tauri::command]
fn get_upstream_status(repo_path: String) -> Result<String, String> {
    // During a rebase HEAD is detached, so no current-branch upstream exists.
    // Return an empty tracking display rather than breaking repository refresh.
    if run_git(&repo_path, &["symbolic-ref", "-q", "HEAD"]).is_err() {
        return Ok(String::new());
    }
    // An initialized repository has a branch name but no HEAD commit yet.
    if run_git(&repo_path, &["rev-parse", "--verify", "HEAD"]).is_err() {
        return Ok(String::new());
    }

    let upstream = run_git(
        &repo_path,
        &[
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ],
    );

    let upstream = match upstream {
        Ok(name) => name,
        Err(error) if error.contains("no upstream configured") || error.contains("no upstream") => {
            return Ok(String::new());
        }
        Err(error) => return Err(error),
    };

    let counts = run_git(
        &repo_path,
        &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
    )?;

    Ok(format!("{}|{}", upstream, counts.replace('\t', "|")))
}

#[tauri::command]
fn set_upstream(repo_path: String, remote_branch: String) -> Result<String, String> {
    let target = remote_branch.trim();

    if target.is_empty() || target.starts_with('-') {
        return Err("Select a valid remote branch.".to_string());
    }

    let current_branch = run_git(&repo_path, &["branch", "--show-current"])?;

    if current_branch.is_empty() {
        return Err("Cannot set upstream: HEAD is detached.".to_string());
    }

    // Confirm the requested remote-tracking branch exists locally.
    let reference = format!("refs/remotes/{target}");

    run_git(&repo_path, &["show-ref", "--verify", &reference])
        .map_err(|_| format!("Remote branch '{target}' was not found. Fetch first."))?;

    // Configure tracking without pushing or pulling.
    run_git(
        &repo_path,
        &[
            "branch",
            &format!("--set-upstream-to={target}"),
            &current_branch,
        ],
    )?;

    Ok(format!("Branch '{current_branch}' now tracks '{target}'."))
}

#[tauri::command]
fn get_remotes(repo_path: String) -> Result<String, String> {
    run_git(&repo_path, &["remote", "-v"])
}

#[tauri::command]
fn get_remote_branches(repo_path: String) -> Result<Vec<String>, String> {
    let output = run_git(&repo_path, &["branch", "-r", "--format=%(refname:short)"])?;

    Ok(output
        .lines()
        .filter(|line| !line.ends_with("/HEAD"))
        .map(str::to_string)
        .collect())
}

#[tauri::command]
fn add_remote(
    repo_path: String,
    remote_name: String,
    remote_url: String,
) -> Result<String, String> {
    let name = remote_name.trim();
    let url = remote_url.trim();

    if name.is_empty() || name.starts_with('-') {
        return Err("Enter a valid remote name.".to_string());
    }

    if url.is_empty() || url.starts_with('-') {
        return Err("Enter a valid remote repository URL.".to_string());
    }

    // Validate the name using Git's own naming rules.
    run_git(
        &repo_path,
        &[
            "check-ref-format",
            "--allow-onelevel",
            &format!("refs/remotes/{name}"),
        ],
    )
    .map_err(|_| "Invalid remote name.".to_string())?;

    // Prevent duplicate remote names.
    let existing = run_git(&repo_path, &["remote"])?;

    if existing.lines().any(|remote| remote == name) {
        return Err(format!("Remote '{name}' already exists."));
    }

    // Add the remote without fetching or pushing any data.
    run_git(&repo_path, &["remote", "add", name, url])?;

    Ok(format!("Remote '{name}' added successfully."))
}

#[tauri::command]
fn update_remote_url(
    repo_path: String,
    remote_name: String,
    remote_url: String,
) -> Result<String, String> {
    let name = remote_name.trim();
    let url = remote_url.trim();

    if name.is_empty() || name.starts_with('-') {
        return Err("Invalid remote name.".to_string());
    }

    if url.is_empty() || url.starts_with('-') {
        return Err("Enter a valid remote repository URL.".to_string());
    }

    // Confirm that the remote exists.
    let existing = run_git(&repo_path, &["remote"])?;

    if !existing.lines().any(|remote| remote == name) {
        return Err(format!("Remote '{name}' does not exist."));
    }

    // Update only the URL. No fetch or push is performed.
    run_git(&repo_path, &["remote", "set-url", name, url])?;

    Ok(format!("Remote '{name}' URL updated successfully."))
}

#[tauri::command]
fn remove_remote(repo_path: String, remote_name: String) -> Result<String, String> {
    let name = remote_name.trim();

    if name.is_empty() || name.starts_with('-') {
        return Err("Invalid remote name.".to_string());
    }

    // Confirm that the remote exists.
    let existing = run_git(&repo_path, &["remote"])?;

    if !existing.lines().any(|remote| remote == name) {
        return Err(format!("Remote '{name}' does not exist."));
    }

    // Remove the remote from the local Git configuration.
    run_git(&repo_path, &["remote", "remove", name])?;

    Ok(format!("Remote '{name}' removed successfully."))
}

#[tauri::command]
async fn push_current_branch(repo_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let branch = run_git(&repo_path, &["branch", "--show-current"])?;

        if branch.is_empty() {
            return Err("Cannot push: HEAD is detached.".to_string());
        }

        let upstream = run_git(
            &repo_path,
            &[
                "rev-parse",
                "--abbrev-ref",
                "--symbolic-full-name",
                "@{upstream}",
            ],
        )
        .map_err(|_| {
            "This branch has no upstream configured. Set an upstream before pushing.".to_string()
        })?;

        // An upstream normally has the form "origin/main".
        // Resolve the configured remote and its branch separately.
        let (remote, remote_branch) = upstream.split_once('/').ok_or_else(|| {
            format!("Unable to identify the remote branch from '{upstream}'.")
        })?;

        // Verify that the remote exists.
        let remotes = run_git(&repo_path, &["remote"])?;
        if !remotes.lines().any(|name| name == remote) {
            return Err(format!("Remote '{remote}' is not configured."));
        }

        let refspec = format!("refs/heads/{branch}:refs/heads/{remote_branch}");

        let mut child = Command::new("git")
            .arg("-C")
            .arg(&repo_path)
            .args(["-c", "core.askPass="])
            .args(["-c", "http.lowSpeedLimit=1000"])
            .args(["-c", "http.lowSpeedTime=20"])
            .args(["push", "--porcelain", "--", remote, &refspec])
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GCM_INTERACTIVE", "Never")
            .env("GIT_ASKPASS", "false")
            .env("SSH_ASKPASS", "false")
            .env(
                "GIT_SSH_COMMAND",
                "ssh -o BatchMode=yes -o ConnectTimeout=10",
            )
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("Unable to start Git push: {error}"))?;

        // Read both output streams while Git runs.
        let mut stdout = child.stdout.take().ok_or("Missing push stdout")?;
        let mut stderr = child.stderr.take().ok_or("Missing push stderr")?;

        let stdout_reader = std::thread::spawn(move || {
            let mut bytes = Vec::new();
            stdout.read_to_end(&mut bytes).map(|_| bytes)
        });

        let stderr_reader = std::thread::spawn(move || {
            let mut bytes = Vec::new();
            stderr.read_to_end(&mut bytes).map(|_| bytes)
        });

        // Allow Git up to 45 seconds to finish.
        let started = Instant::now();
        let timeout = Duration::from_secs(45);

        let (status, timed_out) = loop {
            match child.try_wait() {
                Ok(Some(status)) => break (status, false),

                Ok(None) if started.elapsed() >= timeout => {
                    let _ = child.kill();
                    let status = child.wait().map_err(|error| error.to_string())?;
                    break (status, true);
                }

                Ok(None) => std::thread::sleep(Duration::from_millis(100)),

                Err(error) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!("Unable to monitor Git push: {error}"));
                }
            }
        };

        let stdout = stdout_reader
            .join()
            .map_err(|_| "Unable to read Git push output".to_string())?
            .map_err(|error| error.to_string())?;

        let stderr = stderr_reader
            .join()
            .map_err(|_| "Unable to read Git push errors".to_string())?
            .map_err(|error| error.to_string())?;

        let stdout = String::from_utf8_lossy(&stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&stderr).trim().to_string();

        if timed_out {
            return Err(
                "Push timed out after 45 seconds. Check your network connection and Git credentials."
                    .to_string(),
            );
        }

        if !status.success() {
            return Err(if stderr.is_empty() {
                format!("Push failed (exit status {status}). {stdout}")
            } else {
                format!("Push failed: {stderr}")
            });
        }

        Ok(format!(
            "Successfully pushed branch '{}' to '{}'.",
            branch, upstream
        ))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn publish_branch(repo_path: String, remote_name: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let remote = remote_name.trim();

        if remote.is_empty() || remote.starts_with('-') {
            return Err("Select a valid remote.".to_string());
        }

        let remotes = run_git(&repo_path, &["remote"])?;

        if !remotes.lines().any(|name| name == remote) {
            return Err(format!("Remote '{remote}' is not configured."));
        }

        let branch = run_git(&repo_path, &["branch", "--show-current"])?;

        if branch.is_empty() {
            return Err("Cannot publish: HEAD is detached.".to_string());
        }

        // Publishing is intended for branches without an upstream.
        if run_git(&repo_path, &["rev-parse", "--verify", "@{upstream}"]).is_ok() {
            return Err("This branch already has an upstream. Use Push instead.".to_string());
        }

        // Require at least one commit.
        run_git(&repo_path, &["rev-parse", "--verify", "HEAD"])
            .map_err(|_| "Create a commit before publishing.".to_string())?;

        // Publish only a new remote branch.
        // The lease below rejects an existing destination branch.
        let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");

        // Create the remote branch only if it does not already exist.
        // An empty expected value means the destination must be absent.
        let create_only_lease = format!("--force-with-lease=refs/heads/{branch}:");

        let mut child = Command::new("git")
            .arg("-C")
            .arg(&repo_path)
            .args(["-c", "core.askPass="])
            .args(["-c", "http.lowSpeedLimit=1000"])
            .args(["-c", "http.lowSpeedTime=20"])
            .args([
                "push",
                "--porcelain",
                &create_only_lease,
                "--set-upstream",
                "--",
                remote,
                &refspec,
            ])
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GCM_INTERACTIVE", "Never")
            .env("GIT_ASKPASS", "false")
            .env("SSH_ASKPASS", "false")
            .env(
                "GIT_SSH_COMMAND",
                "ssh -o BatchMode=yes -o ConnectTimeout=10",
            )
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("Unable to start Git push: {error}"))?;

        let mut stdout = child.stdout.take().ok_or("Missing push stdout")?;
        let mut stderr = child.stderr.take().ok_or("Missing push stderr")?;

        let stdout_reader = std::thread::spawn(move || {
            let mut bytes = Vec::new();
            stdout.read_to_end(&mut bytes).map(|_| bytes)
        });

        let stderr_reader = std::thread::spawn(move || {
            let mut bytes = Vec::new();
            stderr.read_to_end(&mut bytes).map(|_| bytes)
        });

        let started = Instant::now();
        let timeout = Duration::from_secs(45);

        let (status, timed_out) = loop {
            match child.try_wait() {
                Ok(Some(status)) => break (status, false),

                Ok(None) if started.elapsed() >= timeout => {
                    let _ = child.kill();
                    let status = child.wait().map_err(|error| error.to_string())?;
                    break (status, true);
                }

                Ok(None) => std::thread::sleep(Duration::from_millis(100)),

                Err(error) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!("Unable to monitor Git push: {error}"));
                }
            }
        };

        let stdout = stdout_reader
            .join()
            .map_err(|_| "Unable to read Git push output".to_string())?
            .map_err(|error| error.to_string())?;

        let stderr = stderr_reader
            .join()
            .map_err(|_| "Unable to read Git push errors".to_string())?
            .map_err(|error| error.to_string())?;

        let stdout = String::from_utf8_lossy(&stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&stderr).trim().to_string();

        if timed_out {
            return Err(
                "Publish timed out after 45 seconds. Check the remote before retrying.".to_string(),
            );
        }

        if !status.success() {
            return Err(if stderr.is_empty() {
                format!("Publish failed: {stdout}")
            } else {
                format!("Publish failed: {stderr}")
            });
        }

        Ok(format!(
            "Published '{branch}' to '{remote}/{branch}' and configured upstream tracking."
        ))
    })
    .await
    .map_err(|error| error.to_string())?
}

// Find the Git directory even for linked worktrees, whose .git is a file.
fn rebase_in_progress(repo_path: &str) -> Result<bool, String> {
    let git_dir = run_git(repo_path, &["rev-parse", "--absolute-git-dir"])?;
    let git_dir = std::path::Path::new(&git_dir);
    Ok(git_dir.join("rebase-merge").is_dir() || git_dir.join("rebase-apply").is_dir())
}

#[tauri::command]
fn get_rebase_status(repo_path: String) -> Result<bool, String> {
    rebase_in_progress(&repo_path)
}

// Git rebase may otherwise launch an editor and hang the desktop app. Keep
// existing commit messages; do not ask for a new message interactively.
fn run_rebase_git(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .args(args)
        .env("GIT_EDITOR", "true")
        .env("GIT_SEQUENCE_EDITOR", "true")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_ASKPASS", "false")
        .env("SSH_ASKPASS", "false")
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("Unable to run Git rebase: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("Git rebase exited with status {}", output.status)
        } else {
            stderr
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
async fn continue_rebase(repo_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !rebase_in_progress(&repo_path)? {
            return Err("No rebase is in progress.".to_string());
        }
        if !run_git(&repo_path, &["ls-files", "-u"])?.is_empty() {
            return Err("Resolve and stage every conflicted file before continuing the rebase.".into());
        }
        match run_rebase_git(&repo_path, &["rebase", "--continue"]) {
            Ok(_) => {
                if rebase_in_progress(&repo_path)? {
                    Ok("Rebase advanced. Resolve any remaining conflicts, then Continue Rebase again.".into())
                } else {
                    Ok("Rebase completed successfully. Review the new commit history before pushing.".into())
                }
            }
            Err(error) => {
                if rebase_in_progress(&repo_path)? {
                    Err(format!(
                        "Rebase is still in progress. Resolve and stage remaining conflicts, or Abort Rebase. Git details: {error}"
                    ))
                } else {
                    Err(format!("Unable to continue rebase: {error}"))
                }
            }
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn abort_rebase(repo_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !rebase_in_progress(&repo_path)? {
            return Err("No rebase is in progress.".to_string());
        }
        run_rebase_git(&repo_path, &["rebase", "--abort"])?;
        Ok("Rebase aborted; the original branch and commits were restored.".into())
    })
    .await
    .map_err(|error| error.to_string())?
}

// Check whether the repository is ready for any pull strategy.
fn check_pull_safety(repo_path: &str) -> Result<(), String> {
    if rebase_in_progress(repo_path)? {
        return Err("Cannot pull during a rebase. Continue or abort the rebase first.".into());
    }
    // Refuse to pull while a merge is in progress.
    let merge_head = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .args(["rev-parse", "-q", "--verify", "MERGE_HEAD"])
        .output()
        .map_err(|error| error.to_string())?;

    if merge_head.status.success() {
        return Err(
            "Cannot pull while a merge is in progress. Complete or abort the merge first."
                .to_string(),
        );
    }

    for reference in ["CHERRY_PICK_HEAD", "REVERT_HEAD"] {
        if run_git(repo_path, &["rev-parse", "-q", "--verify", reference]).is_ok() {
            return Err("Finish or abort the current cherry-pick/revert before pulling.".into());
        }
    }

    // Require a clean working directory and staging area.
    let changes = run_git(repo_path, &["status", "--porcelain"])?;

    if !changes.is_empty() {
        return Err(
            "Cannot pull with uncommitted changes. Commit or discard your changes first."
                .to_string(),
        );
    }

    Ok(())
}

// An explicit strategy is required from the front end; fast-forward only
// remains the default. Fetch is always performed first via the tested HTTPS/SSH
// implementation, then the local update is run on a background worker.
#[tauri::command]
async fn pull_current_branch(repo_path: String, pull_mode: String) -> Result<String, String> {
    if !["ff-only", "merge", "rebase"].contains(&pull_mode.as_str()) {
        return Err("Invalid Pull strategy. Choose Fast-forward Only, Merge or Rebase.".into());
    }
    let check_path = repo_path.clone();
    let (branch, remote, upstream) = tauri::async_runtime::spawn_blocking(move || {
        check_pull_safety(&check_path)?;
        let branch = run_git(&check_path, &["branch", "--show-current"])?;
        if branch.is_empty() {
            return Err("Cannot pull: HEAD is detached.".to_string());
        }
        let upstream = run_git(
            &check_path,
            &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
        )
        .map_err(|_| "Cannot pull: this branch has no upstream configured.".to_string())?;
        let (remote, _) = upstream.split_once('/')
            .ok_or_else(|| format!("Cannot identify remote for '{upstream}'."))?;
        Ok::<(String, String, String), String>((branch, remote.to_string(), upstream))
    })
    .await
    .map_err(|error| error.to_string())??;

    // Reuse credential helpers, timeouts, and safeguards of Fetch.
    fetch_remote(repo_path.clone(), remote).await?;

    tauri::async_runtime::spawn_blocking(move || {
        check_pull_safety(&repo_path)?;
        if run_git(&repo_path, &["branch", "--show-current"])? != branch {
            return Err("The checked-out branch changed during Fetch. Pull was canceled.".into());
        }
        let current_upstream = run_git(
            &repo_path,
            &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
        )?;
        if current_upstream != upstream {
            return Err("The upstream branch changed during Fetch. Pull was canceled.".into());
        }
        let counts = run_git(
            &repo_path,
            &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
        )?;
        let mut parts = counts.split_whitespace();
        let ahead = parts.next().and_then(|v| v.parse::<u64>().ok())
            .ok_or_else(|| format!("Invalid ahead count: '{counts}'."))?;
        let behind = parts.next().and_then(|v| v.parse::<u64>().ok())
            .ok_or_else(|| format!("Invalid behind count: '{counts}'."))?;
        if parts.next().is_some() {
            return Err(format!("Unexpected Git ahead/behind counts: '{counts}'."));
        }

        if behind == 0 {
            return Ok(if ahead == 0 {
                format!("Already up to date. Branch '{branch}' matches its upstream.")
            } else {
                format!("No remote commits to pull. Branch '{branch}' is ahead by {ahead} local commit(s).")
            });
        }

        // When the history can fast-forward, use that safe operation for all
        // strategies. Do not create an unnecessary merge or rebase.
        if ahead == 0 {
            run_git(&repo_path, &["merge", "--ff-only", "@{upstream}"])
                .map_err(|error| format!("Could not fast-forward '{branch}': {error}"))?;
            return Ok(format!(
                "Fast-forward successful. Updated branch '{branch}' with {behind} remote commit(s)."
            ));
        }

        match pull_mode.as_str() {
            "ff-only" => Err(format!(
                "Cannot fast-forward '{branch}': histories diverged ({ahead} local, {behind} remote-only commits). No local commits were changed. Choose Merge or Rebase explicitly to integrate them."
            )),
            "merge" => match run_git(&repo_path, &["merge", "--no-ff", "--no-edit", "@{upstream}"]) {
                Ok(_) => Ok(format!(
                    "Merge pull completed on '{branch}'. A merge commit combines {ahead} local and {behind} remote-only commit(s)."
                )),
                Err(error) => {
                    if get_merge_status(repo_path.clone())? {
                        Err(format!(
                            "Merge stopped with conflicts. Resolve them and create a merge commit, or use Abort Merge. Git details: {error}"
                        ))
                    } else {
                        Err(format!("Merge pull failed: {error}"))
                    }
                }
            },
            "rebase" => match run_rebase_git(&repo_path, &["rebase", "--no-autostash", "@{upstream}"]) {
                Ok(_) => Ok(format!(
                    "Rebase completed. Replayed {ahead} local commit(s) on top of {behind} remote-only commit(s). Local commit IDs may have changed; review before pushing."
                )),
                Err(error) => {
                    if rebase_in_progress(&repo_path)? {
                        Err(format!(
                            "Rebase paused. Resolve conflicts, then Continue Rebase, or choose Abort Rebase to restore the original commits. Git details: {error}"
                        ))
                    } else {
                        Err(format!("Rebase pull failed: {error}"))
                    }
                }
            },
            _ => unreachable!("Pull strategy validated above"),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

// Fetch runs on a blocking worker, not the Tauri UI thread. Git may use a
// previously configured credential helper (such as GitHub CLI) for HTTPS.
// Terminal and askpass prompts remain disabled to avoid hanging the UI.
#[tauri::command]
async fn fetch_remote(repo_path: String, remote_name: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let remote = remote_name.trim();
        if remote.is_empty() || remote.starts_with('-') {
            return Err("Choose a valid remote to fetch.".to_string());
        }

        // Resolve the remote by its configured name, not as an arbitrary URL.
        let names = run_git(&repo_path, &["remote"])?;
        if !names.lines().any(|name| name == remote) {
            return Err(format!("Remote '{remote}' is not configured for this repository."));
        }

        let mut child = Command::new("git")
            .arg("-C")
            .arg(&repo_path)
            // Honor preconfigured HTTPS helpers while blocking interactive prompts.
            .args(["-c", "core.askPass="])
            .args(["-c", "http.lowSpeedLimit=1000"])
            .args(["-c", "http.lowSpeedTime=20"])
            .args(["fetch", "--quiet", "--", remote])
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GCM_INTERACTIVE", "Never")
            .env("GIT_ASKPASS", "false")
            .env("SSH_ASKPASS", "false")
            .env("GIT_SSH_COMMAND", "ssh -o BatchMode=yes -o ConnectTimeout=10")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("Unable to start Git fetch: {error}"))?;

        // Drain both pipes concurrently, preventing a chatty child from
        // blocking while the parent waits for it to exit.
        let mut stdout = child.stdout.take().ok_or("Missing fetch stdout")?;
        let mut stderr = child.stderr.take().ok_or("Missing fetch stderr")?;
        let stdout_reader = std::thread::spawn(move || {
            let mut bytes = Vec::new();
            stdout.read_to_end(&mut bytes).map(|_| bytes)
        });
        let stderr_reader = std::thread::spawn(move || {
            let mut bytes = Vec::new();
            stderr.read_to_end(&mut bytes).map(|_| bytes)
        });

        let started = Instant::now();
        let timeout = Duration::from_secs(45);
        let (status, timed_out) = loop {
            match child.try_wait() {
                Ok(Some(status)) => break (status, false),
                Ok(None) if started.elapsed() >= timeout => {
                    // Reap the process after terminating it.
                    let _ = child.kill();
                    let status = child.wait().map_err(|error| error.to_string())?;
                    break (status, true);
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(100)),
                Err(error) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!("Unable to monitor Git fetch: {error}"));
                }
            }
        };

        let stdout = stdout_reader
            .join()
            .map_err(|_| "Unable to read Git fetch output".to_string())?
            .map_err(|error| error.to_string())?;
        let stderr = stderr_reader
            .join()
            .map_err(|_| "Unable to read Git fetch errors".to_string())?
            .map_err(|error| error.to_string())?;
        let stdout = String::from_utf8_lossy(&stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&stderr).trim().to_string();

        if timed_out {
            return Err("Fetch timed out after 45 seconds. Check your network connection and Git credentials.".to_string());
        }
        if !status.success() {
            return Err(if stderr.is_empty() {
                format!("Fetch failed (exit status {status}).")
            } else {
                format!("Fetch failed: {stderr}")
            });
        }
        if !stderr.is_empty() {
            Ok(stderr)
        } else if !stdout.is_empty() {
            Ok(stdout)
        } else {
            Ok(format!("Fetch from {remote} completed. No new updates reported."))
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

// Clone a remote repository into a new local folder.
#[tauri::command]
async fn clone_repository(
    repository_url: String,
    destination: String,
    folder_name: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use std::path::{Component, Path};

        let url = repository_url.trim();
        let name = folder_name.trim();

        // Validate the repository URL.
        if url.is_empty() || url.starts_with('-') {
            return Err("Enter a valid repository URL.".to_string());
        }

        // Require a single folder name, not a path.
        let mut components = Path::new(name).components();

        if name.is_empty()
            || name.contains('/')
            || name.contains('\\')
            || name.contains(':')
            || name.starts_with('-')
            || !matches!(components.next(), Some(Component::Normal(_)))
            || components.next().is_some()
        {
            return Err("Enter a valid repository folder name.".to_string());
        }

        // The destination must be an existing directory.
        let parent = Path::new(destination.trim())
            .canonicalize()
            .map_err(|error| format!("Invalid destination folder: {error}"))?;

        if !parent.is_dir() {
            return Err("The destination must be a directory.".to_string());
        }

        let target = parent.join(name);

        // Never overwrite an existing folder.
        if target.exists() {
            return Err(format!(
                "The destination folder '{}' already exists.",
                target.display()
            ));
        }

        // Launch Git without involving a command shell.
        let mut child = Command::new("git")
            .args(["-c", "core.askPass="])
            .args(["-c", "http.lowSpeedLimit=1000"])
            .args(["-c", "http.lowSpeedTime=20"])
            .arg("clone")
            .arg("--")
            .arg(url)
            .arg(&target)
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GCM_INTERACTIVE", "Never")
            .env("GIT_ASKPASS", "false")
            .env("SSH_ASKPASS", "false")
            .env(
                "GIT_SSH_COMMAND",
                "ssh -o BatchMode=yes -o ConnectTimeout=10",
            )
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("Unable to start Git clone: {error}"))?;

        // Read stdout and stderr concurrently to avoid blocking.
        let mut stdout = child.stdout.take().ok_or("Missing clone stdout")?;
        let mut stderr = child.stderr.take().ok_or("Missing clone stderr")?;

        let stdout_reader = std::thread::spawn(move || {
            let mut bytes = Vec::new();
            stdout.read_to_end(&mut bytes).map(|_| bytes)
        });

        let stderr_reader = std::thread::spawn(move || {
            let mut bytes = Vec::new();
            stderr.read_to_end(&mut bytes).map(|_| bytes)
        });

        // Allow up to two minutes for the clone.
        let started = Instant::now();
        let timeout = Duration::from_secs(120);

        let (status, timed_out) = loop {
            match child.try_wait() {
                Ok(Some(status)) => break (status, false),

                Ok(None) if started.elapsed() >= timeout => {
                    let _ = child.kill();
                    let status = child.wait().map_err(|error| error.to_string())?;
                    break (status, true);
                }

                Ok(None) => std::thread::sleep(Duration::from_millis(100)),

                Err(error) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!("Unable to monitor Git clone: {error}"));
                }
            }
        };

        let stdout = stdout_reader
            .join()
            .map_err(|_| "Unable to read Git clone output".to_string())?
            .map_err(|error| error.to_string())?;

        let stderr = stderr_reader
            .join()
            .map_err(|_| "Unable to read Git clone errors".to_string())?
            .map_err(|error| error.to_string())?;

        let stdout = String::from_utf8_lossy(&stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&stderr).trim().to_string();

        if timed_out {
            return Err("Clone timed out after 120 seconds. \
                 Check your network connection and Git credentials. \
                 A partial destination folder may remain."
                .to_string());
        }

        if !status.success() {
            return Err(if stderr.is_empty() {
                format!("Clone failed (exit status {status}). {stdout}")
            } else {
                format!("Clone failed: {stderr}")
            });
        }

        // Return the cloned directory path for GitPilot to open.
        let cloned_path = target
            .canonicalize()
            .map_err(|error| format!("Clone completed, but cannot locate the folder: {error}"))?;

        Ok(cloned_path.to_string_lossy().to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

// Create a new repository in the authenticated GitHub account.
// This does not clone, attach a remote, or push local files.
#[tauri::command]
async fn create_github_repository(
    repository_name: String,
    description: String,
    is_private: bool,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let name = repository_name.trim();

        if name.is_empty()
            || name.starts_with('-')
            || !name
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
        {
            return Err("Enter a valid GitHub repository name.".to_string());
        }

        let visibility = if is_private { "--private" } else { "--public" };

        let output = Command::new("gh")
            .args([
                "repo",
                "create",
                name,
                visibility,
                "--description",
                description.trim(),
            ])
            .env("GH_PROMPT_DISABLED", "1")
            .stdin(Stdio::null())
            .output()
            .map_err(|error| {
                format!("Unable to start GitHub CLI. Make sure 'gh' is installed: {error}")
            })?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "GitHub repository creation failed: {}",
                error.trim()
            ));
        }

        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
fn get_current_branch(repo_path: String) -> Result<String, String> {
    run_git(&repo_path, &["branch", "--show-current"])
}

#[tauri::command]
fn get_local_branches(repo_path: String) -> Result<Vec<String>, String> {
    Ok(
        run_git(&repo_path, &["branch", "--format=%(refname:short)"])?
            .lines()
            .map(str::to_string)
            .collect(),
    )
}

#[tauri::command]
fn switch_branch(repo_path: String, branch_name: String) -> Result<(), String> {
    run_git(&repo_path, &["switch", "--", &branch_name])?;
    Ok(())
}

#[tauri::command]
fn create_branch(repo_path: String, branch_name: String) -> Result<(), String> {
    let name = branch_name.trim();
    if name.is_empty() {
        return Err("Branch name cannot be empty.".to_string());
    }
    run_git(&repo_path, &["branch", name])?;
    Ok(())
}

#[tauri::command]
fn delete_branch(repo_path: String, branch_name: String) -> Result<(), String> {
    let name = branch_name.trim();
    if name.is_empty() {
        return Err("Branch name cannot be empty.".to_string());
    }
    run_git(&repo_path, &["branch", "-d", "--", name])?;
    Ok(())
}

#[tauri::command]
fn merge_branch(repo_path: String, branch_name: String) -> Result<String, String> {
    let name = branch_name.trim();
    if name.is_empty() {
        return Err("Branch name cannot be empty.".to_string());
    }
    run_git(&repo_path, &["merge", name])
}

#[tauri::command]
fn get_merge_status(repo_path: String) -> Result<bool, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(&repo_path)
        .args(["rev-parse", "-q", "--verify", "MERGE_HEAD"])
        .output()
        .map_err(|error| error.to_string())?;

    Ok(output.status.success())
}

#[tauri::command]
fn abort_merge(repo_path: String) -> Result<(), String> {
    run_git(&repo_path, &["merge", "--abort"])?;
    Ok(())
}

#[tauri::command]
fn resolve_conflict_current(repo_path: String, file_path: String) -> Result<(), String> {
    let checkout = std::process::Command::new("git")
        .arg("-C")
        .arg(&repo_path)
        .arg("checkout")
        .arg("--ours")
        .arg("--")
        .arg(&file_path)
        .output()
        .map_err(|err| err.to_string())?;

    if !checkout.status.success() {
        return Err(String::from_utf8_lossy(&checkout.stderr).trim().to_string());
    }

    let stage = std::process::Command::new("git")
        .arg("-C")
        .arg(&repo_path)
        .arg("add")
        .arg("--")
        .arg(&file_path)
        .output()
        .map_err(|err| err.to_string())?;

    if !stage.status.success() {
        return Err(String::from_utf8_lossy(&stage.stderr).trim().to_string());
    }

    Ok(())
}

#[tauri::command]
fn resolve_conflict_incoming(repo_path: String, file_path: String) -> Result<(), String> {
    let checkout = std::process::Command::new("git")
        .arg("-C")
        .arg(&repo_path)
        .arg("checkout")
        .arg("--theirs")
        .arg("--")
        .arg(&file_path)
        .output()
        .map_err(|err| err.to_string())?;

    if !checkout.status.success() {
        return Err(String::from_utf8_lossy(&checkout.stderr).trim().to_string());
    }

    let stage = std::process::Command::new("git")
        .arg("-C")
        .arg(&repo_path)
        .arg("add")
        .arg("--")
        .arg(&file_path)
        .output()
        .map_err(|err| err.to_string())?;

    if !stage.status.success() {
        return Err(String::from_utf8_lossy(&stage.stderr).trim().to_string());
    }

    Ok(())
}

#[tauri::command]
fn get_commit_history(repo_path: String) -> Result<String, String> {
    // A repository created by `git init` has no HEAD commit yet. Its history
    // is empty, not an error, so it can be opened immediately in GitPilot.
    if run_git(&repo_path, &["rev-parse", "--verify", "HEAD"]).is_err() {
        return Ok(String::new());
    }

    let output = Command::new("git")
        .arg("-C")
        .arg(&repo_path)
        .args([
            "log",
            "-n",
            "50",
            "--date=short",
            "--pretty=format:%h|%ad|%an|%s",
        ])
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
fn get_commit_message(repo_path: String, commit_sha: String) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(&repo_path)
        .args(["show", "-s", "--format=%B", &commit_sha])
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
fn get_commit_files(repo_path: String, commit_sha: String) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(&repo_path)
        .args([
            "diff-tree",
            "--root",
            "-m",
            "--first-parent",
            "--no-commit-id",
            "--name-status",
            "-r",
            &commit_sha,
        ])
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
fn get_working_file_diff(
    repo_path: String,
    file_path: String,
    staged: bool,
) -> Result<String, String> {
    let mut command = std::process::Command::new("git");

    command
        .arg("-C")
        .arg(&repo_path)
        .arg("diff")
        .arg("--no-ext-diff");

    if staged {
        command.arg("--cached");
    }

    let output = command
        .arg("--")
        .arg(&file_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let result = String::from_utf8_lossy(&output.stdout).to_string();
    if result
        .lines()
        .any(|line| line.starts_with("Binary files ") || line.starts_with("GIT binary patch"))
    {
        return Ok("Binary file changed — no line-by-line text differences are available.".into());
    }
    Ok(result)
}

#[tauri::command]
fn get_untracked_file_content(repo_path: String, file_path: String) -> Result<String, String> {
    use std::fs;
    use std::path::Path;

    let root = Path::new(&repo_path)
        .canonicalize()
        .map_err(|error| error.to_string())?;

    let full_path = root
        .join(&file_path)
        .canonicalize()
        .map_err(|error| error.to_string())?;

    if !full_path.starts_with(&root) {
        return Err("File is outside the repository.".to_string());
    }

    let output = Command::new("git")
        .arg("-C")
        .arg(&root)
        .args(["ls-files", "--others", "--exclude-standard", "-z", "--"])
        .arg(&file_path)
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let is_untracked = output
        .stdout
        .split(|&byte| byte == 0)
        .filter(|entry| !entry.is_empty())
        .any(|entry| entry == file_path.as_bytes());

    if !is_untracked {
        return Err("File is not an untracked Git file.".to_string());
    }

    // Avoid trying to display arbitrarily large untracked files in the UI.
    const PREVIEW_LIMIT: u64 = 1024 * 1024;
    if fs::metadata(&full_path)
        .map_err(|error| error.to_string())?
        .len()
        > PREVIEW_LIMIT
    {
        return Ok("File exceeds the 1 MiB text-preview limit.".into());
    }
    let bytes = fs::read(&full_path).map_err(|error| error.to_string())?;
    if bytes.len() as u64 > PREVIEW_LIMIT {
        return Ok("File exceeds the 1 MiB text-preview limit.".into());
    }
    if bytes.contains(&0) || std::str::from_utf8(&bytes).is_err() {
        return Ok("Binary file — no text preview available.".into());
    }
    Ok(String::from_utf8(bytes).expect("validated UTF-8"))
}

#[tauri::command]
fn get_working_changes(repo_path: String) -> Result<Vec<String>, String> {
    let output = std::process::Command::new("git")
        .args(["-C", &repo_path, "status", "--porcelain=v1", "-z"])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let entries = output
        .stdout
        .split(|&byte| byte == 0)
        .filter(|entry| !entry.is_empty())
        .map(|entry| String::from_utf8_lossy(entry).to_string())
        .collect();

    Ok(entries)
}

#[tauri::command]
fn stage_file(repo_path: String, file_path: String) -> Result<(), String> {
    run_git(&repo_path, &["add", "--", &file_path])?;
    Ok(())
}

#[tauri::command]
fn stage_all(repo_path: String) -> Result<(), String> {
    run_git(&repo_path, &["add", "-A"])?;
    Ok(())
}

// In an unborn repository HEAD does not resolve, so `git restore --staged`
// cannot use it as the source. Removing entries from the index instead
// preserves the working-tree files and makes them untracked again.
fn has_head_commit(repo_path: &str) -> bool {
    run_git(repo_path, &["rev-parse", "--verify", "HEAD"]).is_ok()
}

#[tauri::command]
fn unstage_all(repo_path: String) -> Result<(), String> {
    if has_head_commit(&repo_path) {
        run_git(&repo_path, &["restore", "--staged", "--", "."])?;
    } else {
        run_git(&repo_path, &["rm", "-r", "--cached", "--", "."])?;
    }
    Ok(())
}

#[tauri::command]
fn unstage_file(repo_path: String, file_path: String) -> Result<(), String> {
    if has_head_commit(&repo_path) {
        run_git(&repo_path, &["restore", "--staged", "--", &file_path])?;
    } else {
        run_git(&repo_path, &["rm", "--cached", "--", &file_path])?;
    }
    Ok(())
}

#[tauri::command]
fn get_file_diff(
    repo_path: String,
    commit_sha: String,
    file_path: String,
) -> Result<String, String> {
    // Determine whether this commit has a parent.
    let parent_check = Command::new("git")
        .arg("-C")
        .arg(&repo_path)
        .args(["rev-parse", "--verify", "--quiet"])
        .arg(format!("{}^1", commit_sha))
        .output()
        .map_err(|error| error.to_string())?;

    let mut command = Command::new("git");

    command.arg("-C").arg(&repo_path);

    if parent_check.status.success() {
        // Compare the commit against its first parent.
        // This works for ordinary commits and merge commits.
        command
            .arg("diff")
            .arg("--no-ext-diff")
            .arg(format!("{}^1", commit_sha))
            .arg(&commit_sha);
    } else {
        // The initial commit has no parent.
        // Show its changes relative to an empty repository.
        command
            .arg("show")
            .arg("--format=")
            .arg("--no-ext-diff")
            .arg(&commit_sha);
    }

    let output = command
        .arg("--")
        .arg(&file_path)
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let result = String::from_utf8_lossy(&output.stdout).to_string();
    if result
        .lines()
        .any(|line| line.starts_with("Binary files ") || line.starts_with("GIT binary patch"))
    {
        return Ok(
            "Binary file changed in this commit — no line-by-line text differences are available."
                .into(),
        );
    }
    Ok(result)
}

#[tauri::command]
fn create_commit(repo_path: String, message: String) -> Result<String, String> {
    if message.trim().is_empty() {
        return Err("Commit message cannot be empty.".to_string());
    }
    run_git(&repo_path, &["commit", "-m", &message])
}

// Phase 4: local repository operations. No new dependencies or shell commands.
// Git receives each argument separately, so filenames are never shell-expanded.
#[tauri::command]
fn initialize_repository(folder_path: String) -> Result<String, String> {
    use std::path::Path;

    let folder = Path::new(folder_path.trim())
        .canonicalize()
        .map_err(|error| format!("Choose an existing folder: {error}"))?;
    if !folder.is_dir() {
        return Err("Choose an existing folder, not a file.".into());
    }
    if folder.join(".git").exists() {
        return Err("This folder already contains a Git repository.".into());
    }

    let path = folder.to_string_lossy().to_string();
    // Do not create a second repository inside a checked-out repository.
    if run_git(&path, &["rev-parse", "--show-toplevel"]).is_ok() {
        return Err("This folder is already inside a Git repository.".into());
    }
    run_git(&path, &["init", "--", "."])?;
    Ok(path)
}

fn require_no_merge(repo_path: &str) -> Result<(), String> {
    if rebase_in_progress(repo_path)? {
        return Err("Finish or abort the current rebase first.".into());
    }
    let merge_head = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .args(["rev-parse", "-q", "--verify", "MERGE_HEAD"])
        .output()
        .map_err(|error| error.to_string())?;
    if merge_head.status.success() {
        return Err("Finish or abort the current merge first.".into());
    }
    Ok(())
}

#[tauri::command]
fn get_stashes(repo_path: String) -> Result<Vec<String>, String> {
    let output = run_git(&repo_path, &["stash", "list", "--format=%gd | %s"])?;
    Ok(output.lines().map(str::to_string).collect())
}

#[tauri::command]
fn stash_changes(repo_path: String) -> Result<String, String> {
    require_no_merge(&repo_path)?;
    run_git(&repo_path, &["rev-parse", "--verify", "HEAD"])
        .map_err(|_| "Create the first commit before using Stash.".to_string())?;
    if run_git(&repo_path, &["status", "--porcelain"])?.is_empty() {
        return Err("There are no changes to stash.".into());
    }
    // Untracked files are included; ignored files are deliberately excluded.
    let result = run_git(
        &repo_path,
        &[
            "stash",
            "push",
            "--include-untracked",
            "-m",
            "Saved by GitPilot",
        ],
    )?;
    if result.contains("No local changes to save") {
        return Err("No stashable changes found.".into());
    }
    Ok("Changes saved, including untracked files. Ignored files were not included.".into())
}

#[tauri::command]
fn apply_stash(repo_path: String) -> Result<String, String> {
    require_no_merge(&repo_path)?;
    if !run_git(&repo_path, &["status", "--porcelain"])?.is_empty() {
        return Err("Commit or stash existing working changes before applying a stash.".into());
    }
    let stash_refs = run_git(&repo_path, &["stash", "list", "--format=%gd"])?;
    if stash_refs.lines().next().is_none() {
        return Err("There is no saved stash to apply.".into());
    }
    // Restore both staged and unstaged content. Do not pop: retain a backup.
    run_git(&repo_path, &["stash", "apply", "--index", "stash@{0}"])?;
    Ok("Latest stash applied. Its saved backup was kept.".into())
}

#[tauri::command]
fn discard_unstaged_file(repo_path: String, file_path: String) -> Result<String, String> {
    require_no_merge(&repo_path)?;
    if file_path.is_empty() {
        return Err("Choose a tracked file.".into());
    }
    let changes = run_git(&repo_path, &["status", "--porcelain", "--", &file_path])?;
    if changes.is_empty() {
        return Err("No changes found for this file.".into());
    }
    if changes.lines().any(|line| line.starts_with("??")) {
        return Err("Untracked files cannot be discarded from GitPilot.".into());
    }
    if changes.lines().any(|line| {
        let code = line.get(..2).unwrap_or("");
        ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].contains(&code)
    }) {
        return Err("Resolve or abort the conflict first.".into());
    }
    // A staged-only file has no unstaged content to discard.
    let unstaged = run_git(&repo_path, &["diff", "--name-only", "--", &file_path])?;
    if unstaged.is_empty() {
        return Err("There are no unstaged changes to discard.".into());
    }
    // --worktree does not change the staging area or saved commits.
    run_git(&repo_path, &["restore", "--worktree", "--", &file_path])?;
    Ok(format!(
        "Discarded unstaged changes in '{file_path}'. Staged changes were preserved."
    ))
}

#[tauri::command]
fn get_author_settings(repo_path: String) -> Result<Vec<String>, String> {
    // Only local overrides: never modify the user's global Git configuration.
    run_git(&repo_path, &["rev-parse", "--git-dir"])?;
    let name =
        run_git(&repo_path, &["config", "--local", "--get", "user.name"]).unwrap_or_default();
    let email =
        run_git(&repo_path, &["config", "--local", "--get", "user.email"]).unwrap_or_default();
    Ok(vec![name, email])
}

#[tauri::command]
fn save_author_settings(repo_path: String, name: String, email: String) -> Result<String, String> {
    let name = name.trim();
    let email = email.trim();
    if name.contains('\n') || name.contains('\r') || email.contains('\n') || email.contains('\r') {
        return Err("Name and email must not contain line breaks.".into());
    }
    run_git(&repo_path, &["rev-parse", "--git-dir"])?;
    // Blank fields remove only the repository-specific override. Git then
    // falls back to the user's global configuration, if any.
    for (key, value) in [("user.name", name), ("user.email", email)] {
        if value.is_empty() {
            if run_git(&repo_path, &["config", "--local", "--get", key]).is_ok() {
                run_git(&repo_path, &["config", "--local", "--unset-all", key])?;
            }
        } else {
            run_git(
                &repo_path,
                &["config", "--local", "--replace-all", key, value],
            )?;
        }
    }
    Ok("Repository-local author settings updated. Global Git settings were not changed.".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            initialize_repository,
            get_stashes,
            stash_changes,
            apply_stash,
            discard_unstaged_file,
            get_author_settings,
            save_author_settings,
            create_github_repository,
            get_upstream_status,
            set_upstream,
            get_remotes,
            get_remote_branches,
            add_remote,
            update_remote_url,
            remove_remote,
            fetch_remote,
            push_current_branch,
            publish_branch,
            pull_current_branch,
            clone_repository,
            get_current_branch,
            get_local_branches,
            switch_branch,
            create_branch,
            delete_branch,
            merge_branch,
            get_merge_status,
            get_rebase_status,
            continue_rebase,
            abort_rebase,
            abort_merge,
            resolve_conflict_current,
            resolve_conflict_incoming,
            get_commit_history,
            get_commit_message,
            get_commit_files,
            get_file_diff,
            get_working_changes,
            get_working_file_diff,
            get_untracked_file_content,
            get_repository_root,
            stage_file,
            stage_all,
            unstage_all,
            unstage_file,
            create_commit,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
