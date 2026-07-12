use crate::graph::{build_registry_index, load_registry_document, IndexedInstance};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

const HISTORY_FILE: &str = ".fits/node-editor-history.json";
const HISTORY_KIND: &str = "bellman-gui-node-editor-history";
const HISTORY_VERSION: u32 = 1;

/// Relative path of the node-editor history file (for undo snapshot exclusion).
pub fn history_file_rel() -> &'static Path {
    Path::new(HISTORY_FILE)
}

fn history_path(root: &Path) -> PathBuf {
    root.join(HISTORY_FILE)
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct PersistedNodeEditorHistory {
    version: u32,
    kind: String,
    #[serde(default)]
    nodes: BTreeMap<String, NodeEditorHistoryEntry>,
}

/// One node's persisted CodeMirror editor state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeEditorHistoryEntry {
    /// Document text at the time of the last save (for stale detection).
    pub doc: String,
    /// Full `EditorState.toJSON({ history })` payload.
    pub state: JsonValue,
}

fn empty_persisted() -> PersistedNodeEditorHistory {
    PersistedNodeEditorHistory {
        version: HISTORY_VERSION,
        kind: HISTORY_KIND.to_string(),
        nodes: BTreeMap::new(),
    }
}

fn read_persisted(root: &Path) -> Result<PersistedNodeEditorHistory, String> {
    let path = history_path(root);
    if !path.is_file() {
        return Ok(empty_persisted());
    }
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
    let persisted: PersistedNodeEditorHistory = serde_json::from_str(&raw)
        .map_err(|error| format!("invalid node editor history JSON: {error}"))?;
    if persisted.kind != HISTORY_KIND || persisted.version != HISTORY_VERSION {
        eprintln!(
            "[node-editor-history] discarding incompatible history at {} (kind={}, version={})",
            path.display(),
            persisted.kind,
            persisted.version
        );
        return Ok(empty_persisted());
    }
    Ok(persisted)
}

fn write_persisted(root: &Path, persisted: &PersistedNodeEditorHistory) -> Result<(), String> {
    let path = history_path(root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!("failed to create {}: {error}", parent.display())
        })?;
    }
    let json = serde_json::to_string_pretty(persisted)
        .map_err(|error| format!("failed to serialize node editor history: {error}"))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, format!("{json}\n"))
        .map_err(|error| format!("failed to write {}: {error}", tmp.display()))?;
    fs::rename(&tmp, &path).map_err(|error| {
        format!(
            "failed to rename {} to {}: {error}",
            tmp.display(),
            path.display()
        )
    })
}

fn resolve_guid(root: &Path, node_id: &str) -> Result<String, String> {
    let registry = load_registry_document(root)?;
    let index = build_registry_index(&registry);
    find_node_instance(&index.instances, node_id)
        .map(|inst| inst.guid.clone())
        .ok_or_else(|| format!("unknown node {node_id:?}"))
}

fn find_node_instance<'a>(
    instances: &'a [IndexedInstance],
    node_id: &str,
) -> Option<&'a IndexedInstance> {
    instances.iter().find(|instance| {
        instance.kind == "node"
            && instance.type_name != "kind"
            && (instance.logical_id == node_id || instance.guid == node_id)
    })
}

/// Loads persisted editor history for `node_id` when the stored doc matches `expected_doc`.
pub fn load_node_editor_history(
    root: &Path,
    node_id: &str,
    expected_doc: &str,
) -> Result<Option<NodeEditorHistoryEntry>, String> {
    let guid = resolve_guid(root, node_id)?;
    let mut persisted = read_persisted(root)?;
    let Some(entry) = persisted.nodes.get(&guid).cloned() else {
        return Ok(None);
    };
    if entry.doc != expected_doc {
        persisted.nodes.remove(&guid);
        let _ = write_persisted(root, &persisted);
        return Ok(None);
    }
    Ok(Some(entry))
}

/// Saves editor history for `node_id` under its registry GUID.
pub fn save_node_editor_history(
    root: &Path,
    node_id: &str,
    entry: NodeEditorHistoryEntry,
) -> Result<(), String> {
    let guid = resolve_guid(root, node_id)?;
    let mut persisted = read_persisted(root)?;
    persisted.version = HISTORY_VERSION;
    persisted.kind = HISTORY_KIND.to_string();
    persisted.nodes.insert(guid, entry);
    write_persisted(root, &persisted)
}

