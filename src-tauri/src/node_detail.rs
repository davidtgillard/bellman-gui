use serde::{Deserialize, Serialize};
use serde_yaml::Value as YamlValue;
use std::fs;
use std::path::{Path, PathBuf};

use crate::graph::load_roadmap_graph;

#[derive(Debug, Serialize, Clone)]
pub struct NodeDetailDto {
    pub node_id: String,
    pub node_type: String,
    pub title: String,
    pub markdown: String,
    pub source_path: Option<String>,
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

fn work_package_markdown(
    root: &Path,
    project: &str,
    package_title: &str,
) -> Result<(String, PathBuf), String> {
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
        .unwrap_or("No description provided.");

    let dependencies = entry
        .as_mapping()
        .and_then(|map| map.get(YamlValue::from("dependencies")))
        .and_then(YamlValue::as_sequence)
        .map(|items| {
            items
                .iter()
                .filter_map(YamlValue::as_str)
                .map(|dep| format!("- {dep}"))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();

    let mut markdown = format!("# {package_title}\n\n{description}");
    if !dependencies.is_empty() {
        markdown.push_str("\n\n## Dependencies\n\n");
        markdown.push_str(&dependencies);
    }

    Ok((markdown, path))
}

fn resolve_node_markdown(
    root: &Path,
    node_id: &str,
    node_type: &str,
) -> Result<(String, PathBuf), String> {
    match node_type {
        "initiative" => {
            let name = strip_type_prefix(node_id, "initiative--")?;
            let path = root.join("initiatives").join(format!("{name}.md"));
            let markdown = read_markdown_file(&path)?;
            Ok((markdown, path))
        }
        "project" => {
            let name = strip_type_prefix(node_id, "project--")?;
            let path = root.join("projects").join(name).join(format!("{name}.md"));
            let markdown = read_markdown_file(&path)?;
            Ok((markdown, path))
        }
        "milestone" => {
            let name = strip_type_prefix(node_id, "milestone--")?;
            let path = root.join("milestones").join(format!("{name}.md"));
            let markdown = read_markdown_file(&path)?;
            Ok((markdown, path))
        }
        "goal" => {
            let name = strip_type_prefix(node_id, "goal--")?;
            let path = root.join("goals").join(format!("{name}.md"));
            let markdown = read_markdown_file(&path)?;
            Ok((markdown, path))
        }
        "work_package" => {
            let (project, package_title) = node_id
                .split_once("--")
                .ok_or_else(|| format!("invalid work package id: {node_id}"))?;
            work_package_markdown(root, project, package_title)
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

    let (markdown, source_path) = resolve_node_markdown(root, node_id, &node.node_type)?;

    Ok(NodeDetailDto {
        node_id: node_id.to_string(),
        node_type: node.node_type.clone(),
        title: node_title(node_id),
        markdown,
        source_path: Some(source_path.to_string_lossy().into_owned()),
    })
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
}
