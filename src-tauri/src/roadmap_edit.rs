use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};
use serde_yaml::{Mapping, Value as YamlValue};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use uuid::Uuid;

use crate::bellman_cmd::run_bellman;
use crate::graph::{
    all_link_artifact_paths, build_registry_index, load_registry_document, registry_path,
    resolve_link_file_for_endpoints, IndexedInstance, RegistryIndex, RoadmapGraphDto,
};

const LINKS_TEMPLATE: &str = r#"{
  "description": "Directed links between issued object ids. Edit by hand or via fits CLI; validate with fits validate.",
  "version": 1,
  "kind": "fits-links-v1",
  "links": []
}"#;

const WORK_PACKAGES_HEADER: &str = "version: 1\n\nwork_packages:\n";

fn read_registry_index(root: &Path) -> Result<RegistryIndex, String> {
    let raw = load_registry_document(root)?;
    Ok(build_registry_index(&raw))
}

fn node_matches_endpoint(node_type: &str, endpoint_type: &str) -> bool {
    node_type == endpoint_type
        || (endpoint_type == "work_scope" && (node_type == "initiative" || node_type == "project"))
}

fn find_node<'a>(
    index: &'a RegistryIndex,
    node_id: &str,
) -> Result<&'a IndexedInstance, String> {
    index
        .instances
        .iter()
        .find(|instance| {
            instance.kind == "node"
                && instance.type_name != "kind"
                && instance.logical_id == node_id
        })
        .ok_or_else(|| format!("unknown node {node_id:?}"))
}

fn validate_link_type(
    index: &RegistryIndex,
    link_type: &str,
    source_type: &str,
    target_type: &str,
) -> Result<(), String> {
    let Some(record) = index
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

fn read_json_file(path: &Path) -> Result<JsonValue, String> {
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
    serde_json::from_str(&raw)
        .map_err(|error| format!("invalid JSON in {}: {error}", path.display()))
}

fn write_json_file(path: &Path, document: &JsonValue) -> Result<(), String> {
    let formatted = serde_json::to_string_pretty(document)
        .map_err(|error| format!("failed to serialize {}: {error}", path.display()))?;
    fs::write(path, format!("{formatted}\n"))
        .map_err(|error| format!("failed to write {}: {error}", path.display()))
}

fn links_array_mut<'a>(
    document: &'a mut JsonValue,
    path: &Path,
) -> Result<&'a mut Vec<JsonValue>, String> {
    document
        .get_mut("links")
        .and_then(JsonValue::as_array_mut)
        .ok_or_else(|| format!("links file missing links array in {}", path.display()))
}

fn link_matches_guid(link: &JsonValue, guid: &str) -> bool {
    link.get("guid").and_then(JsonValue::as_str) == Some(guid)
        || link.get("id").and_then(JsonValue::as_str) == Some(guid)
}

pub fn append_link(
    root: &Path,
    link_type: &str,
    source: &str,
    target: &str,
) -> Result<(), String> {
    let index = read_registry_index(root)?;
    let source_node = find_node(&index, source)?;
    let target_node = find_node(&index, target)?;
    validate_link_type(
        &index,
        link_type,
        &source_node.type_name,
        &target_node.type_name,
    )?;

    let source_guid = source_node.guid.clone();
    let target_guid = target_node.guid.clone();
    let links_file = resolve_link_file_for_endpoints(root, &index, &source_guid, &target_guid)?;

    let mut document = if links_file.is_file() {
        read_json_file(&links_file)?
    } else {
        serde_json::from_str(LINKS_TEMPLATE)
            .map_err(|error| format!("failed to parse links template: {error}"))?
    };
    let links = links_array_mut(&mut document, &links_file)?;

    if links.iter().any(|link| {
        link.get("link_type").and_then(JsonValue::as_str) == Some(link_type)
            && link.get("in").and_then(JsonValue::as_str) == Some(source_guid.as_str())
            && link.get("out").and_then(JsonValue::as_str) == Some(target_guid.as_str())
    }) {
        return Err(format!(
            "link already exists: {link_type}:{source}->{target}"
        ));
    }

    let guid = Uuid::new_v4().to_string();
    links.push(json!({
        "guid": guid,
        "link_type": link_type,
        "in": source_guid,
        "out": target_guid,
        "labels": null
    }));

    write_json_file(&links_file, &document)
}

