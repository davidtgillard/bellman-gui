use serde::Deserialize;
use serde_json::{json, Value as JsonValue};
use serde_yaml::{Mapping, Value as YamlValue};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

use crate::bellman_cmd::run_bellman;

const LINKS_TEMPLATE: &str = r#"{
  "description": "Directed links between issued object ids. Edit by hand or via fits CLI; validate with fits validate.",
  "version": 1,
  "kind": "fits-links-v1",
  "links": []
}"#;

const WORK_PACKAGES_HEADER: &str = "version: 1\n\nwork_packages:\n";

#[derive(Debug, Deserialize)]
struct RegistryLinkType {
    link_type: String,
    in_type: String,
    out_type: String,
}

#[derive(Debug, Deserialize)]
struct RegistryDocument {
    link_types: Vec<RegistryLinkType>,
    instances: Vec<RegistryInstance>,
}

#[derive(Debug, Deserialize)]
struct RegistryInstance {
    id: String,
    #[serde(rename = "type")]
    type_name: String,
    kind: String,
}

fn registry_path(root: &Path) -> PathBuf {
    root.join(".fits/registry.json")
}

pub fn links_path(root: &Path) -> Option<PathBuf> {
    let jsonc = root.join("links/links.jsonc");
    if jsonc.is_file() {
        return Some(jsonc);
    }
    let json = root.join("links/links.json");
    if json.is_file() {
        return Some(json);
    }
    None
}

fn read_registry(root: &Path) -> Result<RegistryDocument, String> {
    let path = registry_path(root);
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
    serde_json::from_str(&raw).map_err(|error| format!("invalid registry JSON: {error}"))
}

fn node_matches_endpoint(node_type: &str, endpoint_type: &str) -> bool {
    node_type == endpoint_type
        || (endpoint_type == "work_scope" && (node_type == "initiative" || node_type == "project"))
}

fn find_node<'a>(registry: &'a RegistryDocument, node_id: &str) -> Result<&'a RegistryInstance, String> {
    registry
        .instances
        .iter()
        .find(|instance| instance.kind == "node" && instance.id == node_id)
        .ok_or_else(|| format!("unknown node {node_id:?}"))
}

fn validate_link_type(
    registry: &RegistryDocument,
    link_type: &str,
    source_type: &str,
    target_type: &str,
) -> Result<(), String> {
    let Some(record) = registry
        .link_types
        .iter()
        .find(|item| item.link_type == link_type)
    else {
        return Err(format!("unknown link type {link_type:?}"));
    };

    if !node_matches_endpoint(source_type, &record.in_type) {
        return Err(format!(
            "link type {link_type} expects source type {}, not {source_type}",
            record.in_type
        ));
    }

    if !node_matches_endpoint(target_type, &record.out_type) {
        return Err(format!(
            "link type {link_type} expects target type {}, not {target_type}",
            record.out_type
        ));
    }

    Ok(())
}

fn link_id(link_type: &str, source: &str, target: &str) -> String {
    format!("{link_type}--{source}--{target}")
}

pub fn append_link(
    root: &Path,
    link_type: &str,
    source: &str,
    target: &str,
) -> Result<(), String> {
    let registry = read_registry(root)?;
    let source_node = find_node(&registry, source)?;
    let target_node = find_node(&registry, target)?;
    validate_link_type(
        &registry,
        link_type,
        &source_node.type_name,
        &target_node.type_name,
    )?;

    let links_file = links_path(root).ok_or_else(|| {
        format!(
            "not a bellman roadmap: missing links/links.jsonc or links/links.json under {}",
            root.display()
        )
    })?;

    let id = link_id(link_type, source, target);
    let raw = if links_file.is_file() {
        fs::read_to_string(&links_file)
            .map_err(|error| format!("failed to read {}: {error}", links_file.display()))?
    } else {
        LINKS_TEMPLATE.to_string()
    };

    let mut document: JsonValue = serde_json::from_str(&raw)
        .map_err(|error| format!("invalid links JSON in {}: {error}", links_file.display()))?;
    let links = document
        .get_mut("links")
        .and_then(JsonValue::as_array_mut)
        .ok_or_else(|| format!("links file missing links array in {}", links_file.display()))?;

    if links.iter().any(|link| link.get("id").and_then(JsonValue::as_str) == Some(id.as_str())) {
        return Err(format!("link already exists: {id}"));
    }

    links.push(json!({
        "id": id,
        "link_type": link_type,
        "in": source,
        "out": target,
        "labels": null
    }));

    let formatted = serde_json::to_string_pretty(&document)
        .map_err(|error| format!("failed to serialize links: {error}"))?;
    fs::write(&links_file, format!("{formatted}\n"))
        .map_err(|error| format!("failed to write {}: {error}", links_file.display()))?;

    Ok(())
}

