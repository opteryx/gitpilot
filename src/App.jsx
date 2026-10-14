import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask, open } from "@tauri-apps/plugin-dialog";
import "./App.css";

function App() {
	const [branch, setBranch] = useState("");
	const [branches, setBranches] = useState([]);
	const [newBranchName, setNewBranchName] = useState("");
	const [branchCreating, setBranchCreating] = useState(false);
	const [branchBusy, setBranchBusy] = useState(false);
	const [switchAfterCreate, setSwitchAfterCreate] = useState(true);
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
	const [workingChanges, setWorkingChanges] = useState([]);
	const [changesLoading, setChangesLoading] = useState(false);
	const [selectedWorkingFile, setSelectedWorkingFile] = useState(null);
	const [workingDiffMode, setWorkingDiffMode] = useState("unstaged");
	const [commitMessage, setCommitMessage] = useState("");
	const [commitLoading, setCommitLoading] = useState(false);

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
		setSelectedWorkingFile(null);
	}

	async function deleteBranch(branchName) {
		if (!repoPath || branchName === branch || repoLoading || branchBusy)
			return;

		const confirmed = await ask(
			`Delete branch "${branchName}"?\n\n` +
				"Git will refuse deletion if the branch has unmerged commits.",
			{
				title: "Delete Branch",
				kind: "warning",
				okLabel: "Delete",
				cancelLabel: "Cancel",
			},
		);

		if (!confirmed) return;

		try {
			setBranchBusy(true);
			setError("");

			await invoke("delete_branch", {
				repoPath,
				branchName,
			});

			const localBranches = await invoke("get_local_branches", {
				repoPath,
			});

			setBranches(localBranches);
		} catch (err) {
			setError(String(err));
		} finally {
			setBranchBusy(false);
		}
	}

	async function createBranch() {
		const name = newBranchName.trim();

		if (!repoPath || !name || branchCreating || repoLoading || branchBusy)
			return;

		try {
			setBranchBusy(true);
			setBranchCreating(true);
			setError("");

			await invoke("create_branch", {
				repoPath,
				branchName: name,
			});

			const localBranches = await invoke("get_local_branches", {
				repoPath,
			});

			setBranches(localBranches);
			setNewBranchName("");

			if (switchAfterCreate) {
				await switchBranch(name, true);
			}
		} catch (err) {
			setError(String(err));
		} finally {
			setBranchCreating(false);
			setBranchBusy(false);
		}
	}

	async function switchBranch(branchName, fromCreate = false) {
		if (!repoPath || branchName === branch || (branchBusy && !fromCreate))
			return;

		try {
			setBranchBusy(true);
			setError("");
			setRepoLoading(true);

			await invoke("switch_branch", {
				repoPath,
				branchName,
			});

			const currentBranch = await invoke("get_current_branch", {
				repoPath,
			});

			const history = await invoke("get_commit_history", {
				repoPath,
			});

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
			setCommits(parsedCommits);
			clearSelection();
			await refreshWorkingChanges();
		} catch (err) {
			setError(String(err));
		} finally {
			setRepoLoading(false);
			setBranchBusy(false);
		}
	}

	async function loadRepository() {
		try {
			const selectedPath = await open({
				directory: true,
				multiple: false,
				title: "Open Git Repository",
				defaultPath: repoPath || undefined,
			});

			if (!selectedPath) return;

			const id = ++repoRequestId.current;

			const rootPath = await invoke("get_repository_root", {
				repoPath: selectedPath,
			});

			if (id !== repoRequestId.current) return;

			setError("");
			setRepoLoading(true);
			setBranch("");
			setBranches([]);
			setRepoPath("");
			setCommits([]);
			clearSelection();

			const currentBranch = await invoke("get_current_branch", {
				repoPath: rootPath,
			});

			const localBranches = await invoke("get_local_branches", {
				repoPath: rootPath,
			});

			const history = await invoke("get_commit_history", {
				repoPath: rootPath,
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
			setBranches(localBranches);
			setRepoPath(rootPath);
			setNewBranchName("");
			setSwitchAfterCreate(true);
			setCommits(parsedCommits);
			setWorkingChanges([]);
			refreshWorkingChanges(rootPath);
		} catch (err) {
			setError(String(err));
		} finally {
			setRepoLoading(false);
		}
	}

	async function refreshWorkingChanges(path = repoPath) {
		if (!path) return;

		setChangesLoading(true);

		try {
			const entries = await invoke("get_working_changes", {
				repoPath: path,
			});

			const changes = [];

			for (let i = 0; i < entries.length; i++) {
				const entry = entries[i];

				const indexStatus = entry[0];
				const worktreeStatus = entry[1];
				const filePath = entry.slice(3);

				changes.push({
					path: filePath,
					indexStatus,
					worktreeStatus,
				});

				// Rename/copy records include an additional pathname.
				if (
					indexStatus === "R" ||
					indexStatus === "C" ||
					worktreeStatus === "R" ||
					worktreeStatus === "C"
				) {
					i++;
				}
			}

			setWorkingChanges(changes);
			return changes;
		} catch (err) {
			setError(String(err));
		} finally {
			setChangesLoading(false);
		}
	}

	async function stageWorkingFile(file) {
		try {
			await invoke("stage_file", {
				repoPath,
				filePath: file.path,
			});

			const changes = await refreshWorkingChanges();

			if (selectedWorkingFile?.path === file.path) {
				const updatedFile = changes?.find(
					(change) => change.path === file.path,
				);

				if (updatedFile) {
					setSelectedWorkingFile(updatedFile);
					await refreshWorkingFileDiff(updatedFile, workingDiffMode);
				}
			}
		} catch (err) {
			setError(String(err));
		}
	}

	async function unstageWorkingFile(file) {
		try {
			await invoke("unstage_file", {
				repoPath,
				filePath: file.path,
			});

			const changes = await refreshWorkingChanges();

			if (selectedWorkingFile?.path === file.path) {
				const updatedFile = changes?.find(
					(change) => change.path === file.path,
				);

				if (updatedFile) {
					setSelectedWorkingFile(updatedFile);
					await refreshWorkingFileDiff(updatedFile, workingDiffMode);
				}
			}
		} catch (err) {
			setError(String(err));
		}
	}

	async function stageAllFiles() {
		if (!repoPath) return;

		try {
			setError("");

			await invoke("stage_all", {
				repoPath,
			});

			await refreshWorkingChanges();

			if (selectedWorkingFile) {
				await refreshWorkingFileDiff(
					selectedWorkingFile,
					workingDiffMode,
				);
			}
		} catch (err) {
			setError(String(err));
		}
	}

	async function unstageAllFiles() {
		if (!repoPath) return;

		try {
			setError("");

			await invoke("unstage_all", {
				repoPath,
			});

			await refreshWorkingChanges();

			if (selectedWorkingFile) {
				await refreshWorkingFileDiff(
					selectedWorkingFile,
					workingDiffMode,
				);
			}
		} catch (err) {
			setError(String(err));
		}
	}

	async function createCommit() {
		if (!repoPath || !commitMessage.trim() || commitLoading) return;

		try {
			setCommitLoading(true);
			setError("");

			await invoke("create_commit", {
				repoPath,
				message: commitMessage.trim(),
			});

			setCommitMessage("");

			const history = await invoke("get_commit_history", {
				repoPath,
			});

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

			setCommits(parsedCommits);
			clearSelection();
			await refreshWorkingChanges();
		} catch (err) {
			setError(String(err));
		} finally {
			setCommitLoading(false);
		}
	}

	async function selectWorkingFile(file) {
		if (!repoPath) return;

		const id = ++fileRequestId.current;

		// Switch from commit details to working-file details.
		commitRequestId.current += 1;
		setSelectedCommit(null);
		setCommitFiles([]);
		setFilesLoading(false);
		setSelectedFile(null);
		setSelectedWorkingFile(file);
		setWorkingDiffMode("unstaged");
		setFileDiff("");
		setDiffLoading(true);
		setError("");

		try {
			const result =
				file.indexStatus === "?" && file.worktreeStatus === "?"
					? await invoke("get_untracked_file_content", {
							repoPath,
							filePath: file.path,
						})
					: await invoke("get_working_file_diff", {
							repoPath,
							filePath: file.path,
							staged: false,
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

	async function refreshWorkingFileDiff(file, mode) {
		if (!repoPath || !file) return;

		const id = ++fileRequestId.current;

		setFileDiff("");
		setDiffLoading(true);
		setError("");

		try {
			const result =
				file.indexStatus === "?" &&
				file.worktreeStatus === "?" &&
				mode === "unstaged"
					? await invoke("get_untracked_file_content", {
							repoPath,
							filePath: file.path,
						})
					: await invoke("get_working_file_diff", {
							repoPath,
							filePath: file.path,
							staged: mode === "staged",
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

	async function changeWorkingDiffMode(mode) {
		if (!selectedWorkingFile || !repoPath) return;

		setWorkingDiffMode(mode);

		await refreshWorkingFileDiff(selectedWorkingFile, mode);
	}

	async function selectCommit(commit) {
		if (!repoPath) return;

		const id = ++commitRequestId.current;
		fileRequestId.current += 1;

		setSelectedWorkingFile(null);
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
						<p className="placeholder">No repository selected</p>
					)}

					{branches.length > 0 && (
						<div className="branch-list">
							<h3>Local Branches</h3>

							{branches.map((branchName) => (
								<div className="branch-row" key={branchName}>
									<button
										type="button"
										className={`branch-item ${
											branchName === branch
												? "active"
												: ""
										}`}
										onClick={() => switchBranch(branchName)}
										disabled={
											repoLoading ||
											branchBusy ||
											branchName === branch
										}
										aria-current={
											branchName === branch
												? "true"
												: undefined
										}
									>
										{branchName === branch ? "● " : ""}
										{branchName}
									</button>

									{branchName !== branch && (
										<button
											type="button"
											className="delete-branch-button"
											onClick={() =>
												deleteBranch(branchName)
											}
											disabled={repoLoading || branchBusy}
											title={`Delete branch ${branchName}`}
										>
											Delete
										</button>
									)}
								</div>
							))}

							<div className="create-branch">
								<input
									type="text"
									placeholder="New branch name"
									value={newBranchName}
									onChange={(event) =>
										setNewBranchName(event.target.value)
									}
									disabled={
										branchCreating ||
										repoLoading ||
										branchBusy
									}
									aria-label="New branch name"
								/>

								<label className="switch-after-create">
									<input
										type="checkbox"
										checked={switchAfterCreate}
										onChange={(event) =>
											setSwitchAfterCreate(
												event.target.checked,
											)
										}
										disabled={branchCreating || repoLoading}
									/>
									Switch to new branch
								</label>

								<button
									type="button"
									onClick={createBranch}
									disabled={
										!newBranchName.trim() ||
										branchCreating ||
										repoLoading ||
										branchBusy
									}
								>
									{branchCreating
										? "Creating..."
										: "Create Branch"}
								</button>
							</div>
						</div>
					)}

					{error && (
						<div className="error-message" role="alert">
							<strong>Git Error</strong>
							<p>{error}</p>
							<button
								type="button"
								onClick={() => setError("")}
								className="dismiss-error"
							>
								Dismiss
							</button>
						</div>
					)}
				</aside>

				{/* CENTER COLUMN — Working Changes and Commit History */}
				<section className="content">
					<div className="working-changes-panel">
						<div className="panel-heading">
							<h2>Working Changes ({workingChanges.length})</h2>

							<div className="working-changes-actions">
								<button
									type="button"
									onClick={() => refreshWorkingChanges()}
									disabled={!repoPath || changesLoading}
								>
									{changesLoading ? "Loading..." : "Refresh"}
								</button>

								<button
									type="button"
									onClick={stageAllFiles}
									disabled={
										!repoPath ||
										changesLoading ||
										!workingChanges.some(
											(file) =>
												file.worktreeStatus !== " " ||
												file.indexStatus === "?",
										)
									}
								>
									Stage All
								</button>

								<button
									type="button"
									onClick={unstageAllFiles}
									disabled={
										!repoPath ||
										changesLoading ||
										!workingChanges.some(
											(file) =>
												file.indexStatus !== " " &&
												file.indexStatus !== "?",
										)
									}
								>
									Unstage All
								</button>
							</div>
						</div>

						{workingChanges.length === 0 ? (
							<p className="placeholder">
								{changesLoading
									? "Checking for changes..."
									: "No uncommitted changes"}
							</p>
						) : (
							<div className="working-changes-list">
								{workingChanges.map((file) => (
									<div
										className="working-change-row"
										key={file.path}
									>
										<button
											type="button"
											className={`working-change ${
												selectedWorkingFile?.path ===
												file.path
													? "selected"
													: ""
											}`}
											onClick={() =>
												selectWorkingFile(file)
											}
											aria-pressed={
												selectedWorkingFile?.path ===
												file.path
											}
										>
											<span className="working-change-status">
												{file.indexStatus === "?" &&
												file.worktreeStatus === "?"
													? "Untracked"
													: file.indexStatus !== " "
														? file.worktreeStatus !==
															" "
															? "Staged + Unstaged"
															: "Staged"
														: file.worktreeStatus ===
															  "D"
															? "Deleted"
															: file.worktreeStatus ===
																  "A"
																? "Added"
																: file.worktreeStatus ===
																	  "R"
																	? "Renamed"
																	: "Modified"}
											</span>

											<span
												className="working-change-path"
												title={file.path}
											>
												{file.path}
											</span>
										</button>

										<>
											{(file.worktreeStatus !== " " ||
												file.indexStatus === "?") && (
												<button
													type="button"
													className="stage-file-button"
													onClick={() =>
														stageWorkingFile(file)
													}
													title={`Stage ${file.path}`}
												>
													Stage
												</button>
											)}

											{file.indexStatus !== " " &&
												file.indexStatus !== "?" && (
													<button
														type="button"
														className="stage-file-button"
														onClick={() =>
															unstageWorkingFile(
																file,
															)
														}
														title={`Unstage ${file.path}`}
													>
														Unstage
													</button>
												)}
										</>
									</div>
								))}
							</div>
						)}
					</div>
				</section>

				<div className="commit-panel-container">
					<section className="commit-panel">
						<h2>Create Commit</h2>

						<textarea
							className="commit-message-input"
							placeholder="Enter commit message..."
							value={commitMessage}
							onChange={(event) =>
								setCommitMessage(event.target.value)
							}
							rows={3}
						/>

						<button
							type="button"
							onClick={createCommit}
							disabled={
								!repoPath ||
								!commitMessage.trim() ||
								commitLoading ||
								!workingChanges.some(
									(file) =>
										file.indexStatus !== " " &&
										file.indexStatus !== "?",
								)
							}
						>
							{commitLoading ? "Committing..." : "Commit"}
						</button>
					</section>
				</div>

				{/* COMMIT HISTORY — Independent layout section */}
				<section className="history-panel">
					<h2>Commit History</h2>

					{commits.length === 0 ? (
						<div className="empty-state">
							<p>
								{repoLoading
									? "Loading repository..."
									: "No commits to display"}
							</p>
							<span>Open a repository to view its history.</span>
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

				{/* RIGHT COLUMN — Details */}
				<aside className="details-panel">
					<h2>
						{selectedWorkingFile
							? "Working File Details"
							: "Commit Details"}
					</h2>

					{selectedWorkingFile ? (
						<>
							<div className="selected-commit-info">
								<div className="selected-commit-message">
									{selectedWorkingFile.path}
								</div>
								<div className="commit-meta">
									Uncommitted changes
								</div>
							</div>

							<div className="file-diff-panel">
								<h3>Working File Differences</h3>

								<div className="diff-mode-buttons">
									<button
										type="button"
										className={
											workingDiffMode === "unstaged"
												? "active"
												: ""
										}
										onClick={() =>
											changeWorkingDiffMode("unstaged")
										}
										disabled={diffLoading}
										aria-pressed={
											workingDiffMode === "unstaged"
										}
									>
										Unstaged
									</button>

									<button
										type="button"
										className={
											workingDiffMode === "staged"
												? "active"
												: ""
										}
										onClick={() =>
											changeWorkingDiffMode("staged")
										}
										disabled={diffLoading}
										aria-pressed={
											workingDiffMode === "staged"
										}
									>
										Staged
									</button>
								</div>

								{diffLoading ? (
									<p>Loading differences...</p>
								) : (
									<pre className="file-diff">
										{fileDiff ||
											(workingDiffMode === "staged"
												? "No staged differences for this file."
												: "No unstaged differences for this file.")}
									</pre>
								)}
							</div>
						</>
					) : !selectedCommit ? (
						<div className="details-empty">
							<p>No file or commit selected</p>
							<span>
								Select a working file or commit to view details.
							</span>
						</div>
					) : (
						<>
							<div className="selected-commit-info">
								<div className="selected-commit-message">
									{selectedCommit.message}
								</div>

								<div className="commit-meta">
									{selectedCommit.sha} ·{" "}
									{selectedCommit.author}
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
													selectedFile?.path ===
													file.path
														? "selected"
														: ""
												}`}
												key={file.path}
												onClick={() => selectFile(file)}
												aria-pressed={
													selectedFile?.path ===
													file.path
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
