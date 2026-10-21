import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask, open } from "@tauri-apps/plugin-dialog";
import "./App.css";

function DiffViewer({ content, isDiff = true }) {
	if (!isDiff) return <pre className="file-diff">{content}</pre>;

	const lines = content.split("\n");
	return (
		<pre className="file-diff">
			{lines.map((line, index) => {
				let className = "diff-line";
				if (line.startsWith("@@")) className += " diff-hunk";
				else if (line.startsWith("+") && !line.startsWith("+++"))
					className += " diff-added";
				else if (line.startsWith("-") && !line.startsWith("---"))
					className += " diff-removed";
				else if (
					line.startsWith("diff --git ") ||
					line.startsWith("index ") ||
					line.startsWith("--- ") ||
					line.startsWith("+++ ")
				)
					className += " diff-header";
				return (
					<span key={index} className={className}>
						{line}
						{index < lines.length - 1 ? "\n" : ""}
					</span>
				);
			})}
		</pre>
	);
}

function parseCommitHistory(history) {
	return history
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [sha, date, author, ...messageParts] = line.split("|");
			return { sha, date, author, message: messageParts.join("|") };
		});
}

async function fetchCommitHistory(repoPath) {
	const history = await invoke("get_commit_history", { repoPath });
	return parseCommitHistory(history);
}