pub fn remove_link_record(root: &Path, link_id: &str) -> Result<(), String> {
    for path in all_link_artifact_paths(root) {
        let mut document = read_json_file(&path)?;
        let links = links_array_mut(&mut document, &path)?;
        let before = links.len();
        links.retain(|link| !link_matches_guid(link, link_id));
        if links.len() != before {
            write_json_file(&path, &document)?;
            return Ok(());
        }
    }
    Err(format!("link not found: {link_id}"))
}

fn work_packages_path(root: &Path, project: &str) -> PathBuf {
    root.join("projects").join(project).join("work-packages.yaml")
}

fn find_work_package_path(packages: &[YamlValue], title: &str) -> Option<Vec<usize>> {
    for (index, entry) in packages.iter().enumerate() {
        let Some(mapping) = entry.as_mapping() else {
            continue;
        };
        if mapping
            .get(YamlValue::from("title"))
            .and_then(YamlValue::as_str)
            == Some(title)
        {
            return Some(vec![index]);
        }
        if let Some(subs) = mapping
            .get(YamlValue::from("sub_packages"))
            .and_then(YamlValue::as_sequence)
        {
            if let Some(mut nested) = find_work_package_path(subs, title) {
                nested.insert(0, index);
                return Some(nested);
            }
        }
    }
    None
}

fn work_package_at_path<'a>(
    packages: &'a mut [YamlValue],
    path: &[usize],
) -> Option<&'a mut YamlValue> {
    let mut current = packages;
    let mut last_index = None;
    for (depth, &index) in path.iter().enumerate() {
        if depth + 1 == path.len() {
            last_index = Some(index);
            break;
        }
        let entry = current.get_mut(index)?;
        current = entry
            .as_mapping_mut()?
            .get_mut(YamlValue::from("sub_packages"))?
            .as_sequence_mut()?;
    }
    current.get_mut(last_index?)
}

fn work_package_exists(packages: &[YamlValue], title: &str) -> bool {
    find_work_package_path(packages, title).is_some()
}

fn retain_work_package(packages: &mut Vec<YamlValue>, title: &str) -> bool {
    let before = packages.len();
    packages.retain(|entry| {
        entry
            .as_mapping()
            .and_then(|map| map.get(YamlValue::from("title")))
            .and_then(YamlValue::as_str)
            .is_none_or(|existing| existing != title)
    });
    if packages.len() != before {
        return true;
    }
    for entry in packages.iter_mut() {
        let Some(mapping) = entry.as_mapping_mut() else {
            continue;
        };
        if let Some(subs) = mapping
            .get_mut(YamlValue::from("sub_packages"))
            .and_then(YamlValue::as_sequence_mut)
        {
            if retain_work_package(subs, title) {
                return true;
            }
        }
    }
    false
}

fn scrub_dependency_refs(packages: &mut [YamlValue], title: &str) {
    for entry in packages.iter_mut() {
        let Some(mapping) = entry.as_mapping_mut() else {
            continue;
        };
        if let Some(deps) = mapping
            .get_mut(YamlValue::from("dependencies"))
            .and_then(YamlValue::as_sequence_mut)
        {
            deps.retain(|dep| match dep {
                YamlValue::String(value) => value != title,
                YamlValue::Mapping(map) => map
                    .get(YamlValue::from("after"))
                    .and_then(YamlValue::as_str)
                    .is_none_or(|after| after != title),
                _ => true,
            });
        }
        if let Some(subs) = mapping
            .get_mut(YamlValue::from("sub_packages"))
            .and_then(YamlValue::as_sequence_mut)
        {
            scrub_dependency_refs(subs, title);
        }
    }
}

fn dependency_yaml_values(dependencies: &[String]) -> Vec<YamlValue> {
    dependencies
        .iter()
        .map(|dep| {
            let mut entry = Mapping::new();
            entry.insert(YamlValue::from("after"), YamlValue::from(dep.as_str()));
            entry.insert(YamlValue::from("relation"), YamlValue::from("FS"));
            entry.insert(YamlValue::from("hardness"), YamlValue::from("Mandatory"));
            YamlValue::Mapping(entry)
        })
        .collect()
}

