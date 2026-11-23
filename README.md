# GitPilot

**A simple, cross-platform desktop interface for Git.**

GitPilot is a lightweight Git client focused on everyday version control, a clear interface, and optional contextual help rather than subscriptions or unnecessary complexity.

Created by Joe Shockey ([Opteryx](https://github.com/opteryx)).

## Features

- Open, initialize, and clone Git repositories.
- View commit history, changed files, and colorized file differences; identify binary changes.
- Stage and unstage files, create commits, and configure a repository-specific commit author.
- Create, switch, delete, and merge branches; resolve merge conflicts.
- Configure remotes and upstream branches; create GitHub repositories and publish branches.
- Fetch, push, and pull using fast-forward-only (default), merge, or rebase strategies, with rebase conflict recovery.
- Stash and restore changes, discard unstaged tracked-file changes with confirmation, and refresh repository information.
- Use optional help popups and tooltips for Git terminology and controls.

## Installation and development

GitPilot is currently available **as source code**. Its first installable **Ubuntu `.deb` package** is in preparation. Windows and macOS packages are deferred until those platforms can be tested.

### Development prerequisites

- Git
- Node.js and npm
- Rust and Cargo
- [Tauri 2 development dependencies](https://v2.tauri.app/start/prerequisites/) for your operating system

GitPilot uses your existing SSH configuration or Git credential helpers for remote authentication. The GitHub CLI (`gh`) is needed only for the **Create GitHub Repository** feature.

### Run from source

```bash
git clone https://github.com/opteryx/gitpilot.git
cd gitpilot
npm install
npm run tauri dev
```

Production package installation instructions will be added after the Ubuntu package has been built and tested.

## Screenshots

Screenshots will be added with the first release.

## Technologies

GitPilot uses **Tauri 2**, **React**, **Vite**, **JavaScript**, **Rust**, and the installed **Git** executable.

## Roadmap

The immediate priority is to build, install, and validate an Ubuntu `.deb` package, then document installation and authentication. Windows and macOS support remains a future goal, not a tested release claim.

See [ROADMAP.md](ROADMAP.md) for completed work, remaining release checks, and deferred enhancements.

## Contributing

GitPilot is currently a personal development project. Contribution guidelines may be added later.

## License

Copyright © 2026 Joe Shockey.

GitPilot is free software licensed under the **GNU General Public License, version 3 only** (`GPL-3.0-only`). You may use, modify, and redistribute GitPilot under the terms of that license.

See [LICENSE](LICENSE) for the full license text.
