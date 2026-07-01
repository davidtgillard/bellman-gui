use serde::Serialize;
use std::collections::{BTreeMap, HashMap};
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};

use ::undo::{Edit, Event, Record, Slot};

/// Environment variable that, when set, enables stderr tracing of undo/redo
/// stack operations for developers.
const TRACE_ENV: &str = "BELLMAN_GUI_TRACE_UNDO";

/// Directories whose files (markdown nodes, `work-packages.yaml`) are managed
/// by structural edits and therefore included in snapshots.
const NODE_DIRS: [&str; 5] = [
    "initiatives",
    "projects",
    "milestones",
    "goals",
    "work-packages",
];

/// Fixed files, relative to the roadmap root, that structural edits can touch.
const FIXED_FILES: [&str; 4] = [
    ".fits/registry.json",
    ".fits/work-package-layout.json",
    "links/links.jsonc",
    "links/links.json",
];

/// A snapshot of the managed roadmap files: relative path -> raw file bytes.
pub type Snapshot = BTreeMap<PathBuf, Vec<u8>>;

fn is_trace_enabled() -> bool {
    std::env::var_os(TRACE_ENV).is_some()
}

fn lock_err<T>(_: PoisonError<T>) -> String {
    "undo state lock poisoned".to_string()
}

fn collect_files_recursive(root: &Path, rel_dir: &Path, out: &mut Vec<PathBuf>) {
    let abs = root.join(rel_dir);
    let Ok(entries) = fs::read_dir(&abs) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(rel) = path.strip_prefix(root) else {
            continue;
        };
        let rel = rel.to_path_buf();
        if path.is_dir() {
            collect_files_recursive(root, &rel, out);
        } else if path.is_file() {
            out.push(rel);
        }
    }
}

/// Returns the managed files (relative paths) that currently exist under `root`.
fn collect_managed_files(root: &Path) -> Vec<PathBuf> {
    let mut rels = Vec::new();
    for fixed in FIXED_FILES {
        let rel = PathBuf::from(fixed);
        if root.join(&rel).is_file() {
            rels.push(rel);
        }
    }
    for dir in NODE_DIRS {
        collect_files_recursive(root, Path::new(dir), &mut rels);
    }
    rels
}

/// Captures the current bytes of every managed file under `root`.
pub fn capture(root: &Path) -> Result<Snapshot, String> {
    let mut snapshot = Snapshot::new();
    for rel in collect_managed_files(root) {
        let abs = root.join(&rel);
        let bytes =
            fs::read(&abs).map_err(|error| format!("failed to read {}: {error}", abs.display()))?;
        snapshot.insert(rel, bytes);
    }
    Ok(snapshot)
}

/// Restores the managed files under `root` to match `snapshot`, deleting any
/// managed files that are absent from the snapshot.
pub fn restore(root: &Path, snapshot: &Snapshot) -> Result<(), String> {
    for rel in collect_managed_files(root) {
        if !snapshot.contains_key(&rel) {
            let abs = root.join(&rel);
            fs::remove_file(&abs)
                .map_err(|error| format!("failed to remove {}: {error}", abs.display()))?;
        }
    }
    for (rel, bytes) in snapshot {
        let abs = root.join(rel);
        if let Some(parent) = abs.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("failed to create {}: {error}", parent.display()))?;
        }
        fs::write(&abs, bytes)
            .map_err(|error| format!("failed to write {}: {error}", abs.display()))?;
    }
    Ok(())
}

/// An [`Edit`] that captures a roadmap edit as a before/after snapshot diff.
///
/// The real mutation is performed by the async command handlers; this edit only
/// knows how to move the on-disk state between the two captured snapshots.
pub struct SnapshotEdit {
    label: String,
    before: Snapshot,
    after: Snapshot,
}

impl SnapshotEdit {
    pub fn new(label: String, before: Snapshot, after: Snapshot) -> Self {
        Self {
            label,
            before,
            after,
        }
    }
}

impl fmt::Display for SnapshotEdit {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.label)
    }
}

impl Edit for SnapshotEdit {
    type Target = PathBuf;
    type Output = Result<(), String>;

    fn edit(&mut self, target: &mut PathBuf) -> Result<(), String> {
        restore(target, &self.after)
    }

    fn undo(&mut self, target: &mut PathBuf) -> Result<(), String> {
        restore(target, &self.before)
    }
}

/// A [`Slot`] that logs every stack [`Event`] to stderr when tracing is enabled.
pub struct TraceSlot {
    root: String,
}

impl TraceSlot {
    fn new(root: String) -> Self {
        Self { root }
    }
}

impl Slot for TraceSlot {
    fn on_emit(&mut self, event: Event) {
        if is_trace_enabled() {
            eprintln!("[undo] {} event={event:?}", self.root);
        }
    }
}

type RoadmapRecord = Record<SnapshotEdit, TraceSlot>;

fn new_record(root: &str) -> RoadmapRecord {
    RoadmapRecord::builder()
        .connect(TraceSlot::new(root.to_string()))
        .build()
}

/// Reportable undo/redo availability and the labels of the pending operations.
#[derive(Debug, Serialize)]
pub struct UndoStateDto {
    pub can_undo: bool,
    pub can_redo: bool,
    pub undo_label: Option<String>,
    pub redo_label: Option<String>,
}