pub fn remove_link_record(root: &Path, link_id: &str) -> Result<(), String> {
    let links_file = links_path(root).ok_or_else(|| {
        format!(
            "not a bellman roadmap: missing links/links.jsonc or links/links.json under {}",
            root.display()
        )
    })?;

    let raw = fs::read_to_string(&links_file)
        .map_err(|error| format!("failed to read {}: {error}", links_file.display()))?;
    let mut document: JsonValue = serde_json::from_str(&raw)
        .map_err(|error| format!("invalid links JSON in {}: {error}", links_file.display()))?;
    let links = document
        .get_mut("links")
        .and_then(JsonValue::as_array_mut)
        .ok_or_else(|| format!("links file missing links array in {}", links_file.display()))?;

    let before = links.len();
    links.retain(|link| link.get("id").and_then(JsonValue::as_str) != Some(link_id));
    if links.len() == before {
        return Err(format!("link not found: {link_id}"));
    }

    let formatted = serde_json::to_string_pretty(&document)
        .map_err(|error| format!("failed to serialize links: {error}"))?;
    fs::write(&links_file, format!("{formatted}\n"))
        .map_err(|error| format!("failed to write {}: {error}", links_file.display()))?;

    Ok(())
}

fn work_packages_path(root: &Path, project: &str) -> PathBuf {
    root.join("projects").join(project).join("work-packages.yaml")
}

pub fn append_work_package(
    root: &Path,
    project: &str,
    title: &str,
    description: &str,
) -> Result<(), String> {
    let registry = read_registry(root)?;
    let project_id = format!("project--{project}");
    find_node(&registry, &project_id)?;

    let path = work_packages_path(root, project);
    if !path.is_file() {
        return Err(format!(
            "project {project:?} has no work-packages.yaml at {}",
            path.display()
        ));
    }

    let mut document: YamlValue = if path.metadata().map(|meta| meta.len()).unwrap_or(0) == 0 {
        serde_yaml::from_str(WORK_PACKAGES_HEADER).map_err(|error| {
            format!("failed to parse work-packages template: {error}")
        })?
    } else {
        let raw = fs::read_to_string(&path)
            .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
        serde_yaml::from_str(&raw)
            .map_err(|error| format!("invalid YAML in {}: {error}", path.display()))?
    };

    let work_packages = document
        .as_mapping_mut()
        .and_then(|map| map.get_mut(YamlValue::from("work_packages")))
        .and_then(YamlValue::as_sequence_mut)
        .ok_or_else(|| format!("work-packages file missing work_packages list in {}", path.display()))?;

    if work_packages.iter().any(|entry| {
        entry
            .as_mapping()
            .and_then(|map| map.get(YamlValue::from("title")))
            .and_then(YamlValue::as_str)
            .is_some_and(|existing| existing == title)
    }) {
        return Err(format!("work package {title:?} already exists in project {project:?}"));
    }

    let mut entry = Mapping::new();
    entry.insert(YamlValue::from("title"), YamlValue::from(title));
    entry.insert(YamlValue::from("description"), YamlValue::from(description));
    entry.insert(YamlValue::from("dependencies"), YamlValue::Sequence(vec![]));
    work_packages.push(YamlValue::Mapping(entry));

    let formatted = serde_yaml::to_string(&document)
        .map_err(|error| format!("failed to serialize work-packages YAML: {error}"))?;
    fs::write(&path, formatted)
        .map_err(|error| format!("failed to write {}: {error}", path.display()))?;

    Ok(())
}

