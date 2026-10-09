use std::process::Command;

#[tauri::command]
fn get_current_branch(repo_path: String) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(&repo_path)
        .args(["branch", "--show-current"])
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
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
fn get_commit_files(repo_path: String, commit_sha: String) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(&repo_path)
        .args([
            "diff-tree",
            "--root",
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
fn get_file_diff(
    repo_path: String,
    commit_sha: String,
    file_path: String,
) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(&repo_path)
        .args([
            "show",
            "--format=",
            "--no-ext-diff",
            &commit_sha,
            "--",
            &file_path,
        ])
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_current_branch,
            get_commit_history,
            get_commit_files,
            get_file_diff
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
