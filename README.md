# Bellman GUI

Desktop graph viewer for [Bellman](https://github.com/davidtgillard/bellman) roadmaps.

Bellman stores product roadmaps as markdown on disk and derives a pyfits graph for validation. This app visualizes that graph — initiatives, projects, work packages, milestones, goals, and their connections — in an interactive WebGL canvas powered by [Reagraph](https://reagraph.dev/).

On first launch the app shows a bundled example roadmap. After you open a roadmap folder, the next launch reopens that project when it is still available; otherwise it falls back to the example. Pass a roadmap root on the command line to open it directly (this also becomes the remembered project), or use **Open roadmap…** to pick any initialized bellman roadmap folder (one that contains `.fits/registry.json` from `bellman init`).

## Prerequisites

**Development:**

- [Node.js](https://nodejs.org/) LTS
- [Rust](https://rustup.rs/)
- Tauri system dependencies — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
  - Linux: `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, etc.
  - Windows: Microsoft C++ Build Tools and WebView2 (usually preinstalled on Windows 10/11)
  - macOS: Xcode Command Line Tools

**Running a release build:**

- **Linux AppImage** — FUSE / AppImage runtime support (install `libfuse2` on Ubuntu if needed)
- **Windows NSIS** — WebView2 runtime (installer can bootstrap it if missing)
- **macOS DMG** — Apple Silicon (arm64). Rolling `dev` builds are not Apple-notarized; Gatekeeper may require right-click → **Open** on first launch
- No separate bellman install required (the CLI is bundled as a sidecar)

## Development

```bash
git clone https://github.com/davidtgillard/bellman-gui.git
cd bellman-gui
npm install
npm run tauri dev
```

The `npm run tauri` script prepares the bundled `bellman` sidecar automatically. If sidecar execution fails, the app falls back to a `bellman` binary on your `PATH`.

Other commands:

```bash
npm run test          # Vitest unit tests
npm run lint          # ESLint
npm run tauri build   # Production bundles for the current OS
```

To build signed release bundles locally (requires the updater signing private key):

```bash
bash packaging/prepare-sidecar.sh
export TAURI_SIGNING_PRIVATE_KEY="$(cat humans-only/tauri-updater.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
npm run tauri build
```

Artifacts land under `src-tauri/target/release/bundle/` (`appimage/`, `nsis/`, `macos/`, `dmg/` depending on host OS).

## Using the app

1. Start the app (`npm run tauri dev` or the release AppImage).
2. The example roadmap graph loads automatically, unless you pass an initial roadmap root:

```bash
# release AppImage
./bellman-gui_*.AppImage /path/to/roadmap
./bellman-gui_*.AppImage --roadmap /path/to/roadmap

# development (npm, tauri, and cargo each consume a `--` separator)
npm run tauri dev -- -- -- /path/to/roadmap
npm run tauri dev -- -- -- --roadmap /path/to/roadmap

# development (run the debug binary directly, after at least one build)
cargo run --manifest-path src-tauri/Cargo.toml -- /path/to/roadmap
./src-tauri/target/debug/bellman-gui /path/to/roadmap
```
3. Use **File → Open Roadmap…** (or **Ctrl+O** / **Cmd+O**) to pick a bellman roadmap root directory. Use **File → Show Example Roadmap** to return to the bundled demo graph.
4. Pan, zoom, and click nodes to explore connections (parent/child and precedence links).

Roadmap data is read from:

- `.fits/registry.json` — node instances (local `name` + `guid`, nested via `parent_guid`) and link type metadata
- `links/links.jsonc` — root-scoped directed links (GUID endpoints)
- `nodes/**/.fits/subgraph.jsonc` — nested nodes and links under kind/project containers

Node ids in the UI are slash-qualified logical paths (for example `project/billing-redesign/wp-invoicing`).

Run `bellman init` and `bellman sync` in your roadmap repo before opening it here if the graph artifacts are missing.

After upgrading bellman, re-sync each roadmap so `.fits/` matches the current schema. Recent releases nest initiatives and projects under a shared `work_scope` kind-root so mixed scope links survive promotion; `bellman sync` migrates that automatically. If sync reports a protocol or schema problem, remove `.fits/`, `nodes/`, and `links/`, then run `bellman init .` and `bellman sync .`. Markdown remains the source of truth.

## Features

### Undo / redo

Undo and redo are available when you have an **editable** roadmap open (a folder on disk with `.fits/registry.json`). The bundled example graph is read-only and does not support undo/redo.

Each undo step reverses one **structural** edit:

- Create or remove a node
- Create or remove a link

Node drag positions are saved separately and are **not** part of the undo stack. Undoing a node deletion does restore its saved layout position when one exists.

**How to undo or redo**

- **Toolbar** — **Undo** and **Redo** buttons appear above the graph when the roadmap is editable. Hover a button to see what operation it will apply (for example, `Undo: create goal reduce-churn`).
- **Menu** — **Edit → Undo** or **Edit → Redo**
- **Keyboard** — **Ctrl+Z** / **Cmd+Z** to undo; **Ctrl+Shift+Z** / **Cmd+Shift+Z** to redo

History is persisted per editable roadmap in `.fits/undo-history.json`. It survives app restarts when you reopen the same roadmap folder. If the on-disk files no longer match the saved undo cursor (for example after `bellman sync`, a git pull, or manual edits outside the app), the saved history is discarded and a fresh stack starts.

Add `.fits/undo-history.json` to your roadmap repo’s `.gitignore` alongside other local GUI state such as `.fits/work-package-layout.json`. There is no app-global undo history today — stacks are scoped to each roadmap root.

**Developer tracing**

To inspect undo/redo stack activity while developing:

- **Backend** — set `BELLMAN_GUI_TRACE_UNDO` in the environment before starting the app; stack events are logged to stderr.
- **Frontend** — in dev builds, undo/redo calls are logged to the browser devtools console. In any build, set `localStorage["bellman:trace-undo"]` (any value) and reload to enable the same logging.

### Self-update

Release builds check for updates in the background (at most once per 24 hours by default) and show a banner when a newer build is available. Use **Help → Check for Updates…** to check immediately, and **Update now** on the banner to download, install, and relaunch.

All platforms share the rolling [`dev`](https://github.com/davidtgillard/bellman-gui/releases/tag/dev) channel and `latest.json`. The updater verifies minisign signatures, then installs a platform-specific payload:

| Platform | First-time install | Updater downloads |
|---|---|---|
| Linux x86_64 | `.AppImage` | same `.AppImage` (replaced in place) |
| Windows x86_64 | NSIS `*-setup.exe` | same NSIS installer (app quits, passive install, relaunch) |
| macOS aarch64 | `.dmg` | `.app.tar.gz` extracted over the installed `.app` (not the DMG) |

Update settings live in:

- Linux/macOS: `$XDG_CONFIG_HOME/bellman-gui/settings.json` (default `~/.config/bellman-gui/settings.json`)
- Windows: `%APPDATA%\bellman-gui\settings.json`

`update_check_interval_hours` defaults to `24`; `last_roadmap_root` remembers the last opened project. Last-check state is stored in `update-state.json` next to that file.

## Releases

Rolling multi-platform builds are published to the [`dev` release](https://github.com/davidtgillard/bellman-gui/releases/tag/dev). Each CI run stamps version `0.1.<run_number>` so the in-app updater can detect newer builds.

**Linux (AppImage):**

```bash
curl -fsSL -o bellman-gui.AppImage \
  "https://github.com/davidtgillard/bellman-gui/releases/download/dev/bellman-gui_0.1.VERSION_amd64.AppImage"
chmod +x bellman-gui.AppImage
./bellman-gui.AppImage
```

**Windows (NSIS):** download `bellman-gui_0.1.VERSION_x64-setup.exe` from the [`dev` release](https://github.com/davidtgillard/bellman-gui/releases/tag/dev) and run the installer.

**macOS (Apple Silicon DMG):** download `bellman-gui_0.1.VERSION_aarch64.dmg` from the same release, open it, and drag the app to Applications. If Gatekeeper blocks the unsigned `dev` build, right-click the app and choose **Open**.

Each bundle includes the GUI and a bundled `bellman` CLI sidecar. The updater reads `latest.json` from the same `dev` release (`linux-x86_64`, `windows-x86_64`, `darwin-aarch64`).

### Signing secrets (maintainers)

Release builds require the GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY` (contents of the updater private key). The committed keypair was generated without a password; the release workflow sets `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to an empty string. Do not create a password secret unless you regenerate a password-protected key.

The matching public key is committed in `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`. Apple Developer ID / notarization and Windows Authenticode are not configured for rolling `dev` builds.

## License

AGPL-3.0-or-later — same as [bellman](https://github.com/davidtgillard/bellman).