pub fn remove_work_package(root: &Path, project: &str, title: &str) -> Result<(), String> {
    let registry = read_registry(root)?;
    let project_id = format!("project--{project}");
    find_node(&registry, &project_id)?;

    let path = work_packages_path(root, project);
    if !path.is_file() {
        return Err(format!(
            "project {project:?} has no work-packages.yaml at {}",
            path.display()
        ));
    }

    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
    let mut document: YamlValue = serde_yaml::from_str(&raw)
        .map_err(|error| format!("invalid YAML in {}: {error}", path.display()))?;

    let work_packages = document
        .as_mapping_mut()
        .and_then(|map| map.get_mut(YamlValue::from("work_packages")))
        .and_then(YamlValue::as_sequence_mut)
        .ok_or_else(|| format!("work-packages file missing work_packages list in {}", path.display()))?;

    let before = work_packages.len();
    work_packages.retain(|entry| {
        entry
            .as_mapping()
            .and_then(|map| map.get(YamlValue::from("title")))
            .and_then(YamlValue::as_str)
            .is_none_or(|existing| existing != title)
    });
    if work_packages.len() == before {
        return Err(format!("work package {title:?} not found in project {project:?}"));
    }

    for entry in work_packages.iter_mut() {
        let Some(mapping) = entry.as_mapping_mut() else {
            continue;
        };
        let Some(deps) = mapping
            .get_mut(YamlValue::from("dependencies"))
            .and_then(YamlValue::as_sequence_mut)
        else {
            continue;
        };
        deps.retain(|dep| dep.as_str().is_none_or(|value| value != title));
    }

    let formatted = serde_yaml::to_string(&document)
        .map_err(|error| format!("failed to serialize work-packages YAML: {error}"))?;
    fs::write(&path, formatted)
        .map_err(|error| format!("failed to write {}: {error}", path.display()))?;

    Ok(())
}

fn write_registry_document(root: &Path, document: &JsonValue) -> Result<(), String> {
    let path = registry_path(root);
    let formatted = serde_json::to_string_pretty(document)
        .map_err(|error| format!("failed to serialize registry: {error}"))?;
    fs::write(&path, format!("{formatted}\n"))
        .map_err(|error| format!("failed to write {}: {error}", path.display()))
}

fn link_record_references_node(link: &JsonValue, node_id: &str) -> bool {
    link.get("in").and_then(JsonValue::as_str) == Some(node_id)
        || link.get("out").and_then(JsonValue::as_str) == Some(node_id)
}

fn remove_links_for_node(root: &Path, node_id: &str) -> Result<Vec<String>, String> {
    let links_file = links_path(root).ok_or_else(|| {
        format!(
            "not a bellman roadmap: missing links/links.jsonc or links/links.json under {}",
            root.display()
        )
    })?;

    let raw = fs::read_to_string(&links_file)
        .map_err(|error| format!("failed to read {}: {error}", links_file.display()))?;
    let mut document: JsonValue = serde_json::from_str(&raw)
        .map_err(|error| format!("invalid links JSON in {}: {error}", links_file.display()))?;
    let links = document
        .get_mut("links")
        .and_then(JsonValue::as_array_mut)
        .ok_or_else(|| format!("links file missing links array in {}", links_file.display()))?;

    let mut removed_ids = Vec::new();
    links.retain(|link| {
        if link_record_references_node(link, node_id) {
            if let Some(id) = link.get("id").and_then(JsonValue::as_str) {
                removed_ids.push(id.to_string());
            }
            false
        } else {
            true
        }
    });

    let formatted = serde_json::to_string_pretty(&document)
        .map_err(|error| format!("failed to serialize links: {error}"))?;
    fs::write(&links_file, format!("{formatted}\n"))
        .map_err(|error| format!("failed to write {}: {error}", links_file.display()))?;

    Ok(removed_ids)
}

fn remove_registry_node_record(
    root: &Path,
    node_id: &str,
    removed_link_ids: &[String],
) -> Result<(), String> {
    let path = registry_path(root);
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
    let mut document: JsonValue = serde_json::from_str(&raw)
        .map_err(|error| format!("invalid registry JSON: {error}"))?;
    let instances = document
        .get_mut("instances")
        .and_then(JsonValue::as_array_mut)
        .ok_or_else(|| format!("registry missing instances array in {}", path.display()))?;

    let removed_link_ids: std::collections::HashSet<&str> =
        removed_link_ids.iter().map(String::as_str).collect();
    let before = instances.len();
    instances.retain(|instance| {
        let id = instance.get("id").and_then(JsonValue::as_str).unwrap_or("");
        let kind = instance.get("kind").and_then(JsonValue::as_str).unwrap_or("");
        match kind {
            "node" => id != node_id,
            "link" => !removed_link_ids.contains(id),
            _ => true,
        }
    });

    if instances.len() == before {
        return Err(format!("registry node {node_id:?} not found"));
    }

    write_registry_document(root, &document)
}