function App() {
	const [branch, setBranch] = useState("");
	const [branches, setBranches] = useState([]);
	const [newBranchName, setNewBranchName] = useState("");
	const [branchCreating, setBranchCreating] = useState(false);
	const [branchBusy, setBranchBusy] = useState(false);
	const [mergeInProgress, setMergeInProgress] = useState(false);
	const [switchAfterCreate, setSwitchAfterCreate] = useState(true);
	const [repoPath, setRepoPath] = useState("");
	const [commits, setCommits] = useState([]);
	const [selectedCommit, setSelectedCommit] = useState(null);
	const [selectedCommitMessage, setSelectedCommitMessage] = useState("");
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
	const workingChangesRequestId = useRef(0);

	function isConflicted(file) {
		return ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(
			file.indexStatus + file.worktreeStatus,
		);
	}

	function clearSelection() {
		commitRequestId.current += 1;
		fileRequestId.current += 1;

		setSelectedCommit(null);
		setSelectedCommitMessage("");
		setCommitFiles([]);
		setFilesLoading(false);
		setSelectedFile(null);
		setFileDiff("");
		setDiffLoading(false);
		setSelectedWorkingFile(null);
	}

	async function refreshMergeStatus(path = repoPath) {
		if (!path) return;

		try {
			const inProgress = await invoke("get_merge_status", {
				repoPath: path,
			});

			setMergeInProgress(inProgress);
			return inProgress;
		} catch (err) {
			setError(String(err));
		}
	}

	async function mergeBranch(branchName) {
		if (
			!repoPath ||
			branchName === branch ||
			repoLoading ||
			branchBusy ||
			mergeInProgress
		)
			return;

		const confirmed = await ask(
			`Merge "${branchName}" into "${branch}"?\n\n` +
				`Current branch: ${branch}\n` +
				`Branch to merge: ${branchName}\n\n` +
				"Git will combine the changes from the selected branch into the current branch.",
			{
				title: "Merge Branch",
				kind: "warning",
				okLabel: "Merge",
				cancelLabel: "Cancel",
			},
		);

		if (!confirmed) return;

		try {
			setBranchBusy(true);
			setRepoLoading(true);
			setError("");

			const result = await invoke("merge_branch", {
				repoPath,
				branchName,
			});

			const parsedCommits = await fetchCommitHistory(repoPath);

			setCommits(parsedCommits);
			clearSelection();
			await refreshWorkingChanges();

			console.log("Merge result:", result);
		} catch (err) {
			setError(String(err));
			await refreshWorkingChanges();
		} finally {
			await refreshMergeStatus();
			setRepoLoading(false);
			setBranchBusy(false);
		}
	}

	async function abortMerge() {
		if (!repoPath || !mergeInProgress || branchBusy) return;

		const confirmed = await ask(
			"Abort the current merge?\n\n" +
				"Git will attempt to restore the repository to its pre-merge state.",
			{
				title: "Abort Merge",
				kind: "warning",
				okLabel: "Abort Merge",
				cancelLabel: "Cancel",
			},
		);

		if (!confirmed) return;

		try {
			setBranchBusy(true);
			setError("");

			await invoke("abort_merge", { repoPath });

			await refreshWorkingChanges();
			await refreshMergeStatus();
			clearSelection();
		} catch (err) {
			setError(String(err));
			await refreshMergeStatus();
		} finally {
			setBranchBusy(false);
		}
	}

	async function deleteBranch(branchName) {
		if (
			!repoPath ||
			branchName === branch ||
			repoLoading ||
			branchBusy ||
			mergeInProgress
		)
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

		if (
			!repoPath ||
			!name ||
			branchCreating ||
			repoLoading ||
			branchBusy ||
			mergeInProgress
		)
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
		if (
			!repoPath ||
			branchName === branch ||
			mergeInProgress ||
			(branchBusy && !fromCreate)
		)
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

			const parsedCommits = await fetchCommitHistory(repoPath);

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

			const parsedCommits = parseCommitHistory(history);

			setBranch(currentBranch);
			setBranches(localBranches);
			setRepoPath(rootPath);
			setNewBranchName("");
			setSwitchAfterCreate(true);
			setCommits(parsedCommits);
			workingChangesRequestId.current += 1;
			setWorkingChanges([]);
			setMergeInProgress(false);
			await Promise.all([
				refreshWorkingChanges(rootPath),
				refreshMergeStatus(rootPath),
			]);
		} catch (err) {
			setError(String(err));
		} finally {
			setRepoLoading(false);
		}
	}

	async function refreshWorkingChanges(path = repoPath) {
		if (!path) return;

		const id = ++workingChangesRequestId.current;
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

			if (id !== workingChangesRequestId.current) return;
			setWorkingChanges(changes);
			return changes;
		} catch (err) {
			if (id === workingChangesRequestId.current) setError(String(err));
		} finally {
			if (id === workingChangesRequestId.current)
				setChangesLoading(false);
		}
	}

	async function stageWorkingFile(file) {
		if (isConflicted(file)) {
			setError("Resolve the merge conflict before staging this file.");
			return;
		}
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
		if (isConflicted(file)) {
			setError("Resolve or abort the merge before unstaging this file.");
			return;
		}
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

		if (workingChanges.some(isConflicted)) {
			setError("Resolve all merge conflicts before using Stage All.");
			return;
		}

		try {
			setError("");

			await invoke("stage_all", {
				repoPath,
			});

			const changes = await refreshWorkingChanges();

			if (selectedWorkingFile && changes) {
				const updatedFile = changes.find(
					(file) => file.path === selectedWorkingFile.path,
				);

				if (updatedFile) {
					setSelectedWorkingFile(updatedFile);
					await refreshWorkingFileDiff(updatedFile, workingDiffMode);
				} else {
					setSelectedWorkingFile(null);
					setFileDiff("");
				}
			}
		} catch (err) {
			setError(String(err));
		}
	}

	async function resolveConflictCurrent(file) {
		if (!repoPath || !file || !isConflicted(file)) return;

		const confirmed = await ask(
			`Keep the current branch version of "${file.path}"?\n\n` +
				"This will discard the incoming version for this conflicted file and mark the conflict as resolved.",
			{
				title: "Keep Current Version",
				kind: "warning",
				okLabel: "Keep Current",
				cancelLabel: "Cancel",
			},
		);

		if (!confirmed) return;

		try {
			setError("");

			await invoke("resolve_conflict_current", {
				repoPath,
				filePath: file.path,
			});

			const changes = await refreshWorkingChanges();

			const updatedFile = changes?.find(
				(change) => change.path === file.path,
			);

			if (updatedFile) {
				setSelectedWorkingFile(updatedFile);
				await refreshWorkingFileDiff(updatedFile, "staged");
				setWorkingDiffMode("staged");
			} else {
				setSelectedWorkingFile(null);
				setFileDiff("");
			}

			await refreshMergeStatus();
		} catch (err) {
			setError(String(err));
		}
	}

	async function resolveConflictIncoming(file) {
		if (!repoPath || !file || !isConflicted(file)) return;

		const confirmed = await ask(
			`Keep the incoming branch version of "${file.path}"?\n\n` +
				"This will discard the current branch version for this conflicted file and mark the conflict as resolved.",
			{
				title: "Keep Incoming Version",
				kind: "warning",
				okLabel: "Keep Incoming",
				cancelLabel: "Cancel",
			},
		);

		if (!confirmed) return;

		try {
			setError("");

			await invoke("resolve_conflict_incoming", {
				repoPath,
				filePath: file.path,
			});

			const changes = await refreshWorkingChanges();

			const updatedFile = changes?.find(
				(change) => change.path === file.path,
			);

			if (updatedFile) {
				setSelectedWorkingFile(updatedFile);
				await refreshWorkingFileDiff(updatedFile, "staged");
				setWorkingDiffMode("staged");
			} else {
				setSelectedWorkingFile(null);
				setFileDiff("");
			}

			await refreshMergeStatus();
		} catch (err) {
			setError(String(err));
		}
	}

	async function unstageAllFiles() {
		if (!repoPath) return;

		if (workingChanges.some(isConflicted)) {
			setError(
				"Resolve or abort merge conflicts before using Unstage All.",
			);
			return;
		}

		try {
			setError("");

			await invoke("unstage_all", {
				repoPath,
			});

			const changes = await refreshWorkingChanges();

			if (selectedWorkingFile && changes) {
				const updatedFile = changes.find(
					(file) => file.path === selectedWorkingFile.path,
				);

				if (updatedFile) {
					setSelectedWorkingFile(updatedFile);
					await refreshWorkingFileDiff(updatedFile, workingDiffMode);
				} else {
					setSelectedWorkingFile(null);
					setFileDiff("");
				}
			}
		} catch (err) {
			setError(String(err));
		}
	}

	async function createCommit() {
		if (!repoPath || !commitMessage.trim() || commitLoading) return;

		if (workingChanges.some(isConflicted)) {
			setError("Resolve all merge conflicts before creating a commit.");
			return;
		}

		try {
			setCommitLoading(true);
			setError("");

			await invoke("create_commit", {
				repoPath,
				message: commitMessage.trim(),
			});

			setCommitMessage("");

			const parsedCommits = await fetchCommitHistory(repoPath);

			setCommits(parsedCommits);
			clearSelection();
			await refreshWorkingChanges();
			await refreshMergeStatus();
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
		setSelectedCommitMessage("");
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
		setSelectedCommitMessage(commit.message);
		setCommitFiles([]);
		setFilesLoading(true);
		setSelectedFile(null);
		setFileDiff("");
		setDiffLoading(false);
		setError("");

		try {
			const [result, fullMessage] = await Promise.all([
				invoke("get_commit_files", { repoPath, commitSha: commit.sha }),
				invoke("get_commit_message", {
					repoPath,
					commitSha: commit.sha,
				}),
			]);

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
			setSelectedCommitMessage(fullMessage.trimEnd());
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
				<div className="left-column">
					{/* LEFT COLUMN — Repository */}
					<aside className="sidebar">
						<h2>Repository</h2>

						<button
							type="button"
							onClick={loadRepository}
							className="button-primary"
							disabled={repoLoading}
						>
							{repoLoading ? "Loading..." : "Open Repository"}
						</button>

						{repoPath && (
							<p className="repo-path" title={repoPath}>
								{repoPath}
							</p>
						)}

						{mergeInProgress && (
							<div className="merge-warning">
								<strong>Merge in Progress</strong>
								<p>
									Git has not completed the current merge.
									Resolve the conflicts or abort the merge.
								</p>
								<button
									type="button"
									onClick={abortMerge}
									className="button-danger"
									disabled={branchBusy}
								>
									Abort Merge
								</button>
							</div>
						)}

						<h3>Current Branch</h3>

						{branch ? (
							<p className="branch-name">{branch}</p>
						) : (
							<p className="placeholder">
								No repository selected
							</p>
						)}

						{branches.length > 0 && (
							<div className="branch-list">
								<h3>Local Branches</h3>

								{branches.map((branchName) => (
									<div
										className="branch-row"
										key={branchName}
									>
										<button
											type="button"
											className={`branch-item ${
												branchName === branch
													? "active"
													: ""
											}`}
											onClick={() =>
												switchBranch(branchName)
											}
											disabled={
												repoLoading ||
												branchBusy ||
												mergeInProgress ||
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
											<>
												<button
													type="button"
													className="merge-branch-button"
													onClick={() =>
														mergeBranch(branchName)
													}
													disabled={
														repoLoading ||
														branchBusy ||
														mergeInProgress
													}
													title={`Merge ${branchName} into ${branch}`}
												>
													Merge
												</button>

												<button
													type="button"
													className="delete-branch-button"
													onClick={() =>
														deleteBranch(branchName)
													}
													disabled={
														repoLoading ||
														branchBusy ||
														mergeInProgress
													}
													title={`Delete branch ${branchName}`}
												>
													Delete
												</button>
											</>
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
											branchBusy ||
											mergeInProgress
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
											disabled={
												branchCreating ||
												repoLoading ||
												mergeInProgress
											}
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
											branchBusy ||
											mergeInProgress
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
				</div>
				<div className="right-column">
					{/* CENTER COLUMN — Working Changes and Commit History */}
					<section className="content">
						<div className="working-changes-panel">
							<div className="panel-heading">
								<h2>
									Working Changes ({workingChanges.length})
								</h2>

								<div className="working-changes-actions">
									<button
										type="button"
										onClick={() => refreshWorkingChanges()}
										disabled={!repoPath || changesLoading}
									>
										{changesLoading
											? "Loading..."
											: "Refresh"}
									</button>

									<button
										type="button"
										onClick={stageAllFiles}
										disabled={
											!repoPath ||
											changesLoading ||
											workingChanges.some(isConflicted) ||
											!workingChanges.some(
												(file) =>
													file.worktreeStatus !==
														" " ||
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
											workingChanges.some(isConflicted) ||
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
											className={`working-change-row ${
												isConflicted(file)
													? "conflicted"
													: ""
											}`}
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
													{isConflicted(file)
														? "Conflicted"
														: file.indexStatus ===
																	"?" &&
															  file.worktreeStatus ===
																	"?"
															? "Untracked"
															: file.indexStatus !==
																  " "
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
													file.indexStatus ===
														"?") && (
													<button
														type="button"
														className="stage-file-button"
														disabled={isConflicted(
															file,
														)}
														onClick={() =>
															stageWorkingFile(
																file,
															)
														}
														title={`Stage ${file.path}`}
													>
														Stage
													</button>
												)}

												{file.indexStatus !== " " &&
													file.indexStatus !==
														"?" && (
														<button
															type="button"
															className="stage-file-button"
															disabled={isConflicted(
																file,
															)}
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
								placeholder={
									"Commit summary\n\nOptional description (separate with a blank line)..."
								}
								value={commitMessage}
								onChange={(event) =>
									setCommitMessage(event.target.value)
								}
								rows={3}
							/>

							<button
								type="button"
								onClick={createCommit}
								className="button-primary"
								disabled={
									!repoPath ||
									!commitMessage.trim() ||
									commitLoading ||
									workingChanges.some(isConflicted) ||
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

								{isConflicted(selectedWorkingFile) && (
									<div className="conflict-resolution">
										<h3>Resolve Merge Conflict</h3>

										<p>
											Choose which version of this file to
											keep. The selected version will
											replace the entire file and be
											staged automatically.
										</p>

										<div className="conflict-resolution-actions">
											<button
												type="button"
												className="button-secondary"
												onClick={() =>
													resolveConflictCurrent(
														selectedWorkingFile,
													)
												}
											>
												Keep Current
											</button>

											<button
												type="button"
												className="button-secondary"
												onClick={() =>
													resolveConflictIncoming(
														selectedWorkingFile,
													)
												}
											>
												Keep Incoming
											</button>
										</div>
									</div>
								)}

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
												changeWorkingDiffMode(
													"unstaged",
												)
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
										<DiffViewer
											content={
												fileDiff ||
												(workingDiffMode === "staged"
													? "No staged differences for this file."
													: "No unstaged differences for this file.")
											}
											isDiff={
												!(
													selectedWorkingFile.indexStatus ===
														"?" &&
													selectedWorkingFile.worktreeStatus ===
														"?"
												) && Boolean(fileDiff)
											}
										/>
									)}
								</div>
							</>
						) : !selectedCommit ? (
							<div className="details-empty">
								<p>No file or commit selected</p>
								<span>
									Select a working file or commit to view
									details.
								</span>
							</div>
						) : (
							<>
								<div className="selected-commit-info">
									<div className="selected-commit-message">
										{selectedCommit.message}
									</div>

									{selectedCommitMessage
										.split(/\r?\n\r?\n/)
										.slice(1)
										.join("\n\n")
										.trim() && (
										<div className="selected-commit-description">
											{selectedCommitMessage
												.split(/\r?\n\r?\n/)
												.slice(1)
												.join("\n\n")
												.trim()}
										</div>
									)}

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
													onClick={() =>
														selectFile(file)
													}
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
											Select a changed file to view its
											diff.
										</p>
									) : diffLoading ? (
										<p>Loading differences...</p>
									) : (
										<DiffViewer
											content={
												fileDiff ||
												"No textual differences available."
											}
											isDiff={Boolean(fileDiff)}
										/>
									)}
								</div>
							</>
						)}
					</aside>
				</div>
			</main>
		</div>
	);
}

export default App;