/// Per-roadmap-root undo/redo history, held in Tauri managed state.
#[derive(Default)]
pub struct UndoState {
    records: Mutex<HashMap<String, RoadmapRecord>>,
}

impl UndoState {
    /// Clears any existing history for `root` and starts a fresh record.
    ///
    /// Called when a roadmap is (re)loaded so the first edit's `before`
    /// snapshot becomes the baseline.
    pub fn reset(&self, root: &str) -> Result<(), String> {
        let mut records = self.records.lock().map_err(lock_err)?;
        records.insert(root.to_string(), new_record(root));
        Ok(())
    }

    /// Records a completed edit as a before/after snapshot diff.
    pub fn push(
        &self,
        root: &str,
        label: String,
        before: Snapshot,
        after: Snapshot,
    ) -> Result<(), String> {
        let mut records = self.records.lock().map_err(lock_err)?;
        let record = records
            .entry(root.to_string())
            .or_insert_with(|| new_record(root));
        let mut target = PathBuf::from(root);
        let result = record.edit(&mut target, SnapshotEdit::new(label.clone(), before, after));
        if is_trace_enabled() {
            eprintln!(
                "[undo] {root} push label={label:?} can_undo={} can_redo={}",
                record.can_undo(),
                record.can_redo()
            );
        }
        result
    }

    /// Undoes the most recent edit for `root`. Returns whether an edit was undone.
    pub fn undo(&self, root: &str) -> Result<bool, String> {
        let mut records = self.records.lock().map_err(lock_err)?;
        let Some(record) = records.get_mut(root) else {
            return Ok(false);
        };
        let mut target = PathBuf::from(root);
        match record.undo(&mut target) {
            Some(result) => result.map(|()| true),
            None => Ok(false),
        }
    }

    /// Redoes the most recently undone edit for `root`. Returns whether an edit was redone.
    pub fn redo(&self, root: &str) -> Result<bool, String> {
        let mut records = self.records.lock().map_err(lock_err)?;
        let Some(record) = records.get_mut(root) else {
            return Ok(false);
        };
        let mut target = PathBuf::from(root);
        match record.redo(&mut target) {
            Some(result) => result.map(|()| true),
            None => Ok(false),
        }
    }

    /// Returns the current undo/redo availability and pending operation labels.
    pub fn state(&self, root: &str) -> Result<UndoStateDto, String> {
        let records = self.records.lock().map_err(lock_err)?;
        let dto = match records.get(root) {
            Some(record) => UndoStateDto {
                can_undo: record.can_undo(),
                can_redo: record.can_redo(),
                undo_label: record.undo_string(),
                redo_label: record.redo_string(),
            },
            None => UndoStateDto {
                can_undo: false,
                can_redo: false,
                undo_label: None,
                redo_label: None,
            },
        };
        Ok(dto)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(path: &Path, contents: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create parent dir");
        }
        fs::write(path, contents).expect("write file");
    }

    fn seed_roadmap(root: &Path) {
        write(&root.join(".fits/registry.json"), "{\"registry\":0}");
        write(&root.join("links/links.json"), "{\"links\":[]}");
        write(&root.join("goals/reduce-churn.md"), "# original\n");
    }

    #[test]
    fn undo_and_redo_restore_managed_files() {
        let dir = tempfile::tempdir().expect("tempdir");
        let root = dir.path();
        seed_roadmap(root);
        let root_str = root.to_string_lossy().into_owned();

        let state = UndoState::default();
        state.reset(&root_str).expect("reset");

        let before = capture(root).expect("capture before");

        // Simulate an edit: add a new node markdown file and mutate the registry.
        write(&root.join("goals/new-goal.md"), "# new goal\n");
        write(&root.join(".fits/registry.json"), "{\"registry\":1}");
        let after = capture(root).expect("capture after");

        state
            .push(&root_str, "create goal new-goal".to_string(), before, after)
            .expect("push edit");

        let status = state.state(&root_str).expect("state");
        assert!(status.can_undo);
        assert!(!status.can_redo);
        assert_eq!(status.undo_label.as_deref(), Some("create goal new-goal"));

        assert!(state.undo(&root_str).expect("undo"));
        assert!(!root.join("goals/new-goal.md").exists());
        assert_eq!(
            fs::read_to_string(root.join(".fits/registry.json")).expect("read registry"),
            "{\"registry\":0}"
        );
        let status = state.state(&root_str).expect("state after undo");
        assert!(!status.can_undo);
        assert!(status.can_redo);

        assert!(state.redo(&root_str).expect("redo"));
        assert!(root.join("goals/new-goal.md").exists());
        assert_eq!(
            fs::read_to_string(root.join(".fits/registry.json")).expect("read registry"),
            "{\"registry\":1}"
        );
    }

    #[test]
    fn undo_without_history_is_noop() {
        let dir = tempfile::tempdir().expect("tempdir");
        let root_str = dir.path().to_string_lossy().into_owned();
        let state = UndoState::default();
        assert!(!state.undo(&root_str).expect("undo"));
        assert!(!state.redo(&root_str).expect("redo"));
        let status = state.state(&root_str).expect("state");
        assert!(!status.can_undo);
        assert!(!status.can_redo);
    }
}