fn is_missing_entity_error(error: &str) -> bool {
    error.contains("no entity named") || error.contains("no entity at")
}

fn remove_registry_only_node(root: &Path, node_id: &str) -> Result<(), String> {
    let removed_link_ids = remove_links_for_node(root, node_id)?;
    remove_registry_node_record(root, node_id, &removed_link_ids)
}

fn bellman_entity_name(node_id: &str, node_type: &str) -> String {
    let prefix = format!("{node_type}--");
    if node_id.starts_with(&prefix) {
        node_id[prefix.len()..].to_string()
    } else {
        node_id.to_string()
    }
}

fn node_delete_target(node_id: &str, node_type: &str) -> Result<(String, Option<String>), String> {
    match node_type {
        "initiative" | "project" | "milestone" | "goal" => {
            Ok((bellman_entity_name(node_id, node_type), None))
        }
        "work_package" => {
            let Some(separator) = node_id.find("--") else {
                return Err(format!("invalid work package id {node_id:?}"));
            };
            let project = node_id[..separator].to_string();
            let title = node_id[separator + 2..].to_string();
            if project.is_empty() || title.is_empty() {
                return Err(format!("invalid work package id {node_id:?}"));
            }
            Ok((title, Some(project)))
        }
        other => Err(format!("cannot delete node type {other:?}")),
    }
}

