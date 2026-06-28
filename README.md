# Bellman GUI

Desktop graph viewer for [Bellman](https://github.com/davidtgillard/bellman) roadmaps.

Bellman stores product roadmaps as markdown on disk and derives a pyfits graph for validation. This app visualizes that graph — initiatives, projects, work packages, milestones, goals, and their connections — in an interactive WebGL canvas powered by [Reagraph](https://reagraph.dev/).

On first launch the app shows a bundled example roadmap. Use **Open roadmap…** to point at any initialized bellman roadmap folder (one that contains `.fits/registry.json` from `bellman init`).

## Prerequisites

**Development** (Linux):

- [Node.js](https://nodejs.org/) LTS
- [Rust](https://rustup.rs/)
- Tauri system dependencies — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) (`libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, etc.)

**Running a release bundle** (Linux):

- WebKitGTK (usually preinstalled on desktop distros)
- Extract the portable tarball; no separate bellman install required (the CLI is bundled as a sidecar)

## Development

```bash
git clone https://github.com/davidtgillard/bellman-gui.git
cd bellman-gui
npm install
npm run tauri dev
```

Other commands:

```bash
npm run test          # Vitest unit tests
npm run lint          # ESLint
npm run tauri build   # Production build
```

To build with the bundled bellman CLI sidecar:

```bash
bash packaging/prepare-sidecar.sh
npm run tauri build
bash packaging/bundle-portable.sh
```

## Using the app

1. Start the app (`npm run tauri dev` or the release binary).
2. The example roadmap graph loads automatically.
3. Click **Open roadmap…** (toolbar), use **File → Open Roadmap…**, or press **Ctrl+O** / **Cmd+O** and select a bellman roadmap root directory.
4. Pan, zoom, and click nodes to explore connections (parent/child and precedence edges).

Roadmap data is read from:

- `.fits/registry.json` — node instances and types
- `links/links.jsonc` — directed edges between nodes

Run `bellman init` and `bellman sync` in your roadmap repo before opening it here if the graph artifacts are missing.

## Releases

Rolling **linux-x86_64** portable bundles are published to the [`dev` release](https://github.com/davidtgillard/bellman-gui/releases/tag/dev):

```bash
curl -fsSL -o bellman-gui.tar.gz \
  "https://github.com/davidtgillard/bellman-gui/releases/download/dev/bellman-gui-VERSION-linux-x86_64.tar.gz"
tar xzf bellman-gui.tar.gz
cd bellman-gui-VERSION-linux-x86_64
./bellman-gui
```

The archive contains `bellman-gui` and a bundled `bellman` CLI sidecar.

## License

AGPL-3.0-or-later — same as [bellman](https://github.com/davidtgillard/bellman).
