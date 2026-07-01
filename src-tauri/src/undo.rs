use base64::engine::general_purpose::STANDARD;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};

use ::undo::{Edit, Event, Record, Slot};

/// Environment variable that, when set, enables stderr tracing of undo/redo
/// stack operations for developers.
const TRACE_ENV: &str = "BELLMAN_GUI_TRACE_UNDO";

const UNDO_HISTORY_FILE: &str = ".fits/undo-history.json";
const UNDO_HISTORY_KIND: &str = "bellman-gui-undo-history";
const UNDO_HISTORY_VERSION: u32 = 1;
const UNDO_STACK_LIMIT: usize = 50;

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

mod snapshot_codec {
    use super::{PathBuf, Snapshot, STANDARD};
    use base64::Engine;
    use serde::{Deserialize, Deserializer, Serialize, Serializer};
    use std::collections::BTreeMap;

    pub fn serialize<S>(snapshot: &Snapshot, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let encoded: BTreeMap<String, String> = snapshot
            .iter()
            .map(|(path, bytes)| {
                (
                    path.to_string_lossy().into_owned(),
                    STANDARD.encode(bytes),
                )
            })
            .collect();
        encoded.serialize(serializer)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Snapshot, D::Error>
    where
        D: Deserializer<'de>,
    {
        let encoded: BTreeMap<String, String> = Deserialize::deserialize(deserializer)?;
        let mut snapshot = Snapshot::new();
        for (path, encoded_bytes) in encoded {
            let bytes = STANDARD
                .decode(encoded_bytes.as_bytes())
                .map_err(serde::de::Error::custom)?;
            snapshot.insert(PathBuf::from(path), bytes);
        }
        Ok(snapshot)
    }
}

#[derive(Serialize, Deserialize)]
struct PersistedUndoHistory {
    version: u32,
    kind: String,
    #[serde(with = "snapshot_codec")]
    cursor_snapshot: Snapshot,
    record: RoadmapRecord,
}

fn is_trace_enabled() -> bool {
    std::env::var_os(TRACE_ENV).is_some()
}

fn lock_err<T>(_: PoisonError<T>) -> String {
    "undo state lock poisoned".to_string()
}

fn is_excluded_managed_file(rel: &Path) -> bool {
    rel == Path::new(UNDO_HISTORY_FILE)
}

fn is_editable_roadmap(root: &Path) -> bool {
    root.join(".fits/registry.json").is_file()
}

fn history_path(root: &Path) -> PathBuf {
    root.join(UNDO_HISTORY_FILE)
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
        if is_excluded_managed_file(&rel) {
            continue;
        }
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
        if is_excluded_managed_file(&rel) {
            continue;
        }
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
#[derive(Clone, Serialize, Deserialize)]
pub struct SnapshotEdit {
    label: String,
    #[serde(with = "snapshot_codec")]
    before: Snapshot,
    #[serde(with = "snapshot_codec")]
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
#[derive(Clone, Serialize, Deserialize)]
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
        .limit(UNDO_STACK_LIMIT)
        .connect(TraceSlot::new(root.to_string()))
        .build()
}

fn persist_record(root: &Path, record: &RoadmapRecord) -> Result<(), String> {
    let path = history_path(root);
    let cursor_snapshot = capture(root)?;
    let persisted = PersistedUndoHistory {
        version: UNDO_HISTORY_VERSION,
        kind: UNDO_HISTORY_KIND.to_string(),
        cursor_snapshot,
        record: record.clone(),
    };

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create {}: {error}", parent.display()))?;
    }

    let tmp_path = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(&persisted)
        .map_err(|error| format!("failed to encode undo history: {error}"))?;
    fs::write(&tmp_path, json).map_err(|error| {
        format!(
            "failed to write {}: {error}",
            tmp_path.display()
        )
    })?;
    fs::rename(&tmp_path, &path).map_err(|error| {
        format!(
            "failed to rename {} to {}: {error}",
            tmp_path.display(),
            path.display()
        )
    })?;
    Ok(())
}

fn load_record(root: &Path) -> Result<Option<RoadmapRecord>, String> {
    let path = history_path(root);
    if !path.is_file() {
        return Ok(None);
    }

    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
    let persisted: PersistedUndoHistory = match serde_json::from_str(&raw) {
        Ok(value) => value,
        Err(error) => {
            eprintln!(
                "[undo] invalid undo history at {}: {error}; starting fresh",
                path.display()
            );
            let _ = fs::remove_file(&path);
            return Ok(None);
        }
    };

    if persisted.kind != UNDO_HISTORY_KIND || persisted.version != UNDO_HISTORY_VERSION {
        eprintln!(
            "[undo] unsupported undo history at {} (kind={:?}, version={}); starting fresh",
            path.display(),
            persisted.kind,
            persisted.version
        );
        let _ = fs::remove_file(&path);
        return Ok(None);
    }

    let current = capture(root)?;
    if current != persisted.cursor_snapshot {
        eprintln!(
            "[undo] on-disk state does not match saved undo cursor at {}; discarding history",
            path.display()
        );
        let _ = fs::remove_file(&path);
        return Ok(None);
    }

    Ok(Some(persisted.record))
}

fn persist_if_editable(root: &Path, record: &RoadmapRecord) {
    if !is_editable_roadmap(root) {
        return;
    }
    if let Err(error) = persist_record(root, record) {
        eprintln!(
            "[undo] failed to persist history for {}: {error}",
            root.display()
        );
    }
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
    /// Loads persisted history for `root` when valid, otherwise starts fresh.
    pub fn load_or_reset(&self, root: &Path) -> Result<(), String> {
        let root_str = root.to_string_lossy().into_owned();
        let mut records = self.records.lock().map_err(lock_err)?;

        if !is_editable_roadmap(root) {
            records.insert(root_str, new_record(root.to_string_lossy().as_ref()));
            return Ok(());
        }

        match load_record(root)? {
            Some(record) => {
                records.insert(root_str, record);
            }
            None => {
                records.insert(root_str, new_record(root.to_string_lossy().as_ref()));
            }
        }
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
        let root_path = PathBuf::from(root);
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
        if result.is_ok() {
            persist_if_editable(&root_path, record);
        }
        result
    }

    /// Undoes the most recent edit for `root`. Returns whether an edit was undone.
    pub fn undo(&self, root: &str) -> Result<bool, String> {
        let root_path = PathBuf::from(root);
        let mut records = self.records.lock().map_err(lock_err)?;
        let Some(record) = records.get_mut(root) else {
            return Ok(false);
        };
        let mut target = PathBuf::from(root);
        let result = match record.undo(&mut target) {
            Some(result) => result.map(|()| true),
            None => Ok(false),
        };
        if result.as_ref().copied().unwrap_or(false) {
            persist_if_editable(&root_path, record);
        }
        result
    }

    /// Redoes the most recently undone edit for `root`. Returns whether an edit was redone.
    pub fn redo(&self, root: &str) -> Result<bool, String> {
        let root_path = PathBuf::from(root);
        let mut records = self.records.lock().map_err(lock_err)?;
        let Some(record) = records.get_mut(root) else {
            return Ok(false);
        };
        let mut target = PathBuf::from(root);
        let result = match record.redo(&mut target) {
            Some(result) => result.map(|()| true),
            None => Ok(false),
        };
        if result.as_ref().copied().unwrap_or(false) {
            persist_if_editable(&root_path, record);
        }
        result
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

    fn push_edit(state: &UndoState, root: &Path, label: &str, mutate: impl FnOnce(&Path)) {
        let root_str = root.to_string_lossy().into_owned();
        let before = capture(root).expect("capture before");
        mutate(root);
        let after = capture(root).expect("capture after");
        state
            .push(&root_str, label.to_string(), before, after)
            .expect("push edit");
    }

    #[test]
    fn undo_and_redo_restore_managed_files() {
        let dir = tempfile::tempdir().expect("tempdir");
        let root = dir.path();
        seed_roadmap(root);
        let root_str = root.to_string_lossy().into_owned();

        let state = UndoState::default();
        state.load_or_reset(root).expect("load");

        let before = capture(root).expect("capture before");

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

    #[test]
    fn persisted_history_survives_reload() {
        let dir = tempfile::tempdir().expect("tempdir");
        let root = dir.path();
        seed_roadmap(root);
        let root_str = root.to_string_lossy().into_owned();

        let state = UndoState::default();
        state.load_or_reset(root).expect("load");
        push_edit(&state, root, "create goal new-goal", |root| {
            write(&root.join("goals/new-goal.md"), "# new goal\n");
            write(&root.join(".fits/registry.json"), "{\"registry\":1}");
        });
        assert!(history_path(root).is_file());

        let reloaded = UndoState::default();
        reloaded.load_or_reset(root).expect("reload");
        let status = reloaded.state(&root_str).expect("state");
        assert!(status.can_undo);
        assert_eq!(status.undo_label.as_deref(), Some("create goal new-goal"));

        assert!(reloaded.undo(&root_str).expect("undo"));
        assert!(!root.join("goals/new-goal.md").exists());
    }

    #[test]
    fn persisted_history_keeps_redo_after_undo() {
        let dir = tempfile::tempdir().expect("tempdir");
        let root = dir.path();
        seed_roadmap(root);
        let root_str = root.to_string_lossy().into_owned();

        let state = UndoState::default();
        state.load_or_reset(root).expect("load");
        push_edit(&state, root, "create goal new-goal", |root| {
            write(&root.join("goals/new-goal.md"), "# new goal\n");
        });
        assert!(state.undo(&root_str).expect("undo"));

        let reloaded = UndoState::default();
        reloaded.load_or_reset(root).expect("reload");
        let status = reloaded.state(&root_str).expect("state");
        assert!(!status.can_undo);
        assert!(status.can_redo);
        assert_eq!(status.redo_label.as_deref(), Some("create goal new-goal"));
    }

    #[test]
    fn stale_history_is_discarded_when_disk_changes() {
        let dir = tempfile::tempdir().expect("tempdir");
        let root = dir.path();
        seed_roadmap(root);
        let root_str = root.to_string_lossy().into_owned();

        let state = UndoState::default();
        state.load_or_reset(root).expect("load");
        push_edit(&state, root, "create goal new-goal", |root| {
            write(&root.join("goals/new-goal.md"), "# new goal\n");
        });
        assert!(history_path(root).is_file());

        write(&root.join("goals/reduce-churn.md"), "# changed externally\n");

        let reloaded = UndoState::default();
        reloaded.load_or_reset(root).expect("reload");
        let status = reloaded.state(&root_str).expect("state");
        assert!(!status.can_undo);
        assert!(!status.can_redo);
        assert!(!history_path(root).exists());
    }

    #[test]
    fn history_file_is_excluded_from_snapshots() {
        let dir = tempfile::tempdir().expect("tempdir");
        let root = dir.path();
        seed_roadmap(root);

        let state = UndoState::default();
        state.load_or_reset(root).expect("load");
        push_edit(&state, root, "create goal new-goal", |root| {
            write(&root.join("goals/new-goal.md"), "# new goal\n");
        });

        let snapshot = capture(root).expect("capture");
        assert!(!snapshot.contains_key(&PathBuf::from(UNDO_HISTORY_FILE)));
        assert!(history_path(root).is_file());
    }

    #[test]
    fn stack_limit_is_enforced() {
        let dir = tempfile::tempdir().expect("tempdir");
        let root = dir.path();
        seed_roadmap(root);

        let state = UndoState::default();
        state.load_or_reset(root).expect("load");

        for index in 0..=UNDO_STACK_LIMIT {
            let label = format!("edit {index}");
            push_edit(&state, root, &label, |root| {
                let content = format!("# goal {index}\n");
                write(
                    &root.join(format!("goals/goal-{index}.md")),
                    &content,
                );
            });
        }

        let reloaded = UndoState::default();
        reloaded.load_or_reset(root).expect("reload");
        let raw = fs::read_to_string(history_path(root)).expect("read history");
        let persisted: PersistedUndoHistory = serde_json::from_str(&raw).expect("parse history");
        assert_eq!(persisted.record.len(), UNDO_STACK_LIMIT);
    }
}