pub fn append_work_package(
    root: &Path,
    project: &str,
    title: &str,
    description: &str,
) -> Result<(), String> {
    let index = read_registry_index(root)?;
    let project_id = format!("project/{project}");
    find_node(&index, &project_id)?;

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
        .ok_or_else(|| {
            format!(
                "work-packages file missing work_packages list in {}",
                path.display()
            )
        })?;

    if work_package_exists(work_packages, title) {
        return Err(format!(
            "work package {title:?} already exists in project {project:?}"
        ));
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
    let index = read_registry_index(root)?;
    let project_id = format!("project/{project}");
    find_node(&index, &project_id)?;

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
        .ok_or_else(|| {
            format!(
                "work-packages file missing work_packages list in {}",
                path.display()
            )
        })?;

    if !retain_work_package(work_packages, title) {
        return Err(format!(
            "work package {title:?} not found in project {project:?}"
        ));
    }
    scrub_dependency_refs(work_packages, title);

    let formatted = serde_yaml::to_string(&document)
        .map_err(|error| format!("failed to serialize work-packages YAML: {error}"))?;
    fs::write(&path, formatted)
        .map_err(|error| format!("failed to write {}: {error}", path.display()))?;

    Ok(())
}

pub fn set_work_package_fields(
    root: &Path,
    project: &str,
    title: &str,
    description: &str,
    dependencies: &[String],
) -> Result<(), String> {
    let index = read_registry_index(root)?;
    let project_id = format!("project/{project}");
    find_node(&index, &project_id)?;

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
        .ok_or_else(|| {
            format!(
                "work-packages file missing work_packages list in {}",
                path.display()
            )
        })?;

    let path_indexes = find_work_package_path(work_packages, title)
        .ok_or_else(|| format!("work package {title:?} not found in project {project:?}"))?;
    let entry = work_package_at_path(work_packages, &path_indexes)
        .ok_or_else(|| format!("work package {title:?} not found in project {project:?}"))?;

    let mapping = entry
        .as_mapping_mut()
        .ok_or_else(|| format!("work package {title:?} is not a mapping"))?;

    mapping.insert(
        YamlValue::from("description"),
        YamlValue::from(description),
    );
    mapping.insert(
        YamlValue::from("dependencies"),
        YamlValue::Sequence(dependency_yaml_values(dependencies)),
    );

    let formatted = serde_yaml::to_string(&document)
        .map_err(|error| format!("failed to serialize work-packages YAML: {error}"))?;
    fs::write(&path, formatted)
        .map_err(|error| format!("failed to write {}: {error}", path.display()))?;

    Ok(())
}

fn write_registry_document(root: &Path, document: &JsonValue) -> Result<(), String> {
    let path = registry_path(root);
    write_json_file(&path, document)
}

fn link_record_references_guid(link: &JsonValue, node_guid: &str) -> bool {
    link.get("in").and_then(JsonValue::as_str) == Some(node_guid)
        || link.get("out").and_then(JsonValue::as_str) == Some(node_guid)
}

fn remove_links_for_node(root: &Path, node_guid: &str) -> Result<Vec<String>, String> {
    let mut removed_ids = Vec::new();
    for path in all_link_artifact_paths(root) {
        let mut document = read_json_file(&path)?;
        let links = links_array_mut(&mut document, &path)?;
        let before = links.len();
        links.retain(|link| {
            if link_record_references_guid(link, node_guid) {
                if let Some(id) = link
                    .get("guid")
                    .and_then(JsonValue::as_str)
                    .or_else(|| link.get("id").and_then(JsonValue::as_str))
                {
                    removed_ids.push(id.to_string());
                }
                false
            } else {
                true
            }
        });
        if links.len() != before {
            write_json_file(&path, &document)?;
        }
    }
    Ok(removed_ids)
}

fn remove_registry_node_record(
    root: &Path,
    node_guid: &str,
    removed_link_ids: &[String],
) -> Result<(), String> {
    let path = registry_path(root);
    let mut document = read_json_file(&path)?;
    let instances = document
        .get_mut("instances")
        .and_then(JsonValue::as_array_mut)
        .ok_or_else(|| format!("registry missing instances array in {}", path.display()))?;

    let removed_link_ids: std::collections::HashSet<&str> =
        removed_link_ids.iter().map(String::as_str).collect();
    let before = instances.len();
    instances.retain(|instance| {
        let guid = instance.get("guid").and_then(JsonValue::as_str).unwrap_or("");
        let kind = instance.get("kind").and_then(JsonValue::as_str).unwrap_or("");
        match kind {
            "node" => guid != node_guid,
            "link" => !removed_link_ids.contains(guid),
            _ => true,
        }
    });

    if instances.len() == before {
        return Err(format!("registry node {node_guid:?} not found"));
    }

    write_registry_document(root, &document)
}

fn is_missing_entity_error(error: &str) -> bool {
    error.contains("no entity named") || error.contains("no entity at")
}

fn remove_registry_only_node(root: &Path, node_id: &str) -> Result<(), String> {
    let index = read_registry_index(root)?;
    let node = find_node(&index, node_id)?;
    let guid = node.guid.clone();
    let removed_link_ids = remove_links_for_node(root, &guid)?;
    remove_registry_node_record(root, &guid, &removed_link_ids)
}

pub(crate) fn bellman_entity_name(node_id: &str, node_type: &str) -> String {
    let prefix = format!("{node_type}/");
    if let Some(rest) = node_id.strip_prefix(&prefix) {
        rest.rsplit('/').next().unwrap_or(rest).to_string()
    } else {
        node_id.rsplit('/').next().unwrap_or(node_id).to_string()
    }
}

fn node_delete_target(node_id: &str, node_type: &str) -> Result<(String, Option<String>), String> {
    match node_type {
        "initiative" | "project" | "milestone" | "goal" => {
            Ok((bellman_entity_name(node_id, node_type), None))
        }
        "work_package" => {
            let parts: Vec<&str> = node_id.split('/').collect();
            if parts.len() < 3 || parts[0] != "project" {
                return Err(format!("invalid work package id {node_id:?}"));
            }
            let project = parts[1].to_string();
            let title = parts[parts.len() - 1].to_string();
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

    let index = read_registry_index(&root)?;
    find_node(&index, &request.node_id)?;

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

#[derive(Debug, Deserialize)]
pub struct UpdateWorkPackageRequest {
    pub roadmap_root: String,
    pub node_id: String,
    pub description: String,
    pub dependencies: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct RenameNodeRequest {
    pub roadmap_root: String,
    pub node_id: String,
    pub node_type: String,
    pub new_name: String,
}

#[derive(Debug, Serialize)]
pub struct RenameNodeResponse {
    pub graph: RoadmapGraphDto,
    pub new_node_id: String,
}

fn find_node_id_by_type_and_name(
    index: &RegistryIndex,
    node_type: &str,
    name: &str,
) -> Result<String, String> {
    let matches: Vec<&IndexedInstance> = index
        .instances
        .iter()
        .filter(|instance| {
            instance.kind == "node"
                && instance.type_name == node_type
                && bellman_entity_name(&instance.logical_id, node_type) == name
        })
        .collect();

    match matches.len() {
        0 => Err(format!(
            "no node found with type {node_type} and name {name:?}"
        )),
        1 => Ok(matches[0].logical_id.clone()),
        _ => Err(format!(
            "ambiguous node match for type {node_type} and name {name:?}"
        )),
    }
}

pub async fn rename_node(app: &AppHandle, request: RenameNodeRequest) -> Result<String, String> {
    let root = PathBuf::from(&request.roadmap_root);
    if !registry_path(&root).is_file() {
        return Err(format!(
            "roadmap root is not editable: {}",
            request.roadmap_root
        ));
    }

    let node_type = request.node_type.as_str();
    match node_type {
        "initiative" | "project" | "milestone" | "goal" => {}
        other => return Err(format!("cannot rename node type {other:?}")),
    }

    let new_name = request.new_name.trim().to_string();
    if new_name.is_empty() {
        return Err("new name cannot be empty".to_string());
    }

    let index = read_registry_index(&root)?;
    find_node(&index, &request.node_id)?;

    let old_name = bellman_entity_name(&request.node_id, node_type);
    if old_name == new_name {
        return Err("new name is the same as the current name".to_string());
    }

    run_bellman_for_request(
        app,
        &[
            "rename",
            node_type,
            "--path",
            &request.roadmap_root,
            &old_name,
            &new_name,
        ],
    )
    .await?;

    let updated = read_registry_index(&root)?;
    find_node_id_by_type_and_name(&updated, node_type, &new_name)
}

pub async fn update_work_package(
    app: &AppHandle,
    request: UpdateWorkPackageRequest,
) -> Result<(), String> {
    let root = PathBuf::from(&request.roadmap_root);
    if !registry_path(&root).is_file() {
        return Err(format!(
            "roadmap root is not editable: {}",
            request.roadmap_root
        ));
    }

    let (name, project) = node_delete_target(&request.node_id, "work_package")?;
    let project = project.ok_or_else(|| "project is required for work packages".to_string())?;

    set_work_package_fields(
        &root,
        &project,
        &name,
        &request.description,
        &request.dependencies,
    )?;
    run_bellman_for_request(app, &["sync", &request.roadmap_root]).await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::{Mutex, MutexGuard};
    use tempfile::TempDir;

    fn fixture_lock() -> MutexGuard<'static, ()> {
        static LOCK: Mutex<()> = Mutex::new(());
        LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn fixture_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/fixtures/example-roadmap")
    }

    #[test]
    fn appends_link_errors_when_already_present() {
        let _guard = fixture_lock();
        let root = fixture_root();

        let result = append_link(
            &root,
            "parent_of",
            "project/billing-redesign/wp-invoicing",
            "project/billing-redesign/wp-pdf-export",
        );

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("link already exists"));
    }

    #[test]
    fn removes_link_from_fixture_subgraph() {
        let _guard = fixture_lock();
        let root = fixture_root();
        let link_id = "3a150a65-6676-444f-96ce-37d40be1c004";
        let subgraph = root.join(
            "nodes/kind/project project/billing-redesign/.fits/subgraph.jsonc",
        );
        let backup = fs::read_to_string(&subgraph).expect("read subgraph");

        let result = remove_link_record(&root, link_id);
        let after_delete = fs::read_to_string(&subgraph).expect("read subgraph after delete");
        fs::write(&subgraph, &backup).expect("restore subgraph");

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
            bellman_entity_name("project/billing-redesign", "project"),
            "billing-redesign"
        );
        assert_eq!(
            bellman_entity_name("project/billing-redesign/wp-invoicing", "work_package"),
            "wp-invoicing"
        );
    }

    fn write_project_registry(root: &Path) {
        fs::create_dir_all(root.join(".fits")).unwrap();
        fs::write(
            root.join(".fits/registry.json"),
            r#"{
  "link_types": [],
  "nested_link_types": [],
  "instances": [
    {"guid":"kind-project","name":"project","type":"kind","kind":"node","scope":"root"},
    {"guid":"proj-1","name":"billing","type":"project","kind":"node","scope":"nested","parent_guid":"kind-project"}
  ]
}"#,
        )
        .unwrap();
        fs::create_dir_all(root.join("links")).unwrap();
        fs::write(root.join("links/links.jsonc"), LINKS_TEMPLATE).unwrap();
    }

    #[test]
    fn set_work_package_fields_updates_description_and_dependencies() {
        let temp = TempDir::new().unwrap();
        let root = temp.path();
        write_project_registry(root);
        fs::create_dir_all(root.join("projects/billing")).unwrap();
        fs::write(
            root.join("projects/billing/work-packages.yaml"),
            "version: 1\n\nwork_packages:\n  - title: wp-one\n    description: Old description.\n    dependencies: []\n",
        )
        .unwrap();

        set_work_package_fields(
            root,
            "billing",
            "wp-one",
            "New description.",
            &["wp-two".to_string()],
        )
        .unwrap();

        let raw = fs::read_to_string(root.join("projects/billing/work-packages.yaml")).unwrap();
        assert!(raw.contains("New description."));
        assert!(!raw.contains("Old description."));
        assert!(raw.contains("wp-two"));
        assert!(raw.contains("after:"));
    }

    #[test]
    fn set_work_package_fields_errors_for_missing_title() {
        let temp = TempDir::new().unwrap();
        let root = temp.path();
        write_project_registry(root);
        fs::create_dir_all(root.join("projects/billing")).unwrap();
        fs::write(
            root.join("projects/billing/work-packages.yaml"),
            "version: 1\n\nwork_packages: []\n",
        )
        .unwrap();

        let result = set_work_package_fields(root, "billing", "ghost", "x", &[]);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }
}
