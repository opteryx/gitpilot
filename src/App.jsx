
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [branch, setBranch] = useState("");
  const [error, setError] = useState("");

  async function loadRepository() {
    setError("");

    try {
      const currentBranch = await invoke("get_current_branch", {
        repoPath: "/home/blacklab/Dev/gitpilot",
      });

      setBranch(currentBranch);
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>GitPilot</h1>
        <span className="app-subtitle">
          A simple Git desktop client
        </span>
      </header>

      <main className="app-main">
        <aside className="sidebar">
          <h2>Repository</h2>

          <button type="button" onClick={loadRepository}>
            Load Test Repository
          </button>

          <h3>Current Branch</h3>

          {branch ? (
            <p>{branch}</p>
          ) : (
            <p className="placeholder">No repository selected</p>
          )}

          {error && <p className="error">{error}</p>}
        </aside>

        <section className="content">
          <h2>Commit History</h2>

          <div className="empty-state">
            <p>Welcome to GitPilot</p>
            <span>
              Repository history will appear here.
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
