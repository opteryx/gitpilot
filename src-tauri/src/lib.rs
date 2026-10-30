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
fn get_remotes(repo_path: String) -> Result<String, String> {
    run_git(&repo_path, &["remote", "-v"])
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
            .args(["-c", "credential.helper="])
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

// Check whether the repository is ready for a fast-forward-only pull.
fn check_pull_safety(repo_path: &str) -> Result<(), String> {
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

#[tauri::command]
async fn pull_current_branch(repo_path: String) -> Result<String, String> {
    // Check repository safety and identify the upstream remote.
    let check_path = repo_path.clone();

    let (branch, remote) = tauri::async_runtime::spawn_blocking(move || {
        check_pull_safety(&check_path)?;

        let branch = run_git(&check_path, &["branch", "--show-current"])?;

        if branch.is_empty() {
            return Err("Cannot pull: HEAD is detached.".to_string());
        }

        let upstream = run_git(
            &check_path,
            &[
                "rev-parse",
                "--abbrev-ref",
                "--symbolic-full-name",
                "@{upstream}",
            ],
        )
        .map_err(|_| "Cannot pull: this branch has no upstream configured.".to_string())?;

        let (remote, _) = upstream
            .split_once('/')
            .ok_or_else(|| format!("Cannot identify the remote for upstream '{upstream}'."))?;

        Ok::<(String, String), String>((branch, remote.to_string()))
    })
    .await
    .map_err(|error| error.to_string())??;

    // Use our existing Fetch command, including its authentication
    // safeguards and 45-second timeout.
    fetch_remote(repo_path.clone(), remote).await?;

    // Apply fetched changes locally, only if fast-forward is possible.
    tauri::async_runtime::spawn_blocking(move || {
        check_pull_safety(&repo_path)?;

        run_git(&repo_path, &["merge", "--ff-only", "@{upstream}"])?;

        Ok(format!(
            "Pull completed successfully for branch '{branch}'."
        ))
    })
    .await
    .map_err(|error| error.to_string())?
}

// Fetch runs on a blocking worker, not the Tauri UI thread. Credentials are
// intentionally noninteractive for now; a future login flow can be added.
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
            // Do not invoke VS Code/Git Credential Manager credential helpers.
            .args(["-c", "credential.helper="])
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
            .args(["-c", "credential.helper="])
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

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
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

    let content = fs::read_to_string(&full_path).map_err(|error| error.to_string())?;

    Ok(content)
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

#[tauri::command]
fn unstage_all(repo_path: String) -> Result<(), String> {
    run_git(&repo_path, &["restore", "--staged", "--", "."])?;
    Ok(())
}

#[tauri::command]
fn unstage_file(repo_path: String, file_path: String) -> Result<(), String> {
    run_git(&repo_path, &["restore", "--staged", "--", &file_path])?;
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

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
fn create_commit(repo_path: String, message: String) -> Result<String, String> {
    if message.trim().is_empty() {
        return Err("Commit message cannot be empty.".to_string());
    }
    run_git(&repo_path, &["commit", "-m", &message])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_upstream_status,
            get_remotes,
            fetch_remote,
            push_current_branch,
            pull_current_branch,
            clone_repository,
            get_current_branch,
            get_local_branches,
            switch_branch,
            create_branch,
            delete_branch,
            merge_branch,
            get_merge_status,
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
