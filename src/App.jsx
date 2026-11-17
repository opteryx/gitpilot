import { useEffect, useRef, useState } from "react";
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

function getRepositoryName(url) {
	const trimmed = url.trim().replace(/\/+$/, "");

	if (!trimmed) return "";

	const lastPart = trimmed.split(/[/:]/).pop();

	return lastPart.replace(/\.git$/i, "");
}

function App() {
	const [branch, setBranch] = useState("");
	const [branches, setBranches] = useState([]);
	const [remotes, setRemotes] = useState("");
	const [remoteBranches, setRemoteBranches] = useState([]);
	const [upstreamStatus, setUpstreamStatus] = useState("");
	const [upstreamDialogOpen, setUpstreamDialogOpen] = useState(false);
	const [selectedUpstream, setSelectedUpstream] = useState("");
	const [upstreamLoading, setUpstreamLoading] = useState(false);
	const [publishDialogOpen, setPublishDialogOpen] = useState(false);
	const [publishRemote, setPublishRemote] = useState("origin");
	const [publishLoading, setPublishLoading] = useState(false);
	const [publishError, setPublishError] = useState("");
	const [fetchingRemote, setFetchingRemote] = useState("");
	const [pushingBranch, setPushingBranch] = useState(false);
	const [pullingBranch, setPullingBranch] = useState(false);
	const [newBranchName, setNewBranchName] = useState("");
	const [branchCreating, setBranchCreating] = useState(false);
	const [branchBusy, setBranchBusy] = useState(false);
	const [mergeInProgress, setMergeInProgress] = useState(false);
	const [switchAfterCreate, setSwitchAfterCreate] = useState(true);
	const [repoPath, setRepoPath] = useState("");
	const [editRemoteDialogOpen, setEditRemoteDialogOpen] = useState(false);
	const [editingRemoteName, setEditingRemoteName] = useState("");
	const [editingRemoteUrl, setEditingRemoteUrl] = useState("");
	const [editRemoteLoading, setEditRemoteLoading] = useState(false);
	const [editRemoteError, setEditRemoteError] = useState("");
	const [addRemoteDialogOpen, setAddRemoteDialogOpen] = useState(false);
	const [newRemoteName, setNewRemoteName] = useState("origin");
	const [newRemoteUrl, setNewRemoteUrl] = useState("");
	const [addRemoteLoading, setAddRemoteLoading] = useState(false);
	const [addRemoteError, setAddRemoteError] = useState("");
	const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
	const [cloneUrl, setCloneUrl] = useState("");
	const [cloneDestination, setCloneDestination] = useState("");
	const [cloneFolderName, setCloneFolderName] = useState("");
	const [cloneLoading, setCloneLoading] = useState(false);
	const [cloneError, setCloneError] = useState("");
	const [githubDialogOpen, setGithubDialogOpen] = useState(false);
	const [githubRepoName, setGithubRepoName] = useState("");
	const [githubDescription, setGithubDescription] = useState("");
	const [githubPrivate, setGithubPrivate] = useState(true);
	const [githubLoading, setGithubLoading] = useState(false);
	const [githubError, setGithubError] = useState("");
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
	const [operationStatus, setOperationStatus] = useState("");
	const [workingChanges, setWorkingChanges] = useState([]);
	const [changesLoading, setChangesLoading] = useState(false);
	const [selectedWorkingFile, setSelectedWorkingFile] = useState(null);
	const [workingDiffMode, setWorkingDiffMode] = useState("unstaged");
	const [commitMessage, setCommitMessage] = useState("");
	const [commitLoading, setCommitLoading] = useState(false);

	// Separate request IDs prevent stale asynchronous results.
	const repoRequestId = useRef(0);
	const refreshRepositoryRef = useRef(null);
	const focusRefreshInProgress = useRef(false);
	const focusRefreshAllowed = useRef(false);
	const commitRequestId = useRef(0);
	const fileRequestId = useRef(0);
	const workingChangesRequestId = useRef(0);

	// Keep the focus listener informed of the latest repository state.
	focusRefreshAllowed.current =
		Boolean(repoPath) &&
		!repoLoading &&
		!fetchingRemote &&
		!pushingBranch &&
		!pullingBranch &&
		!branchBusy &&
		!commitLoading &&
		!mergeInProgress;

	// Refresh the repository when GitPilot regains focus.
	useEffect(() => {
		function handleWindowFocus() {
			if (
				!focusRefreshAllowed.current ||
				focusRefreshInProgress.current
			) {
				return;
			}

			focusRefreshInProgress.current = true;

			Promise.resolve(refreshRepositoryRef.current?.()).finally(() => {
				focusRefreshInProgress.current = false;
			});
		}

		window.addEventListener("focus", handleWindowFocus);

		return () => {
			window.removeEventListener("focus", handleWindowFocus);
		};
	}, []);

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

	async function refreshUpstreamStatus(path = repoPath) {
		if (!path) return;

		const status = await invoke("get_upstream_status", {
			repoPath: path,
		});

		setUpstreamStatus(status);
	}

	async function handleSetUpstream() {
		if (
			!repoPath ||
			!branch ||
			!selectedUpstream ||
			upstreamLoading ||
			repoLoading ||
			branchBusy ||
			mergeInProgress
		) {
			return;
		}

		const path = repoPath;
		const requestId = repoRequestId.current;

		setUpstreamLoading(true);
		setError("");
		setOperationStatus("");

		try {
			const message = await invoke("set_upstream", {
				repoPath: path,
				remoteBranch: selectedUpstream,
			});

			if (requestId !== repoRequestId.current) return;

			await refreshUpstreamStatus(path);

			setOperationStatus(message);
			setUpstreamDialogOpen(false);
			setSelectedUpstream("");
		} catch (err) {
			if (requestId === repoRequestId.current) {
				setError(String(err));
			}
		} finally {
			setUpstreamLoading(false);
		}
	}

	async function handlePublishBranch() {
		if (
			!repoPath ||
			!branch ||
			!publishRemote ||
			upstreamStatus ||
			publishLoading ||
			repoLoading ||
			branchBusy ||
			mergeInProgress ||
			Boolean(fetchingRemote) ||
			pushingBranch ||
			pullingBranch
		) {
			return;
		}

		const path = repoPath;
		const requestId = repoRequestId.current;

		setPublishLoading(true);
		setPublishError("");

		try {
			const message = await invoke("publish_branch", {
				repoPath: path,
				remoteName: publishRemote,
			});

			if (requestId !== repoRequestId.current) return;

			const [trackingStatus, availableRemoteBranches] = await Promise.all(
				[
					invoke("get_upstream_status", { repoPath: path }),
					invoke("get_remote_branches", { repoPath: path }),
				],
			);

			if (requestId !== repoRequestId.current) return;

			setUpstreamStatus(trackingStatus);
			setRemoteBranches(availableRemoteBranches);
			setOperationStatus(message);
			setPublishDialogOpen(false);
			setPublishError("");
		} catch (err) {
			if (requestId === repoRequestId.current) {
				setPublishError(String(err));
			}
		} finally {
			setPublishLoading(false);
		}
	}

	async function fetchRemote(remoteName) {
		if (
			!repoPath ||
			!remoteName ||
			fetchingRemote ||
			pushingBranch ||
			pullingBranch ||
			repoLoading ||
			branchBusy
		)
			return;

		const path = repoPath;
		const requestId = repoRequestId.current;
		setFetchingRemote(remoteName);
		setError("");
		setOperationStatus("");

		try {
			const result = await invoke("fetch_remote", {
				repoPath: path,
				remoteName,
			});
			if (requestId !== repoRequestId.current) return;
			await refreshUpstreamStatus(path);
			setOperationStatus(result);
		} catch (err) {
			if (requestId === repoRequestId.current) setError(String(err));
		} finally {
			setFetchingRemote("");
		}
	}

	async function pushCurrentBranch() {
		if (!repoPath) return;

		setPushingBranch(true);
		setError("");
		setOperationStatus("");

		try {
			const message = await invoke("push_current_branch", {
				repoPath,
			});

			setOperationStatus(message);
			await refreshUpstreamStatus(repoPath);
		} catch (error) {
			setError(String(error));
		} finally {
			setPushingBranch(false);
		}
	}

	async function pullCurrentBranch() {
		if (
			!repoPath ||
			pullingBranch ||
			pushingBranch ||
			fetchingRemote ||
			repoLoading ||
			branchBusy ||
			mergeInProgress
		) {
			return;
		}

		const path = repoPath;
		const requestId = repoRequestId.current;

		setPullingBranch(true);
		setError("");
		setOperationStatus("");

		try {
			const message = await invoke("pull_current_branch", {
				repoPath: path,
			});

			if (requestId !== repoRequestId.current) return;

			await refreshRepository();

			setOperationStatus(message);
		} catch (err) {
			if (requestId === repoRequestId.current) {
				setError(String(err));
			}
		} finally {
			setPullingBranch(false);
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
			setOperationStatus("");

			const result = await invoke("merge_branch", {
				repoPath,
				branchName,
			});

			const parsedCommits = await fetchCommitHistory(repoPath);

			setCommits(parsedCommits);
			clearSelection();
			await refreshWorkingChanges();
			await refreshUpstreamStatus();

			setOperationStatus(
				result.trim() || "Merge completed successfully.",
			);
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
			await refreshUpstreamStatus();
		} catch (err) {
			setError(String(err));
		} finally {
			setRepoLoading(false);
			setBranchBusy(false);
		}
	}

	async function refreshRepository() {
		if (
			!repoPath ||
			repoLoading ||
			pushingBranch ||
			fetchingRemote ||
			branchBusy
		) {
			return;
		}

		const path = repoPath;
		const requestId = repoRequestId.current;

		setRepoLoading(true);
		setError("");
		setOperationStatus("");

		try {
			const [
				currentBranch,
				localBranches,
				remoteList,
				availableRemoteBranches,
				trackingStatus,
				history,
			] = await Promise.all([
				invoke("get_current_branch", { repoPath: path }),
				invoke("get_local_branches", { repoPath: path }),
				invoke("get_remotes", { repoPath: path }),
				invoke("get_remote_branches", { repoPath: path }),
				invoke("get_upstream_status", { repoPath: path }),
				invoke("get_commit_history", { repoPath: path }),
			]);

			if (requestId !== repoRequestId.current) return;

			setBranch(currentBranch);
			setBranches(localBranches);
			setRemotes(remoteList);
			setRemoteBranches(availableRemoteBranches);
			setUpstreamStatus(trackingStatus);
			setCommits(parseCommitHistory(history));

			await Promise.all([
				refreshWorkingChanges(path),
				refreshMergeStatus(path),
			]);

			setOperationStatus("Repository refreshed.");
		} catch (err) {
			if (requestId === repoRequestId.current) {
				setError(String(err));
			}
		} finally {
			if (requestId === repoRequestId.current) {
				setRepoLoading(false);
			}
		}
	}

	refreshRepositoryRef.current = refreshRepository;

	async function removeRemote(remoteName) {
		if (!repoPath || !remoteName) return;

		const confirmed = await ask(
			`Remove remote "${remoteName}"?\n\n` +
				"This will remove the remote connection from the local repository.\n\n" +
				"The repository on GitHub will NOT be deleted.",
			{
				title: "Remove Remote",
				kind: "warning",
				okLabel: "Remove",
				cancelLabel: "Cancel",
			},
		);

		if (!confirmed) return;

		const path = repoPath;
		const requestId = repoRequestId.current;

		setBranchBusy(true);
		setError("");
		setOperationStatus("");

		try {
			const message = await invoke("remove_remote", {
				repoPath: path,
				remoteName,
			});

			// Reload remotes and upstream information.
			const [remoteList, availableRemoteBranches, trackingStatus] =
				await Promise.all([
					invoke("get_remotes", { repoPath: path }),
					invoke("get_remote_branches", { repoPath: path }),
					invoke("get_upstream_status", { repoPath: path }),
				]);

			if (requestId !== repoRequestId.current) return;

			setRemotes(remoteList);
			setRemoteBranches(availableRemoteBranches);
			setUpstreamStatus(trackingStatus);
			setOperationStatus(message);
		} catch (err) {
			if (requestId === repoRequestId.current) {
				setError(String(err));
			}
		} finally {
			setBranchBusy(false);
		}
	}

	async function handleUpdateRemoteUrl() {
		if (!repoPath || editRemoteLoading) return;

		setEditRemoteLoading(true);
		setEditRemoteError("");

		try {
			const message = await invoke("update_remote_url", {
				repoPath,
				remoteName: editingRemoteName,
				remoteUrl: editingRemoteUrl.trim(),
			});

			// Refresh the displayed remote list.
			const remoteList = await invoke("get_remotes", {
				repoPath,
			});

			setRemotes(remoteList);
			setEditRemoteDialogOpen(false);
			setOperationStatus(message);

			setEditingRemoteName("");
			setEditingRemoteUrl("");
		} catch (err) {
			setEditRemoteError(String(err));
		} finally {
			setEditRemoteLoading(false);
		}
	}

	async function handleAddRemote() {
		if (!repoPath || addRemoteLoading) return;

		setAddRemoteLoading(true);
		setAddRemoteError("");

		try {
			const message = await invoke("add_remote", {
				repoPath,
				remoteName: newRemoteName.trim(),
				remoteUrl: newRemoteUrl.trim(),
			});

			// Refresh the list of configured remotes.
			const remoteList = await invoke("get_remotes", {
				repoPath,
			});

			setRemotes(remoteList);
			setAddRemoteDialogOpen(false);
			setOperationStatus(message);

			// Reset the dialog for future use.
			setNewRemoteName("origin");
			setNewRemoteUrl("");
			setAddRemoteError("");
		} catch (err) {
			setAddRemoteError(String(err));
		} finally {
			setAddRemoteLoading(false);
		}
	}

	async function handleCreateGithubRepository() {
		if (!githubRepoName.trim() || githubLoading) return;

		setGithubLoading(true);
		setGithubError("");
		setError("");
		setOperationStatus("");

		try {
			const repositoryUrl = await invoke("create_github_repository", {
				repositoryName: githubRepoName.trim(),
				description: githubDescription.trim(),
				isPrivate: githubPrivate,
			});

			setGithubDialogOpen(false);
			setOperationStatus(
				`GitHub repository created successfully: ${repositoryUrl}`,
			);

			setGithubRepoName("");
			setGithubDescription("");
			setGithubPrivate(true);
		} catch (err) {
			setGithubError(String(err));
		} finally {
			setGithubLoading(false);
		}
	}

	async function handleCloneRepository() {
		if (cloneLoading) return;

		setCloneLoading(true);
		setCloneError("");

		try {
			const clonedPath = await invoke("clone_repository", {
				repositoryUrl: cloneUrl.trim(),
				destination: cloneDestination,
				folderName: cloneFolderName.trim(),
			});

			setCloneDialogOpen(false);

			// Open the newly cloned repository automatically.
			const opened = await openRepositoryAtPath(clonedPath);

			if (opened) {
				setOperationStatus(
					`Repository cloned and opened: ${clonedPath}`,
				);
			} else {
				setError(
					`Repository cloned successfully to ${clonedPath}, ` +
						"but GitPilot could not open it automatically.",
				);
			}

			setCloneUrl("");
			setCloneDestination("");
			setCloneFolderName("");
		} catch (err) {
			setCloneError(String(err));
		} finally {
			setCloneLoading(false);
		}
	}

	async function browseCloneDestination() {
		try {
			const selectedPath = await open({
				directory: true,
				multiple: false,
				title: "Choose Clone Destination",
				defaultPath: cloneDestination || undefined,
			});

			if (selectedPath) {
				setCloneDestination(selectedPath);
			}
		} catch (err) {
			setError(String(err));
		}
	}

	async function openRepositoryAtPath(selectedPath) {
		const id = ++repoRequestId.current;

		try {
			const rootPath = await invoke("get_repository_root", {
				repoPath: selectedPath,
			});

			if (id !== repoRequestId.current) return false;

			setError("");
			setOperationStatus("");
			setRepoLoading(true);
			setBranch("");
			setBranches([]);
			setRemotes("");
			setRemoteBranches([]);
			setUpstreamStatus("");
			setRepoPath("");
			setCommits([]);
			clearSelection();

			const currentBranch = await invoke("get_current_branch", {
				repoPath: rootPath,
			});

			const localBranches = await invoke("get_local_branches", {
				repoPath: rootPath,
			});

			const remoteList = await invoke("get_remotes", {
				repoPath: rootPath,
			});

			const availableRemoteBranches = await invoke(
				"get_remote_branches",
				{
					repoPath: rootPath,
				},
			);

			const trackingStatus = await invoke("get_upstream_status", {
				repoPath: rootPath,
			});

			const history = await invoke("get_commit_history", {
				repoPath: rootPath,
			});

			if (id !== repoRequestId.current) return false;

			setBranch(currentBranch);
			setBranches(localBranches);
			setRemotes(remoteList);
			setRemoteBranches(availableRemoteBranches);
			setUpstreamStatus(trackingStatus);
			setRepoPath(rootPath);
			setNewBranchName("");
			setSwitchAfterCreate(true);
			setCommits(parseCommitHistory(history));

			workingChangesRequestId.current += 1;
			setWorkingChanges([]);
			setMergeInProgress(false);

			await Promise.all([
				refreshWorkingChanges(rootPath),
				refreshMergeStatus(rootPath),
			]);

			return true;
		} catch (err) {
			if (id === repoRequestId.current) {
				setError(String(err));
			}
			return false;
		} finally {
			if (id === repoRequestId.current) {
				setRepoLoading(false);
			}
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

			await openRepositoryAtPath(selectedPath);
		} catch (err) {
			setError(String(err));
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
			await refreshUpstreamStatus();
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
							title={
								"Open an existing local Git repository without modifying its files.\n" +
								"Git: git rev-parse --show-toplevel"
							}
							className="button-primary"
							disabled={
								repoLoading ||
								Boolean(fetchingRemote) ||
								pushingBranch ||
								pullingBranch
							}
						>
							{repoLoading ? "Loading..." : "Open Repository"}
						</button>

						<button
							type="button"
							onClick={() => setCloneDialogOpen(true)}
							disabled={
								repoLoading ||
								Boolean(fetchingRemote) ||
								pushingBranch ||
								pullingBranch ||
								branchBusy
							}
							title={
								"Download an existing remote repository into a new local folder.\n" +
								"Git: git clone <repository-url>"
							}
						>
							Clone Repository
						</button>

						<button
							type="button"
							onClick={() => {
								setGithubError("");
								setGithubDialogOpen(true);
							}}
							disabled={
								repoLoading ||
								githubLoading ||
								Boolean(fetchingRemote) ||
								pushingBranch ||
								pullingBranch ||
								branchBusy
							}
							title={
								"Create a new public or private repository in your GitHub account without uploading local files.\n" +
								"GitHub CLI: gh repo create <name> --private"
							}
						>
							Create GitHub Repository
						</button>

						<button
							type="button"
							onClick={refreshRepository}
							disabled={
								!repoPath ||
								repoLoading ||
								pushingBranch ||
								Boolean(fetchingRemote) ||
								branchBusy ||
								mergeInProgress
							}
							title={
								"Reload local repository status, branches, commits, and tracking information without contacting GitHub.\n" +
								"Git: git status, git branch, git log (and other read-only commands)"
							}
						>
							{repoLoading ? "Refreshing..." : "Refresh"}
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

						{repoPath && (
							<div className="remote-list">
								<h3>Remote Repositories</h3>

								<button
									type="button"
									onClick={() => setAddRemoteDialogOpen(true)}
									disabled={
										repoLoading ||
										Boolean(fetchingRemote) ||
										pushingBranch ||
										pullingBranch ||
										branchBusy
									}
									title={
										"Connect this local repository to an existing remote repository without uploading files.\n" +
										"Git: git remote add origin <repository-url>"
									}
								>
									Add Remote
								</button>

								{remotes ? (
									<div className="remote-entries">
										{remotes
											.split("\n")
											.filter((line) =>
												line.includes("(fetch)"),
											)
											.map((line) => {
												const [name, url] =
													line.split(/\s+/);

												return (
													<div
														className="remote-entry"
														key={name}
													>
														<strong>{name}</strong>
														<span title={url}>
															{url}
														</span>
														<button
															type="button"
															onClick={() => {
																setEditingRemoteName(
																	name,
																);
																setEditingRemoteUrl(
																	url,
																);
																setEditRemoteDialogOpen(
																	true,
																);
															}}
															disabled={
																repoLoading ||
																Boolean(
																	fetchingRemote,
																) ||
																pushingBranch ||
																pullingBranch ||
																branchBusy
															}
															title={
																`Change the URL for remote "${name}" without fetching or pushing.\n` +
																`Git: git remote set-url ${name} <new-url>`
															}
														>
															Edit
														</button>
														<button
															type="button"
															className="button-danger"
															onClick={() =>
																removeRemote(
																	name,
																)
															}
															disabled={
																repoLoading ||
																Boolean(
																	fetchingRemote,
																) ||
																pushingBranch ||
																pullingBranch ||
																branchBusy
															}
															title={
																`Remove the local connection to remote "${name}" without deleting the repository on GitHub.\n` +
																`Git: git remote remove ${name}`
															}
														>
															Remove
														</button>
														<button
															type="button"
															onClick={() =>
																fetchRemote(
																	name,
																)
															}
															title={
																"Download remote commits and update remote-tracking branches without merging.\n" +
																`Git: git fetch ${name}`
															}
															disabled={
																Boolean(
																	fetchingRemote,
																) ||
																pullingBranch ||
																pushingBranch ||
																repoLoading ||
																branchBusy ||
																mergeInProgress
															}
														>
															{fetchingRemote ===
															name
																? "Fetching..."
																: "Fetch"}
														</button>
														<button
															type="button"
															onClick={
																pushCurrentBranch
															}
															disabled={
																!repoPath ||
																!branch ||
																pushingBranch ||
																pullingBranch ||
																Boolean(
																	fetchingRemote,
																) ||
																!upstreamStatus ||
																repoLoading ||
																branchBusy ||
																mergeInProgress
															}
															title={
																"Upload new local commits to the configured remote branch.\n" +
																"Git: git push"
															}
														>
															{pushingBranch
																? "Pushing..."
																: "Push"}
														</button>
														<button
															type="button"
															onClick={
																pullCurrentBranch
															}
															disabled={
																!repoPath ||
																!branch ||
																!upstreamStatus ||
																pullingBranch ||
																pushingBranch ||
																Boolean(
																	fetchingRemote,
																) ||
																repoLoading ||
																branchBusy ||
																mergeInProgress
															}
															title={
																"Fetch remote changes and update the current branch only if a fast-forward is possible.\n" +
																"Git: git fetch <remote> && git merge --ff-only @{upstream}"
															}
														>
															{pullingBranch
																? "Pulling..."
																: "Pull"}
														</button>
													</div>
												);
											})}
									</div>
								) : (
									<p className="placeholder">
										No remotes configured
									</p>
								)}
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

						{branch &&
							upstreamStatus &&
							(() => {
								const [upstream, ahead, behind] =
									upstreamStatus.split("|");

								return (
									<div className="upstream-status">
										<p>
											Tracking:{" "}
											<strong>{upstream}</strong>
										</p>
										<p>
											Ahead: {ahead || "0"} · Behind:{" "}
											{behind || "0"}
										</p>
									</div>
								);
							})()}

						{branch && remotes && (
							<button
								type="button"
								onClick={() => {
									setSelectedUpstream(
										upstreamStatus
											? upstreamStatus.split("|")[0]
											: "",
									);
									setUpstreamDialogOpen(true);
								}}
								disabled={
									repoLoading ||
									branchBusy ||
									upstreamLoading ||
									Boolean(fetchingRemote) ||
									pushingBranch ||
									pullingBranch ||
									mergeInProgress
								}
								title={
									"Choose which remote branch the current local branch tracks.\n" +
									"Git: git branch --set-upstream-to=origin/main"
								}
							>
								Set Upstream
							</button>
						)}

						{branch && remotes && !upstreamStatus && (
							<button
								type="button"
								onClick={() => {
									const remoteNames = remotes
										.split("\n")
										.filter((line) =>
											line.includes("(fetch)"),
										)
										.map(
											(line) =>
												line.trim().split(/\s+/)[0],
										);

									setPublishRemote(
										remoteNames.includes("origin")
											? "origin"
											: remoteNames[0] || "",
									);
									setPublishError("");
									setPublishDialogOpen(true);
								}}
								disabled={
									repoLoading ||
									branchBusy ||
									publishLoading ||
									Boolean(fetchingRemote) ||
									pushingBranch ||
									pullingBranch ||
									mergeInProgress
								}
								title={
									"Upload this branch for the first time and configure upstream tracking.\n" +
									`Git: git push -u ${publishRemote || "origin"} ${branch}`
								}
							>
								Publish Branch
							</button>
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
											title={
												`Switch to local branch "${branchName}".\n` +
												`Git: git switch "${branchName}"`
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
													title={
														`Merge branch "${branchName}" INTO the current branch "${branch}".\n` +
														`Git: git merge "${branchName}"`
													}
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
													title={
														`Delete local branch "${branchName}" if its changes have been merged.\n` +
														`Git: git branch -d "${branchName}"`
													}
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
										title={
											"Create a new local branch without uploading it to GitHub.\n" +
											`Git: git branch "${newBranchName}"` +
											(switchAfterCreate
												? ` && git switch "${newBranchName}"`
												: "")
										}
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
						{/* COMMIT HISTORY — Following branch management in the scrolling sidebar */}
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
												selectedCommit?.sha ===
												commit.sha
													? "selected"
													: ""
											}`}
											key={commit.sha}
											onClick={() => selectCommit(commit)}
											aria-pressed={
												selectedCommit?.sha ===
												commit.sha
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
													{commit.author} ·{" "}
													{commit.date}
												</span>
											</span>
										</button>
									))}
								</div>
							)}
						</section>
					</aside>
				</div>
				<div className="right-column">
					{/* CENTER COLUMN — Working Changes */}
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
										title={
											"Stage all new, modified, and deleted files for the next commit.\n" +
											"Git: git add -A"
										}
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
										title={
											"Remove all files from the staging area without discarding their changes.\n" +
											"Git: git restore --staged -- ."
										}
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
														title={
															`Stage changes to ${file.path} for the next commit.\n` +
															`Git: git add -- "${file.path}"`
														}
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
															title={
																`Remove ${file.path} from staging without discarding edits.\n` +
																`Git: git restore --staged -- "${file.path}"`
															}
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
								title={
									"Save staged changes as a new local commit.\n" +
									'Git: git commit -m "Commit summary"'
								}
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
			<footer
				className={`app-status-bar${error ? " app-status-error" : operationStatus ? " app-status-success" : ""}`}
			>
				{error ? (
					<div className="app-status-content" role="alert">
						<strong>Git Error</strong>
						<span className="app-status-message">{error}</span>
						<button type="button" onClick={() => setError("")}>
							Dismiss
						</button>
					</div>
				) : operationStatus ? (
					<div className="app-status-content" role="status">
						<strong>Operation Status</strong>
						<span className="app-status-message">
							{operationStatus}
						</span>
						<button
							type="button"
							onClick={() => setOperationStatus("")}
						>
							Dismiss
						</button>
					</div>
				) : (
					<div className="app-status-content">
						<strong>Status</strong>
						<span className="app-status-message">Ready</span>
					</div>
				)}
			</footer>
			{cloneDialogOpen && (
				<div className="clone-dialog-overlay">
					<section
						className="clone-dialog"
						role="dialog"
						aria-modal="true"
						aria-labelledby="clone-dialog-title"
					>
						<h2 id="clone-dialog-title">Clone Repository</h2>

						<label htmlFor="clone-url">Repository URL</label>
						<input
							id="clone-url"
							disabled={cloneLoading}
							type="text"
							placeholder="git@github.com:user/repository.git"
							value={cloneUrl}
							onChange={(event) => {
								const url = event.target.value;
								const previousSuggestion =
									getRepositoryName(cloneUrl);

								setCloneUrl(url);

								if (
									!cloneFolderName ||
									cloneFolderName === previousSuggestion
								) {
									setCloneFolderName(getRepositoryName(url));
								}
							}}
						/>

						<label htmlFor="clone-destination">
							Destination Folder
						</label>
						<div className="clone-destination-row">
							<input
								id="clone-destination"
								type="text"
								placeholder="Select a parent folder..."
								value={cloneDestination}
								readOnly
							/>
							<button
								type="button"
								onClick={browseCloneDestination}
								disabled={cloneLoading}
							>
								Browse
							</button>
						</div>

						<label htmlFor="clone-folder-name">
							Repository Folder Name
						</label>
						<input
							id="clone-folder-name"
							disabled={cloneLoading}
							type="text"
							placeholder="my-repository"
							value={cloneFolderName}
							onChange={(event) =>
								setCloneFolderName(event.target.value)
							}
						/>

						{cloneError && (
							<p role="alert" className="clone-error">
								{cloneError}
							</p>
						)}

						<div className="clone-dialog-actions">
							<button
								type="button"
								onClick={() => setCloneDialogOpen(false)}
								disabled={cloneLoading}
							>
								Cancel
							</button>

							<button
								type="button"
								className="button-primary"
								onClick={handleCloneRepository}
								disabled={
									cloneLoading ||
									!cloneUrl.trim() ||
									!cloneDestination ||
									!cloneFolderName.trim()
								}
							>
								{cloneLoading ? "Cloning..." : "Clone"}
							</button>
						</div>
					</section>
				</div>
			)}

			{githubDialogOpen && (
				<div className="clone-dialog-overlay">
					<section
						className="clone-dialog"
						role="dialog"
						aria-modal="true"
						aria-labelledby="github-dialog-title"
					>
						<h2 id="github-dialog-title">
							Create GitHub Repository
						</h2>

						<label htmlFor="github-repo-name">
							Repository Name
						</label>
						<input
							id="github-repo-name"
							type="text"
							placeholder="my-new-repository"
							value={githubRepoName}
							onChange={(event) =>
								setGithubRepoName(event.target.value)
							}
							disabled={githubLoading}
						/>

						<label htmlFor="github-description">
							Description (optional)
						</label>
						<input
							id="github-description"
							type="text"
							placeholder="Brief description of the project"
							value={githubDescription}
							onChange={(event) =>
								setGithubDescription(event.target.value)
							}
							disabled={githubLoading}
						/>

						<label htmlFor="github-visibility">Visibility</label>
						<select
							id="github-visibility"
							value={githubPrivate ? "private" : "public"}
							onChange={(event) =>
								setGithubPrivate(
									event.target.value === "private",
								)
							}
							disabled={githubLoading}
						>
							<option value="private">Private</option>
							<option value="public">Public</option>
						</select>

						<p className="placeholder">
							Creates an empty repository in your authenticated
							GitHub account. No local files will be uploaded, and
							no remote will be added automatically.
						</p>

						{githubError && (
							<p className="clone-error" role="alert">
								{githubError}
							</p>
						)}

						<div className="clone-dialog-actions">
							<button
								type="button"
								onClick={() => setGithubDialogOpen(false)}
								disabled={githubLoading}
							>
								Cancel
							</button>

							<button
								type="button"
								className="button-primary"
								onClick={handleCreateGithubRepository}
								disabled={
									githubLoading || !githubRepoName.trim()
								}
							>
								{githubLoading
									? "Creating..."
									: "Create Repository"}
							</button>
						</div>
					</section>
				</div>
			)}

			{addRemoteDialogOpen && (
				<div className="clone-dialog-overlay">
					<section
						className="clone-dialog"
						role="dialog"
						aria-modal="true"
						aria-labelledby="add-remote-dialog-title"
					>
						<h2 id="add-remote-dialog-title">Add Remote</h2>

						<label htmlFor="new-remote-name">Remote Name</label>
						<input
							id="new-remote-name"
							type="text"
							placeholder="origin"
							value={newRemoteName}
							onChange={(event) =>
								setNewRemoteName(event.target.value)
							}
							disabled={addRemoteLoading}
						/>

						<label htmlFor="new-remote-url">Repository URL</label>
						<input
							id="new-remote-url"
							type="text"
							placeholder="git@github.com:user/repository.git"
							value={newRemoteUrl}
							onChange={(event) =>
								setNewRemoteUrl(event.target.value)
							}
							disabled={addRemoteLoading}
						/>

						{addRemoteError && (
							<p className="clone-error" role="alert">
								{addRemoteError}
							</p>
						)}

						<div className="clone-dialog-actions">
							<button
								type="button"
								onClick={() => setAddRemoteDialogOpen(false)}
								disabled={addRemoteLoading}
							>
								Cancel
							</button>

							<button
								type="button"
								className="button-primary"
								onClick={handleAddRemote}
								disabled={
									addRemoteLoading ||
									!newRemoteName.trim() ||
									!newRemoteUrl.trim()
								}
							>
								{addRemoteLoading ? "Adding..." : "Add Remote"}
							</button>
						</div>
					</section>
				</div>
			)}

			{editRemoteDialogOpen && (
				<div className="clone-dialog-overlay">
					<section
						className="clone-dialog"
						role="dialog"
						aria-modal="true"
						aria-labelledby="edit-remote-dialog-title"
					>
						<h2 id="edit-remote-dialog-title">Edit Remote</h2>

						<label htmlFor="editing-remote-name">Remote Name</label>
						<input
							id="editing-remote-name"
							type="text"
							value={editingRemoteName}
							readOnly
						/>

						<label htmlFor="editing-remote-url">
							Repository URL
						</label>
						<input
							id="editing-remote-url"
							type="text"
							disabled={editRemoteLoading}
							placeholder="git@github.com:user/repository.git"
							value={editingRemoteUrl}
							onChange={(event) =>
								setEditingRemoteUrl(event.target.value)
							}
						/>

						{editRemoteError && (
							<p className="clone-error" role="alert">
								{editRemoteError}
							</p>
						)}

						<div className="clone-dialog-actions">
							<button
								type="button"
								onClick={() => setEditRemoteDialogOpen(false)}
								disabled={editRemoteLoading}
							>
								Cancel
							</button>

							<button
								type="button"
								className="button-primary"
								onClick={handleUpdateRemoteUrl}
								disabled={
									editRemoteLoading ||
									!editingRemoteUrl.trim()
								}
							>
								{editRemoteLoading
									? "Saving..."
									: "Save Changes"}
							</button>
						</div>
					</section>
				</div>
			)}

			{upstreamDialogOpen && (
				<div className="clone-dialog-overlay">
					<section
						className="clone-dialog"
						role="dialog"
						aria-modal="true"
						aria-labelledby="upstream-dialog-title"
					>
						<h2 id="upstream-dialog-title">Set Upstream</h2>

						<p>
							Choose the remote branch that local branch{" "}
							<strong>{branch}</strong> should track.
						</p>

						<label htmlFor="upstream-branch">Remote Branch</label>

						<select
							id="upstream-branch"
							value={selectedUpstream}
							onChange={(event) =>
								setSelectedUpstream(event.target.value)
							}
							disabled={upstreamLoading}
						>
							<option value="">Select a remote branch...</option>

							{remoteBranches.map((remoteBranch) => (
								<option key={remoteBranch} value={remoteBranch}>
									{remoteBranch}
								</option>
							))}
						</select>

						{remoteBranches.length === 0 && (
							<p className="placeholder">
								No remote branches are available. Fetch from the
								remote repository first.
							</p>
						)}

						<div className="clone-dialog-actions">
							<button
								type="button"
								onClick={() => setUpstreamDialogOpen(false)}
								disabled={upstreamLoading}
							>
								Cancel
							</button>

							<button
								type="button"
								className="button-primary"
								onClick={handleSetUpstream}
								disabled={
									upstreamLoading ||
									!selectedUpstream ||
									selectedUpstream ===
										(upstreamStatus
											? upstreamStatus.split("|")[0]
											: "")
								}
							>
								{upstreamLoading ? "Saving..." : "Set Upstream"}
							</button>
						</div>
					</section>
				</div>
			)}

			{publishDialogOpen && (
				<div className="clone-dialog-overlay">
					<section
						className="clone-dialog"
						role="dialog"
						aria-modal="true"
						aria-labelledby="publish-dialog-title"
					>
						<h2 id="publish-dialog-title">Publish Branch</h2>

						<p>
							Publish the current local branch to a remote
							repository and configure upstream tracking.
						</p>

						<label>Local Branch</label>
						<strong>{branch}</strong>

						<label htmlFor="publish-remote">
							Remote Repository
						</label>

						<select
							id="publish-remote"
							value={publishRemote}
							onChange={(event) =>
								setPublishRemote(event.target.value)
							}
							disabled={publishLoading}
						>
							{remotes
								.split("\n")
								.filter((line) => line.includes("(fetch)"))
								.map((line) => line.trim().split(/\s+/)[0])
								.map((name) => (
									<option key={name} value={name}>
										{name}
									</option>
								))}
						</select>

						<label>Destination Branch</label>
						<strong>
							{publishRemote}/{branch}
						</strong>

						<p className="placeholder">
							This will create the remote branch and set it as the
							upstream for your local branch. Publishing will be
							rejected if the remote branch already exists.
						</p>

						{publishError && (
							<p className="clone-error" role="alert">
								{publishError}
							</p>
						)}

						<div className="clone-dialog-actions">
							<button
								type="button"
								onClick={() => setPublishDialogOpen(false)}
								disabled={publishLoading}
							>
								Cancel
							</button>

							<button
								type="button"
								className="button-primary"
								onClick={handlePublishBranch}
								disabled={
									publishLoading ||
									!publishRemote ||
									!branch ||
									Boolean(upstreamStatus)
								}
							>
								{publishLoading ? "Publishing..." : "Publish"}
							</button>
						</div>
					</section>
				</div>
			)}
		</div>
	);
}

export default App;
