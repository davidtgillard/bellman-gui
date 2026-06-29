use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

const LAYOUT_FILE_NAME: &str = "work-package-layout.json";
const LAYOUT_KIND: &str = "bellman-gui-work-package-layout";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NodePositionDto {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkPackageLayoutDto {
    pub version: u32,
    pub kind: String,
    #[serde(default)]
    pub projects: BTreeMap<String, BTreeMap<String, NodePositionDto>>,
}

impl Default for WorkPackageLayoutDto {
    fn default() -> Self {
        Self {
            version: 1,
            kind: LAYOUT_KIND.to_string(),
            projects: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct SaveWorkPackageNodePositionRequest {
    pub roadmap_root: String,
    pub project_id: String,
    pub node_id: String,
    pub x: f64,
    pub y: f64,
}

fn project_layout_key(project_id: &str) -> String {
    const PREFIX: &str = "project--";
    if let Some(name) = project_id.strip_prefix(PREFIX) {
        return name.to_string();
    }
    project_id.to_string()
}

fn layout_path(root: &Path) -> PathBuf {
    root.join(".fits").join(LAYOUT_FILE_NAME)
}

pub fn load_work_package_layout(root: &Path) -> Result<WorkPackageLayoutDto, String> {
    let path = layout_path(root);
    if !path.is_file() {
        return Ok(WorkPackageLayoutDto::default());
    }

    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
    let layout: WorkPackageLayoutDto = serde_json::from_str(&raw)
        .map_err(|error| format!("invalid work package layout JSON: {error}"))?;

    if layout.kind != LAYOUT_KIND {
        return Err(format!(
            "invalid work package layout: expected kind {LAYOUT_KIND}, got {}",
            layout.kind
        ));
    }

    Ok(layout)
}

pub fn save_work_package_node_position(
    root: &Path,
    project_id: &str,
    node_id: &str,
    x: f64,
    y: f64,
) -> Result<WorkPackageLayoutDto, String> {
    let path = layout_path(root);
    let mut layout = load_work_package_layout(root)?;
    let project_key = project_layout_key(project_id);

    if project_key != project_id {
        if let Some(positions) = layout.projects.remove(project_id) {
            let bucket = layout.projects.entry(project_key.clone()).or_default();
            for (node_id, position) in positions {
                bucket.insert(node_id, position);
            }
        }
    }

    layout
        .projects
        .entry(project_key)
        .or_default()
        .insert(
            node_id.to_string(),
            NodePositionDto { x, y },
        );

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "failed to create layout directory {}: {error}",
                parent.display()
            )
        })?;
    }

    let formatted = serde_json::to_string_pretty(&layout)
        .map_err(|error| format!("failed to serialize work package layout: {error}"))?;
    fs::write(&path, format!("{formatted}\n"))
        .map_err(|error| format!("failed to write {}: {error}", path.display()))?;

    Ok(layout)
}

pub fn remove_work_package_node_position(
    root: &Path,
    project_id: &str,
    node_id: &str,
) -> Result<WorkPackageLayoutDto, String> {
    let path = layout_path(root);
    let mut layout = load_work_package_layout(root)?;
    let project_key = project_layout_key(project_id);

    let bucket_key = if layout.projects.contains_key(&project_key) {
        project_key
    } else if layout.projects.contains_key(project_id) {
        project_id.to_string()
    } else {
        project_key
    };

    if let Some(project) = layout.projects.get_mut(&bucket_key) {
        project.remove(node_id);
        if project.is_empty() {
            layout.projects.remove(&bucket_key);
        }
    }

    if layout.projects.is_empty() && !path.is_file() {
        return Ok(layout);
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "failed to create layout directory {}: {error}",
                parent.display()
            )
        })?;
    }

    if layout.projects.is_empty() {
        if path.is_file() {
            fs::remove_file(&path)
                .map_err(|error| format!("failed to remove {}: {error}", path.display()))?;
        }
        return Ok(layout);
    }

    let formatted = serde_json::to_string_pretty(&layout)
        .map_err(|error| format!("failed to serialize work package layout: {error}"))?;
    fs::write(&path, format!("{formatted}\n"))
        .map_err(|error| format!("failed to write {}: {error}", path.display()))?;

    Ok(layout)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn returns_default_when_layout_file_missing() {
        let dir = tempdir().expect("tempdir");
        let layout = load_work_package_layout(dir.path()).expect("load");
        assert_eq!(layout, WorkPackageLayoutDto::default());
    }

    #[test]
    fn saves_and_loads_node_position() {
        let dir = tempdir().expect("tempdir");
        fs::create_dir_all(dir.path().join(".fits")).expect("fits dir");

        let saved = save_work_package_node_position(
            dir.path(),
            "project--billing-redesign",
            "billing-redesign--wp-invoicing",
            12.5,
            -8.0,
        )
        .expect("save");

        assert_eq!(
            saved.projects["billing-redesign"]["billing-redesign--wp-invoicing"],
            NodePositionDto { x: 12.5, y: -8.0 }
        );

        let loaded = load_work_package_layout(dir.path()).expect("load");
        assert_eq!(loaded, saved);
    }

    #[test]
    fn migrates_legacy_project_bucket_on_save() {
        let dir = tempdir().expect("tempdir");
        fs::create_dir_all(dir.path().join(".fits")).expect("fits dir");

        let legacy = WorkPackageLayoutDto {
            version: 1,
            kind: LAYOUT_KIND.to_string(),
            projects: BTreeMap::from([(
                "project--billing-redesign".to_string(),
                BTreeMap::from([(
                    "billing-redesign--wp-invoicing".to_string(),
                    NodePositionDto { x: 1.0, y: 2.0 },
                )]),
            )]),
        };
        let path = layout_path(dir.path());
        fs::write(
            &path,
            format!(
                "{}\n",
                serde_json::to_string_pretty(&legacy).expect("serialize")
            ),
        )
        .expect("write");

        let saved = save_work_package_node_position(
            dir.path(),
            "project--billing-redesign",
            "billing-redesign--wp-pdf-export",
            3.0,
            4.0,
        )
        .expect("save");

        assert!(saved.projects.get("project--billing-redesign").is_none());
        assert_eq!(
            saved.projects["billing-redesign"]["billing-redesign--wp-invoicing"],
            NodePositionDto { x: 1.0, y: 2.0 }
        );
        assert_eq!(
            saved.projects["billing-redesign"]["billing-redesign--wp-pdf-export"],
            NodePositionDto { x: 3.0, y: 4.0 }
        );
    }

    #[test]
    fn removes_node_position_and_deletes_empty_file() {
        let dir = tempdir().expect("tempdir");
        fs::create_dir_all(dir.path().join(".fits")).expect("fits dir");

        save_work_package_node_position(
            dir.path(),
            "project--billing-redesign",
            "billing-redesign--wp-invoicing",
            1.0,
            2.0,
        )
        .expect("save");

        let layout = remove_work_package_node_position(
            dir.path(),
            "billing-redesign",
            "billing-redesign--wp-invoicing",
        )
        .expect("remove");

        assert!(layout.projects.is_empty());
        assert!(!layout_path(dir.path()).is_file());
    }
}
