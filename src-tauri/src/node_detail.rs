use serde::{Deserialize, Serialize};
use serde_yaml::Value as YamlValue;
use std::fs;
use std::path::{Path, PathBuf};

use crate::graph::load_roadmap_graph;

#[derive(Debug, Serialize, Clone)]
pub struct WorkPackageDetailDto {
    pub project: String,
    pub title: String,
    pub description: String,
    pub dependencies: Vec<String>,
    pub available_titles: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct NodeDetailDto {
    pub node_id: String,
    pub node_type: String,
    pub title: String,
    pub markdown: String,
    pub source_path: Option<String>,
    pub work_package: Option<WorkPackageDetailDto>,
}

#[derive(Debug, Deserialize)]
pub struct LoadNodeDetailRequest {
    pub roadmap_root: String,
    pub node_id: String,
}

fn strip_type_prefix<'a>(node_id: &'a str, prefix: &str) -> Result<&'a str, String> {
    node_id
        .strip_prefix(prefix)
        .ok_or_else(|| format!("node id {node_id:?} does not match expected prefix {prefix:?}"))
}

fn node_title(node_id: &str) -> String {
    node_id
        .split("--")
        .last()
        .unwrap_or(node_id)
        .to_string()
}

fn read_markdown_file(path: &Path) -> Result<String, String> {
    fs::read_to_string(path)
        .map_err(|error| format!("failed to read {}: {error}", path.display()))
}

/// Resolves the on-disk `.md` path for a node type that is backed by a markdown
/// file (everything except work packages, which live in `work-packages.yaml`).
fn md_path_for(root: &Path, node_id: &str, node_type: &str) -> Result<PathBuf, String> {
    let (dir, prefix) = match node_type {
        "initiative" => ("initiatives", "initiative--"),
        "milestone" => ("milestones", "milestone--"),
        "goal" => ("goals", "goal--"),
        "project" => ("projects", "project--"),
        other => {
            return Err(format!(
                "node type {other:?} is not backed by a markdown file"
            ))
        }
    };

    let name = match strip_type_prefix(node_id, prefix) {
        Ok(name) => name.to_string(),
        Err(_) => node_id.to_string(),
    };

    let path = if node_type == "project" {
        root.join(dir).join(&name).join(format!("{name}.md"))
    } else {
        root.join(dir).join(format!("{name}.md"))
    };

    Ok(path)
}

struct WorkPackageParsed {
    markdown: String,
    path: PathBuf,
    detail: WorkPackageDetailDto,
}

