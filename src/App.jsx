
import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";

function App() {
  const [branch, setBranch] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [commits, setCommits] = useState([]);
  const [selectedCommit, setSelectedCommit] = useState(null);
  const [commitFiles, setCommitFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileDiff, setFileDiff] = useState("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [repoLoading, setRepoLoading] = useState(false);
  const [error, setError] = useState("");

  // Separate request IDs prevent stale asynchronous results.
  const repoRequestId = useRef(0);
  const commitRequestId = useRef(0);
  const fileRequestId = useRef(0);

  function clearSelection() {
    commitRequestId.current += 1;
    fileRequestId.current += 1;

    setSelectedCommit(null);
    setCommitFiles([]);
    setFilesLoading(false);
    setSelectedFile(null);
    setFileDiff("");
    setDiffLoading(false);
  }

  async function loadRepository() {
    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
        title: "Open Git Repository",
      });

      if (!selectedPath) return;

      const id = ++repoRequestId.current;

      setError("");
      setRepoLoading(true);
      setBranch("");
      setRepoPath("");
      setCommits([]);
      clearSelection();

      const currentBranch = await invoke("get_current_branch", {
        repoPath: selectedPath,
      });

      const history = await invoke("get_commit_history", {
        repoPath: selectedPath,
      });

      if (id !== repoRequestId.current) return;

      const parsedCommits = history
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [sha, date, author, ...messageParts] =
            line.split("|");

          return {
            sha,
            date,
            author,
            message: messageParts.join("|"),
          };
        });

      setBranch(currentBranch);
      setRepoPath(selectedPath);
      setCommits(parsedCommits);
    } catch (err) {
      setError(String(err));
    } finally {
      setRepoLoading(false);
    }
  }

  async function selectCommit(commit) {
    if (!repoPath) return;

    const id = ++commitRequestId.current;
    fileRequestId.current += 1;

    setSelectedCommit(commit);
    setCommitFiles([]);
    setFilesLoading(true);
    setSelectedFile(null);
    setFileDiff("");
    setDiffLoading(false);
    setError("");

    try {
      const result = await invoke("get_commit_files", {
        repoPath,
        commitSha: commit.sha,
      });

      if (id !== commitRequestId.current) return;

      const files = result
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [status, ...pathParts] = line.split("\t");

          return {
            status,
            path: pathParts.join("\t"),
          };
        });

      setCommitFiles(files);
    } catch (err) {
      if (id === commitRequestId.current) {
        setError(String(err));
      }
    } finally {
      if (id === commitRequestId.current) {
        setFilesLoading(false);
      }
    }
  }

  async function selectFile(file) {
    if (!selectedCommit || !repoPath) return;

    const id = ++fileRequestId.current;

    setSelectedFile(file);
    setFileDiff("");
    setDiffLoading(true);
    setError("");

    try {
      const result = await invoke("get_file_diff", {
        repoPath,
        commitSha: selectedCommit.sha,
        filePath: file.path,
      });

      if (id !== fileRequestId.current) return;

      setFileDiff(result);
    } catch (err) {
      if (id === fileRequestId.current) {
        setError(String(err));
      }
    } finally {
      if (id === fileRequestId.current) {
        setDiffLoading(false);
      }
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
        {/* LEFT COLUMN — Repository */}
        <aside className="sidebar">
          <h2>Repository</h2>

          <button
            type="button"
            onClick={loadRepository}
            disabled={repoLoading}
          >
            {repoLoading ? "Loading..." : "Open Repository"}
          </button>

          {repoPath && (
            <p className="repo-path" title={repoPath}>
              {repoPath}
            </p>
          )}

          <h3>Current Branch</h3>

          {branch ? (
            <p className="branch-name">{branch}</p>
          ) : (
            <p className="placeholder">
              No repository selected
            </p>
          )}

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </aside>

        {/* CENTER COLUMN — Commit History */}
        <section className="content">
          <h2>Commit History</h2>

          {commits.length === 0 ? (
            <div className="empty-state">
              <p>
                {repoLoading
                  ? "Loading repository..."
                  : "No commits to display"}
              </p>
              <span>
                Open a repository to view its history.
              </span>
            </div>
          ) : (
            <div className="commit-list">
              {commits.map((commit) => (
                <button
                  type="button"
                  className={`commit-row ${
                    selectedCommit?.sha === commit.sha
                      ? "selected"
                      : ""
                  }`}
                  key={commit.sha}
                  onClick={() => selectCommit(commit)}
                  aria-pressed={
                    selectedCommit?.sha === commit.sha
                  }
                >
                  <span className="commit-sha">
                    {commit.sha}
                  </span>

                  <span className="commit-details">
                    <span className="commit-message">
                      {commit.message}
                    </span>
                    <span className="commit-meta">
                      {commit.author} · {commit.date}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* RIGHT COLUMN — Commit Details */}
        <aside className="details-panel">
          <h2>Commit Details</h2>

          {!selectedCommit ? (
            <div className="details-empty">
              <p>No commit selected</p>
              <span>
                Select a commit to view its changed files.
              </span>
            </div>
          ) : (
            <>
              <div className="selected-commit-info">
                <div className="selected-commit-message">
                  {selectedCommit.message}
                </div>

                <div className="commit-meta">
                  {selectedCommit.sha} · {selectedCommit.author}
                  {" · "}
                  {selectedCommit.date}
                </div>
              </div>

              <div className="commit-files-panel">
                <h3>Changed Files</h3>

                {filesLoading ? (
                  <p>Loading files...</p>
                ) : commitFiles.length === 0 ? (
                  <p>No changed files found.</p>
                ) : (
                  <div className="commit-files-list">
                    {commitFiles.map((file) => (
                      <button
                        type="button"
                        className={`commit-file ${
                          selectedFile?.path === file.path
                            ? "selected"
                            : ""
                        }`}
                        key={file.path}
                        onClick={() => selectFile(file)}
                        aria-pressed={
                          selectedFile?.path === file.path
                        }
                      >
                        <span
                          className={`file-status status-${file.status}`}
                        >
                          {file.status}
                        </span>
                        <span className="file-path">
                          {file.path}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="file-diff-panel">
                <h3>
                  {selectedFile
                    ? `Changes in ${selectedFile.path}`
                    : "File Differences"}
                </h3>

                {!selectedFile ? (
                  <p className="placeholder">
                    Select a changed file to view its diff.
                  </p>
                ) : diffLoading ? (
                  <p>Loading differences...</p>
                ) : (
                  <pre className="file-diff">
                    {fileDiff ||
                      "No textual differences available."}
                  </pre>
                )}
              </div>
            </>
          )}
        </aside>
      </main>
    </div>
  );
}

export default App;
