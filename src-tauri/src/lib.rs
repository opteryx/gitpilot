
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
        return Err(String::from_utf8_lossy(&output.stderr)
            .trim()
            .to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout)
        .trim()
        .to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_current_branch])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