fn work_package_detail(
    root: &Path,
    project: &str,
    package_title: &str,
) -> Result<WorkPackageParsed, String> {
    let path = root
        .join("projects")
        .join(project)
        .join("work-packages.yaml");
    if !path.is_file() {
        return Err(format!(
            "work package source missing: {}",
            path.display()
        ));
    }

    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
    let document: YamlValue = serde_yaml::from_str(&raw)
        .map_err(|error| format!("invalid YAML in {}: {error}", path.display()))?;

    let work_packages = document
        .as_mapping()
        .and_then(|map| map.get(YamlValue::from("work_packages")))
        .and_then(YamlValue::as_sequence)
        .ok_or_else(|| {
            format!(
                "work-packages file missing work_packages list in {}",
                path.display()
            )
        })?;

    let available_titles: Vec<String> = work_packages
        .iter()
        .filter_map(|item| {
            item.as_mapping()
                .and_then(|map| map.get(YamlValue::from("title")))
                .and_then(YamlValue::as_str)
                .map(str::to_string)
        })
        .collect();

    let entry = work_packages.iter().find(|item| {
        item.as_mapping()
            .and_then(|map| map.get(YamlValue::from("title")))
            .and_then(YamlValue::as_str)
            .is_some_and(|title| title == package_title)
    });

    let Some(entry) = entry else {
        return Err(format!(
            "work package {package_title:?} not found in {}",
            path.display()
        ));
    };

    let description = entry
        .as_mapping()
        .and_then(|map| map.get(YamlValue::from("description")))
        .and_then(YamlValue::as_str)
        .unwrap_or("No description provided.")
        .to_string();

    let dependencies: Vec<String> = entry
        .as_mapping()
        .and_then(|map| map.get(YamlValue::from("dependencies")))
        .and_then(YamlValue::as_sequence)
        .map(|items| {
            items
                .iter()
                .filter_map(YamlValue::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();

    let mut markdown = format!("# {package_title}\n\n{description}");
    if !dependencies.is_empty() {
        markdown.push_str("\n\n## Dependencies\n\n");
        let rendered = dependencies
            .iter()
            .map(|dep| format!("- {dep}"))
            .collect::<Vec<_>>()
            .join("\n");
        markdown.push_str(&rendered);
    }

    Ok(WorkPackageParsed {
        markdown,
        path,
        detail: WorkPackageDetailDto {
            project: project.to_string(),
            title: package_title.to_string(),
            description,
            dependencies,
            available_titles,
        },
    })
}

fn resolve_node_markdown(
    root: &Path,
    node_id: &str,
    node_type: &str,
) -> Result<(String, PathBuf, Option<WorkPackageDetailDto>), String> {
    match node_type {
        "initiative" | "project" | "milestone" | "goal" => {
            let path = md_path_for(root, node_id, node_type)?;
            let markdown = read_markdown_file(&path)?;
            Ok((markdown, path, None))
        }
        "work_package" => {
            let (project, package_title) = node_id
                .split_once("--")
                .ok_or_else(|| format!("invalid work package id: {node_id}"))?;
            let parsed = work_package_detail(root, project, package_title)?;
            Ok((parsed.markdown, parsed.path, Some(parsed.detail)))
        }
        other => Err(format!("unsupported node type: {other}")),
    }
}

pub fn load_node_detail(root: &Path, node_id: &str) -> Result<NodeDetailDto, String> {
    let graph = load_roadmap_graph(root)?;
    let node = graph
        .nodes
        .iter()
        .find(|node| node.id == node_id)
        .ok_or_else(|| format!("node not found: {node_id}"))?;

    let (markdown, source_path, work_package) =
        resolve_node_markdown(root, node_id, &node.node_type)?;

    Ok(NodeDetailDto {
        node_id: node_id.to_string(),
        node_type: node.node_type.clone(),
        title: node_title(node_id),
        markdown,
        source_path: Some(source_path.to_string_lossy().into_owned()),
        work_package,
    })
}

/// Writes new markdown body content for a markdown-backed node and returns the
/// refreshed detail. Work packages are rejected because their content lives in
/// `work-packages.yaml` and must be edited via the work-package command.
pub fn save_node_markdown(
    root: &Path,
    node_id: &str,
    markdown: &str,
) -> Result<NodeDetailDto, String> {
    let graph = load_roadmap_graph(root)?;
    let node = graph
        .nodes
        .iter()
        .find(|node| node.id == node_id)
        .ok_or_else(|| format!("node not found: {node_id}"))?;

    if node.node_type == "work_package" {
        return Err(
            "work packages are edited through their structured fields, not markdown".to_string(),
        );
    }

    let path = md_path_for(root, node_id, &node.node_type)?;
    fs::write(&path, markdown)
        .map_err(|error| format!("failed to write {}: {error}", path.display()))?;

    load_node_detail(root, node_id)
}

#[tauri::command]
pub fn load_node_detail_command(request: LoadNodeDetailRequest) -> Result<NodeDetailDto, String> {
    load_node_detail(PathBuf::from(&request.roadmap_root).as_path(), &request.node_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn write_registry(root: &Path) {
        let fits = root.join(".fits");
        fs::create_dir_all(&fits).unwrap();
        fs::write(
            fits.join("registry.json"),
            r#"{
  "link_types": [],
  "instances": [
    {"id":"initiative--alpha","type":"initiative","kind":"node"},
    {"id":"project--billing","type":"project","kind":"node"},
    {"id":"billing--wp-one","type":"work_package","kind":"node"}
  ]
}"#,
        )
        .unwrap();
        fs::create_dir_all(root.join("links")).unwrap();
        fs::write(root.join("links/links.json"), r#"{"links":[]}"#).unwrap();
    }

    #[test]
    fn loads_initiative_markdown() {
        let temp = TempDir::new().unwrap();
        let root = temp.path();
        write_registry(root);
        fs::create_dir_all(root.join("initiatives")).unwrap();
        fs::write(
            root.join("initiatives/alpha.md"),
            "# Alpha\n\nInitiative body.",
        )
        .unwrap();

        let detail = load_node_detail(root, "initiative--alpha").unwrap();
        assert!(detail.markdown.contains("Initiative body."));
        assert_eq!(detail.title, "alpha");
    }

    #[test]
    fn loads_work_package_from_yaml() {
        let temp = TempDir::new().unwrap();
        let root = temp.path();
        write_registry(root);
        fs::create_dir_all(root.join("projects/billing")).unwrap();
        fs::write(
            root.join("projects/billing/work-packages.yaml"),
            "version: 1\n\nwork_packages:\n  - title: wp-one\n    description: Do the thing.\n    dependencies:\n      - wp-zero\n",
        )
        .unwrap();

        let detail = load_node_detail(root, "billing--wp-one").unwrap();
        assert!(detail.markdown.contains("Do the thing."));
        assert!(detail.markdown.contains("wp-zero"));
    }

    #[test]
    fn work_package_detail_includes_structured_fields() {
        let temp = TempDir::new().unwrap();
        let root = temp.path();
        write_registry(root);
        fs::create_dir_all(root.join("projects/billing")).unwrap();
        fs::write(
            root.join("projects/billing/work-packages.yaml"),
            "version: 1\n\nwork_packages:\n  - title: wp-one\n    description: Do the thing.\n    dependencies:\n      - wp-zero\n",
        )
        .unwrap();

        let detail = load_node_detail(root, "billing--wp-one").unwrap();
        let wp = detail.work_package.expect("work package detail");
        assert_eq!(wp.project, "billing");
        assert_eq!(wp.title, "wp-one");
        assert_eq!(wp.description, "Do the thing.");
        assert_eq!(wp.dependencies, vec!["wp-zero".to_string()]);
        assert!(wp.available_titles.contains(&"wp-one".to_string()));
    }

    #[test]
    fn saves_markdown_for_initiative() {
        let temp = TempDir::new().unwrap();
        let root = temp.path();
        write_registry(root);
        fs::create_dir_all(root.join("initiatives")).unwrap();
        fs::write(root.join("initiatives/alpha.md"), "# Alpha\n\nOld body.").unwrap();

        let detail =
            save_node_markdown(root, "initiative--alpha", "# Alpha\n\nNew body.").unwrap();
        assert!(detail.markdown.contains("New body."));

        let on_disk = fs::read_to_string(root.join("initiatives/alpha.md")).unwrap();
        assert!(on_disk.contains("New body."));
        assert!(!on_disk.contains("Old body."));
    }

    #[test]
    fn rejects_saving_markdown_for_work_package() {
        let temp = TempDir::new().unwrap();
        let root = temp.path();
        write_registry(root);

        let result = save_node_markdown(root, "billing--wp-one", "# wp-one\n\nx");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("work packages"));
    }
}
