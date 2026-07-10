# Bellman GUI

Desktop graph viewer for [Bellman](https://github.com/davidtgillard/bellman) roadmaps.

Bellman stores product roadmaps as markdown on disk and derives a pyfits graph for validation. This app visualizes that graph — initiatives, projects, work packages, milestones, goals, and their connections — in an interactive WebGL canvas powered by [Reagraph](https://reagraph.dev/).

On first launch the app shows a bundled example roadmap. Pass a roadmap root on the command line to open it directly, or use **Open roadmap…** to pick any initialized bellman roadmap folder (one that contains `.fits/registry.json` from `bellman init`).

## Prerequisites

**Development** (Linux):

- [Node.js](https://nodejs.org/) LTS
- [Rust](https://rustup.rs/)
- Tauri system dependencies — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) (`libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, etc.)

**Running a release AppImage** (Linux):

- FUSE / AppImage runtime support (most desktop distros; install `libfuse2` on Ubuntu if needed)
- No separate bellman install required (the CLI is bundled as a sidecar inside the AppImage)

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
npm run tauri build   # Production AppImage build
```

To build a signed AppImage locally (requires the updater signing private key):

```bash
bash packaging/prepare-sidecar.sh
export TAURI_SIGNING_PRIVATE_KEY="$(cat humans-only/tauri-updater.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
npm run tauri build
```

The AppImage and `.sig` land under `src-tauri/target/release/bundle/appimage/`.

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
3. Click **Open roadmap…** (toolbar), use **File → Open Roadmap…**, or press **Ctrl+O** / **Cmd+O** and select a bellman roadmap root directory.
4. Pan, zoom, and click nodes to explore connections (parent/child and precedence links).

Roadmap data is read from:

- `.fits/registry.json` — node instances and types
- `links/links.jsonc` — directed links between nodes

Run `bellman init` and `bellman sync` in your roadmap repo before opening it here if the graph artifacts are missing.

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

Release AppImages check for updates in the background (at most once per 24 hours by default) and show a banner when a newer build is available. Use **Help → Check for Updates…** to check immediately, and **Update now** on the banner to download, install, and relaunch.

Update settings live in `$XDG_CONFIG_HOME/bellman-gui/settings.json` (`update_check_interval_hours`, default `24`). Last-check state is stored in `update-state.json` next to that file.

## Releases

Rolling **linux-x86_64** AppImages are published to the [`dev` release](https://github.com/davidtgillard/bellman-gui/releases/tag/dev). Each CI run stamps version `0.1.<run_number>` so the in-app updater can detect newer builds.

```bash
curl -fsSL -o bellman-gui.AppImage \
  "https://github.com/davidtgillard/bellman-gui/releases/download/dev/bellman-gui_0.1.VERSION_amd64.AppImage"
chmod +x bellman-gui.AppImage
./bellman-gui.AppImage
```

The AppImage includes the GUI and a bundled `bellman` CLI sidecar. The updater reads `latest.json` from the same `dev` release.

### Signing secrets (maintainers)

Release builds require GitHub Actions secrets:

- `TAURI_SIGNING_PRIVATE_KEY` — contents of the minisign/updater private key
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — password if the key has one (empty string is fine for an unpassworded key)

The matching public key is committed in `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.

## License

AGPL-3.0-or-later — same as [bellman](https://github.com/davidtgillard/bellman).