/// Removes editor history by registry GUID (used when the node is already deleted).
pub fn remove_node_editor_history_by_guid(root: &Path, guid: &str) -> Result<(), String> {
    let mut persisted = read_persisted(root)?;
    if persisted.nodes.remove(guid).is_some() {
        write_persisted(root, &persisted)?;
    }
    Ok(())
}

/// Resolves the registry GUID for a live node id (logical path or guid).
pub fn guid_for_node(root: &Path, node_id: &str) -> Result<String, String> {
    resolve_guid(root, node_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn seed_registry(root: &Path, guid: &str, logical_name: &str) {
        let fits = root.join(".fits");
        fs::create_dir_all(&fits).expect("fits dir");
        let registry = format!(
            r#"{{
  "description": "test",
  "version": 1,
  "kind": "fits-registry",
  "node_types": [],
  "link_types": [],
  "instances": [
    {{"guid":"kind-goal","name":"goal","type":"kind","kind":"node","scope":"root"}},
    {{"guid":"{guid}","name":"{logical_name}","type":"goal","kind":"node","scope":"nested","parent_guid":"kind-goal"}}
  ]
}}"#
        );
        fs::write(fits.join("registry.json"), registry).expect("write registry");
    }

    #[test]
    fn save_and_load_round_trip_by_logical_id() {
        let dir = tempfile::tempdir().expect("tempdir");
        let root = dir.path();
        let guid = "550e8400-e29b-41d4-a716-446655440000";
        seed_registry(root, guid, "reduce-churn");

        let entry = NodeEditorHistoryEntry {
            doc: "# Reduce churn\n".to_string(),
            state: json!({"doc": "# Reduce churn\n", "history": {"done": [], "undone": []}}),
        };
        save_node_editor_history(root, "goal/reduce-churn", entry.clone()).expect("save");

        let loaded = load_node_editor_history(root, "goal/reduce-churn", "# Reduce churn\n")
            .expect("load")
            .expect("entry");
        assert_eq!(loaded.doc, entry.doc);
        assert_eq!(loaded.state, entry.state);

        let raw = fs::read_to_string(history_path(root)).expect("read file");
        assert!(raw.contains(guid));
        assert!(!raw.contains("goal/reduce-churn"));
    }

    #[test]
    fn rename_keeps_guid_entry() {
        let dir = tempfile::tempdir().expect("tempdir");
        let root = dir.path();
        let guid = "550e8400-e29b-41d4-a716-446655440000";
        seed_registry(root, guid, "reduce-churn");

        save_node_editor_history(
            root,
            "goal/reduce-churn",
            NodeEditorHistoryEntry {
                doc: "# old\n".to_string(),
                state: json!({"doc": "# old\n"}),
            },
        )
        .expect("save");

        // Simulate rename: same GUID, new logical name.
        seed_registry(root, guid, "cut-churn");

        let loaded = load_node_editor_history(root, "goal/cut-churn", "# old\n")
            .expect("load")
            .expect("entry");
        assert_eq!(loaded.doc, "# old\n");
    }

    #[test]
    fn stale_doc_discards_entry() {
        let dir = tempfile::tempdir().expect("tempdir");
        let root = dir.path();
        let guid = "550e8400-e29b-41d4-a716-446655440000";
        seed_registry(root, guid, "reduce-churn");

        save_node_editor_history(
            root,
            "goal/reduce-churn",
            NodeEditorHistoryEntry {
                doc: "# old\n".to_string(),
                state: json!({"doc": "# old\n"}),
            },
        )
        .expect("save");

        let loaded = load_node_editor_history(root, "goal/reduce-churn", "# new\n").expect("load");
        assert!(loaded.is_none());

        let persisted = read_persisted(root).expect("read");
        assert!(!persisted.nodes.contains_key(guid));
    }

    #[test]
    fn remove_by_guid_cleans_up() {
        let dir = tempfile::tempdir().expect("tempdir");
        let root = dir.path();
        let guid = "550e8400-e29b-41d4-a716-446655440000";
        seed_registry(root, guid, "reduce-churn");

        save_node_editor_history(
            root,
            "goal/reduce-churn",
            NodeEditorHistoryEntry {
                doc: "# doc\n".to_string(),
                state: json!({"doc": "# doc\n"}),
            },
        )
        .expect("save");

        remove_node_editor_history_by_guid(root, guid).expect("remove");
        let persisted = read_persisted(root).expect("read");
        assert!(persisted.nodes.is_empty());
    }
}
