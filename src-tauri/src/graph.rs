use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize, Clone)]
pub struct RegistryLinkType {
    pub link_type: String,
    pub in_type: String,
    pub out_type: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct RegistryInstance {
    pub guid: String,
    pub name: String,
    #[serde(rename = "type")]
    pub type_name: String,
    pub kind: String,
    #[serde(default)]
    pub parent_guid: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LinksDocument {
    #[serde(default)]
    links: Vec<LinkRecord>,
}

#[derive(Debug, Deserialize)]
struct SubgraphDocument {
    #[serde(default)]
    links: Vec<LinkRecord>,
}

#[derive(Debug, Deserialize)]
struct LinkRecord {
    #[serde(default)]
    guid: Option<String>,
    #[serde(default)]
    id: Option<String>,
    link_type: String,
    #[serde(rename = "in")]
    source: String,
    out: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct GraphNodeDto {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct GraphLinkDto {
    pub id: String,
    pub link_type: String,
    pub source: String,
    pub target: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct LinkTypeDto {
    pub link_type: String,
    pub in_type: String,
    pub out_type: String,
}

#[derive(Debug, Serialize)]
pub struct RoadmapGraphDto {
    pub root: String,
    pub editable: bool,
    pub nodes: Vec<GraphNodeDto>,
    pub links: Vec<GraphLinkDto>,
    pub link_types: Vec<LinkTypeDto>,
}

pub fn registry_path(root: &Path) -> PathBuf {
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

/// Returns the natural (leaf) name from a slash-qualified logical node id.
pub fn node_label(node_id: &str) -> String {
    node_id
        .rsplit('/')
        .next()
        .unwrap_or(node_id)
        .to_string()
}

/// Returns whether a node id uses a type-qualified slash path (`{type}/…`).
pub fn has_typed_node_prefix(node: &GraphNodeDto) -> bool {
    node.id.starts_with(&format!("{}/", node.node_type))
}

fn node_dedup_key(node: &GraphNodeDto) -> String {
    format!("{}:{}", node.node_type, node_label(&node.id))
}

fn preferred_duplicate_node(left: &GraphNodeDto, right: &GraphNodeDto) -> GraphNodeDto {
    let left_typed = has_typed_node_prefix(left);
    let right_typed = has_typed_node_prefix(right);
    let preferred = if left_typed != right_typed {
        if left_typed {
            left
        } else {
            right
        }
    } else if left.id.len() != right.id.len() {
        if left.id.len() > right.id.len() {
            left
        } else {
            right
        }
    } else if left.id <= right.id {
        left
    } else {
        right
    };
    preferred.clone()
}

fn deduplicate_graph_nodes(
    nodes: Vec<GraphNodeDto>,
) -> (Vec<GraphNodeDto>, HashMap<String, String>) {
    let mut groups: HashMap<String, Vec<GraphNodeDto>> = HashMap::new();
    for node in nodes {
        groups
            .entry(node_dedup_key(&node))
            .or_default()
            .push(node);
    }

    let mut canonical_nodes = Vec::new();
    let mut id_aliases = HashMap::new();

    for group in groups.into_values() {
        let canonical = group
            .iter()
            .fold(group[0].clone(), |current, candidate| {
                preferred_duplicate_node(&current, candidate)
            });
        for node in group {
            id_aliases.insert(node.id, canonical.id.clone());
        }
        canonical_nodes.push(canonical);
    }

    (canonical_nodes, id_aliases)
}

/// Builds `parent/…/name` from registry parent links.
pub fn logical_path_for_instance(
    inst: &RegistryInstance,
    by_guid: &HashMap<String, RegistryInstance>,
) -> String {
    let mut segments: Vec<&str> = vec![inst.name.as_str()];
    let mut parent_guid = inst.parent_guid.as_deref();
    let mut seen = std::collections::HashSet::from([inst.guid.as_str()]);
    while let Some(parent_id) = parent_guid {
        if !seen.insert(parent_id) {
            break;
        }
        let Some(parent) = by_guid.get(parent_id) else {
            break;
        };
        segments.push(parent.name.as_str());
        parent_guid = parent.parent_guid.as_deref();
    }
    segments.reverse();
    segments.join("/")
}

pub fn load_registry_document(root: &Path) -> Result<RegistryDocumentRaw, String> {
    let path = registry_path(root);
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
    serde_json::from_str(&raw).map_err(|error| format!("invalid registry JSON: {error}"))
}

/// Parsed registry with computed logical paths for node instances.
#[derive(Debug, Clone)]
pub struct RegistryIndex {
    pub instances: Vec<IndexedInstance>,
    pub link_types: Vec<RegistryLinkType>,
}

#[derive(Debug, Clone)]
pub struct IndexedInstance {
    pub guid: String,
    pub type_name: String,
    pub kind: String,
    pub parent_guid: Option<String>,
    pub logical_id: String,
}

#[derive(Debug, Deserialize)]
pub struct RegistryDocumentRaw {
    #[serde(default)]
    link_types: Vec<RegistryLinkType>,
    #[serde(default)]
    nested_link_types: Vec<RegistryLinkType>,
    instances: Vec<RegistryInstance>,
}

pub fn build_registry_index(registry: &RegistryDocumentRaw) -> RegistryIndex {
    let by_guid: HashMap<String, RegistryInstance> = registry
        .instances
        .iter()
        .filter(|inst| inst.kind == "node")
        .map(|inst| (inst.guid.clone(), inst.clone()))
        .collect();

    let instances = registry
        .instances
        .iter()
        .map(|inst| {
            let logical_id = if inst.kind == "node" {
                logical_path_for_instance(inst, &by_guid)
            } else {
                inst.name.clone()
            };
            IndexedInstance {
                guid: inst.guid.clone(),
                type_name: inst.type_name.clone(),
                kind: inst.kind.clone(),
                parent_guid: inst.parent_guid.clone(),
                logical_id,
            }
        })
        .collect();

    let mut link_types = registry.link_types.clone();
    for nested in &registry.nested_link_types {
        if !link_types
            .iter()
            .any(|existing| existing.link_type == nested.link_type)
        {
            link_types.push(nested.clone());
        }
    }

    RegistryIndex {
        instances,
        link_types,
    }
}

fn parse_json_document<T: for<'de> Deserialize<'de>>(
    path: &Path,
    raw: &str,
) -> Result<T, String> {
    serde_json::from_str(raw)
        .map_err(|error| format!("invalid JSON in {}: {error}", path.display()))
}

fn collect_link_files(root: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    if let Some(root_links) = links_path(root) {
        files.push(root_links);
    }

    let nodes_root = root.join("nodes");
    if nodes_root.is_dir() {
        collect_subgraph_files(&nodes_root, &mut files);
    }
    files
}

fn collect_subgraph_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_subgraph_files(&path, out);
        } else if path.file_name().and_then(|name| name.to_str()) == Some("subgraph.jsonc")
            || path.file_name().and_then(|name| name.to_str()) == Some("subgraph.json")
        {
            out.push(path);
        }
    }
}

fn load_links_from_file(path: &Path) -> Result<Vec<LinkRecord>, String> {
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
    // Subgraphs and root links share the links array shape.
    if let Ok(doc) = serde_json::from_str::<LinksDocument>(&raw) {
        return Ok(doc.links);
    }
    let doc: SubgraphDocument = parse_json_document(path, &raw)?;
    Ok(doc.links)
}

fn link_record_id(link: &LinkRecord) -> String {
    link.guid
        .clone()
        .or_else(|| link.id.clone())
        .unwrap_or_else(|| format!("{}:{}->{}", link.link_type, link.source, link.out))
}

pub fn load_roadmap_graph(root: &Path) -> Result<RoadmapGraphDto, String> {
    let registry_file = registry_path(root);
    if !registry_file.is_file() {
        return Err(format!(
            "not a bellman roadmap: missing {}",
            registry_file.display()
        ));
    }

    if links_path(root).is_none() {
        return Err(format!(
            "not a bellman roadmap: missing links/links.jsonc or links/links.json under {}",
            root.display()
        ));
    }

    let registry_raw = load_registry_document(root)?;
    let index = build_registry_index(&registry_raw);

    let guid_to_logical: HashMap<&str, &str> = index
        .instances
        .iter()
        .filter(|inst| inst.kind == "node")
        .map(|inst| (inst.guid.as_str(), inst.logical_id.as_str()))
        .collect();

    let mut nodes = index
        .instances
        .iter()
        .filter(|instance| instance.kind == "node" && instance.type_name != "kind")
        .map(|instance| GraphNodeDto {
            id: instance.logical_id.clone(),
            node_type: instance.type_name.clone(),
        })
        .collect::<Vec<_>>();

    nodes.sort_by(|left, right| left.id.cmp(&right.id));
    nodes.dedup_by(|left, right| left.id == right.id);

    let (nodes, id_aliases) = deduplicate_graph_nodes(nodes);

    let mut links = Vec::new();
    for path in collect_link_files(root) {
        for link in load_links_from_file(&path)? {
            let source_logical = guid_to_logical
                .get(link.source.as_str())
                .copied()
                .unwrap_or(link.source.as_str());
            let target_logical = guid_to_logical
                .get(link.out.as_str())
                .copied()
                .unwrap_or(link.out.as_str());
            links.push(GraphLinkDto {
                id: link_record_id(&link),
                link_type: link.link_type,
                source: id_aliases
                    .get(source_logical)
                    .cloned()
                    .unwrap_or_else(|| source_logical.to_string()),
                target: id_aliases
                    .get(target_logical)
                    .cloned()
                    .unwrap_or_else(|| target_logical.to_string()),
            });
        }
    }

    let link_types = index
        .link_types
        .iter()
        .map(|link_type| LinkTypeDto {
            link_type: link_type.link_type.clone(),
            in_type: link_type.in_type.clone(),
            out_type: link_type.out_type.clone(),
        })
        .collect();

    Ok(RoadmapGraphDto {
        root: root.to_string_lossy().into_owned(),
        editable: true,
        nodes,
        links,
        link_types,
    })
}

/// Finds the links artifact path for a pair of node GUIDs (shared parent subgraph or root).
pub fn resolve_link_file_for_endpoints(
    root: &Path,
    index: &RegistryIndex,
    source_guid: &str,
    target_guid: &str,
) -> Result<PathBuf, String> {
    let source = index
        .instances
        .iter()
        .find(|inst| inst.guid == source_guid)
        .ok_or_else(|| format!("unknown source guid {source_guid}"))?;
    let target = index
        .instances
        .iter()
        .find(|inst| inst.guid == target_guid)
        .ok_or_else(|| format!("unknown target guid {target_guid}"))?;

    if let (Some(source_parent), Some(target_parent)) =
        (source.parent_guid.as_deref(), target.parent_guid.as_deref())
    {
        if source_parent == target_parent {
            if let Some(path) = find_subgraph_for_parent(root, source_parent) {
                return Ok(path);
            }
        }
    }

    links_path(root).ok_or_else(|| {
        format!(
            "not a bellman roadmap: missing links/links.jsonc or links/links.json under {}",
            root.display()
        )
    })
}

fn find_subgraph_for_parent(root: &Path, parent_guid: &str) -> Option<PathBuf> {
    let mut files = Vec::new();
    collect_subgraph_files(&root.join("nodes"), &mut files);
    for path in files {
        let Ok(raw) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) else {
            continue;
        };
        if value
            .get("parent_guid")
            .and_then(|item| item.as_str())
            == Some(parent_guid)
        {
            return Some(path);
        }
    }
    None
}

/// Returns every on-disk links/subgraph file under a roadmap root.
pub fn all_link_artifact_paths(root: &Path) -> Vec<PathBuf> {
    collect_link_files(root)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn fixture_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/fixtures/example-roadmap")
    }

    #[test]
    fn loads_example_fixture() {
        let graph = load_roadmap_graph(&fixture_root()).expect("fixture should load");
        assert_eq!(graph.nodes.len(), 6);
        assert_eq!(graph.links.len(), 2);
        assert!(graph.editable);
        assert!(!graph.link_types.is_empty());
        assert!(graph
            .nodes
            .iter()
            .any(|node| node.id == "project/billing-redesign"));
        assert!(graph
            .nodes
            .iter()
            .any(|node| node.id == "project/billing-redesign/wp-invoicing"));
        assert!(!graph.nodes.iter().any(|node| node.node_type == "kind"));
    }

    #[test]
    fn node_label_uses_final_path_segment() {
        assert_eq!(node_label("initiative/explore-ml-ranking"), "explore-ml-ranking");
        assert_eq!(
            node_label("project/billing-redesign/wp-invoicing"),
            "wp-invoicing"
        );
    }

    #[test]
    fn deduplicates_registry_aliases_with_the_same_type_and_label() {
        let nodes = vec![
            GraphNodeDto {
                id: "usv-lars-p2".to_string(),
                node_type: "project".to_string(),
            },
            GraphNodeDto {
                id: "project/usv-lars-p2".to_string(),
                node_type: "project".to_string(),
            },
        ];

        let (canonical, aliases) = deduplicate_graph_nodes(nodes);
        assert_eq!(canonical.len(), 1);
        assert_eq!(canonical[0].id, "project/usv-lars-p2");
        assert_eq!(
            aliases.get("usv-lars-p2"),
            Some(&"project/usv-lars-p2".to_string())
        );
    }
}