async fn run_bellman_for_request(app: &AppHandle, args: &[&str]) -> Result<String, String> {
    run_bellman(app, args).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeKind {
    Initiative,
    Project,
    Milestone,
    Goal,
    WorkPackage,
}

#[derive(Debug, Deserialize)]
pub struct CreateNodeRequest {
    pub roadmap_root: String,
    pub node_kind: NodeKind,
    pub name: String,
    pub project: Option<String>,
    pub description: Option<String>,
}

pub async fn create_node(app: &AppHandle, request: CreateNodeRequest) -> Result<(), String> {
    let root = PathBuf::from(&request.roadmap_root);
    if !registry_path(&root).is_file() {
        return Err(format!(
            "roadmap root is not editable: {}",
            request.roadmap_root
        ));
    }

    match request.node_kind {
        NodeKind::Initiative => {
            run_bellman_for_request(
                app,
                &[
                    "create",
                    "initiative",
                    "--path",
                    &request.roadmap_root,
                    &request.name,
                ],
            )
            .await?;
        }
        NodeKind::Project => {
            run_bellman_for_request(
                app,
                &[
                    "create",
                    "project",
                    "--path",
                    &request.roadmap_root,
                    &request.name,
                ],
            )
            .await?;
        }
        NodeKind::Milestone => {
            run_bellman_for_request(
                app,
                &[
                    "create",
                    "milestone",
                    "--path",
                    &request.roadmap_root,
                    &request.name,
                ],
            )
            .await?;
        }
        NodeKind::Goal => {
            run_bellman_for_request(
                app,
                &[
                    "create",
                    "goal",
                    "--path",
                    &request.roadmap_root,
                    &request.name,
                ],
            )
            .await?;
        }
        NodeKind::WorkPackage => {
            let project = request
                .project
                .ok_or_else(|| "project is required for work packages".to_string())?;
            let description = request
                .description
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "TBD.".to_string());
            append_work_package(&root, &project, &request.name, &description)?;
            run_bellman_for_request(app, &["sync", &request.roadmap_root]).await?;
        }
    }

    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct CreateLinkRequest {
    pub roadmap_root: String,
    pub link_type: String,
    pub source: String,
    pub target: String,
}

pub async fn create_link(request: CreateLinkRequest) -> Result<(), String> {
    let root = PathBuf::from(&request.roadmap_root);
    if !registry_path(&root).is_file() {
        return Err(format!(
            "roadmap root is not editable: {}",
            request.roadmap_root
        ));
    }

    append_link(&root, &request.link_type, &request.source, &request.target)
}

#[derive(Debug, Deserialize)]
pub struct RemoveLinkRequest {
    pub roadmap_root: String,
    pub link_id: String,
}

pub async fn remove_link(request: RemoveLinkRequest) -> Result<(), String> {
    let root = PathBuf::from(&request.roadmap_root);
    if !registry_path(&root).is_file() {
        return Err(format!(
            "roadmap root is not editable: {}",
            request.roadmap_root
        ));
    }

    remove_link_record(&root, &request.link_id)
}

#[derive(Debug, Deserialize)]
pub struct RemoveNodeRequest {
    pub roadmap_root: String,
    pub node_id: String,
    pub node_type: String,
}

pub async fn remove_node(app: &AppHandle, request: RemoveNodeRequest) -> Result<(), String> {
    let root = PathBuf::from(&request.roadmap_root);
    if !registry_path(&root).is_file() {
        return Err(format!(
            "roadmap root is not editable: {}",
            request.roadmap_root
        ));
    }

    let registry = read_registry(&root)?;
    find_node(&registry, &request.node_id)?;

    let (name, project) = node_delete_target(&request.node_id, &request.node_type)?;

    match request.node_type.as_str() {
        "work_package" => {
            let project = project
                .ok_or_else(|| "project is required for work packages".to_string())?;
            remove_work_package(&root, &project, &name)?;
            run_bellman_for_request(app, &["sync", &request.roadmap_root]).await?;
        }
        "initiative" | "project" | "milestone" | "goal" => {
            let delete_result = run_bellman_for_request(
                app,
                &["delete", "--path", &request.roadmap_root, &name],
            )
            .await;

            match delete_result {
                Ok(_) => {}
                Err(error) if is_missing_entity_error(&error) => {
                    remove_registry_only_node(&root, &request.node_id)?;
                }
                Err(error) => return Err(error),
            }
        }
        other => return Err(format!("cannot delete node type {other:?}")),
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::{Mutex, MutexGuard};

    fn fixture_lock() -> MutexGuard<'static, ()> {
        static LOCK: Mutex<()> = Mutex::new(());
        LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn fixture_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/fixtures/example-roadmap")
    }

    #[test]
    fn appends_link_to_fixture_links_file() {
        let _guard = fixture_lock();
        let root = fixture_root();
        let links_file = links_path(&root).expect("fixture links file");
        let backup = fs::read_to_string(&links_file).expect("read links");

        let result = append_link(
            &root,
            "parent_of",
            "billing-redesign--wp-invoicing",
            "billing-redesign--wp-pdf-export",
        );

        let restored = fs::read_to_string(&links_file).expect("read links after test");
        fs::write(&links_file, &backup).expect("restore links");

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("link already exists"));
        assert_eq!(restored, backup);
    }

    #[test]
    fn removes_link_from_fixture_links_file() {
        let _guard = fixture_lock();
        let root = fixture_root();
        let links_file = links_path(&root).expect("fixture links file");
        let backup = fs::read_to_string(&links_file).expect("read links");
        let link_id = "parent_of--billing-redesign--wp-invoicing--billing-redesign--wp-pdf-export";

        let result = remove_link_record(&root, link_id);
        let after_delete = fs::read_to_string(&links_file).expect("read links after delete");
        fs::write(&links_file, &backup).expect("restore links");

        assert!(result.is_ok());
        assert!(!after_delete.contains(link_id));
    }

    #[test]
    fn remove_link_errors_when_missing() {
        let _guard = fixture_lock();
        let root = fixture_root();
        let result = remove_link_record(&root, "missing-link-id");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("link not found"));
    }

    #[test]
    fn bellman_entity_name_strips_type_prefix_when_present() {
        assert_eq!(
            bellman_entity_name("project--billing-redesign", "project"),
            "billing-redesign"
        );
    }

    #[test]
    fn bellman_entity_name_keeps_legacy_ids() {
        assert_eq!(bellman_entity_name("usv-lars-p2", "project"), "usv-lars-p2");
        assert_eq!(
            bellman_entity_name("settings-manager", "initiative"),
            "settings-manager"
        );
    }
}
