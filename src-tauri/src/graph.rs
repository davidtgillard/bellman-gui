use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
struct RegistryDocument {
    link_types: Vec<RegistryLinkType>,
    instances: Vec<RegistryInstance>,
}

#[derive(Debug, Deserialize)]
struct RegistryLinkType {
    link_type: String,
    in_type: String,
    out_type: String,
}

#[derive(Debug, Deserialize)]
struct RegistryInstance {
    id: String,
    #[serde(rename = "type")]
    type_name: String,
    kind: String,
}

#[derive(Debug, Deserialize)]
struct LinksDocument {
    links: Vec<LinkRecord>,
}

#[derive(Debug, Deserialize)]
struct LinkRecord {
    id: String,
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

fn registry_path(root: &Path) -> PathBuf {
    root.join(".fits/registry.json")
}

fn links_path(root: &Path) -> Option<PathBuf> {
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

fn node_label(node_id: &str) -> String {
    for prefix in ["initiative--", "project--", "milestone--", "goal--"] {
        if let Some(name) = node_id.strip_prefix(prefix) {
            return name.to_string();
        }
    }
    if let Some((_, name)) = node_id.split_once("--") {
        return name.to_string();
    }
    node_id.to_string()
}

fn has_typed_node_prefix(node: &GraphNodeDto) -> bool {
    node.id.starts_with(&format!("{}--", node.node_type))
}

fn node_dedup_key(node: &GraphNodeDto) -> String {
    format!("{}:{}", node.node_type, node_label(&node.id))
}

fn preferred_duplicate_node(left: &GraphNodeDto, right: &GraphNodeDto) -> GraphNodeDto {
    let left_typed = has_typed_node_prefix(left);
    let right_typed = has_typed_node_prefix(right);
    let preferred = if left_typed != right_typed {
        if left_typed { left } else { right }
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

fn deduplicate_graph_nodes(nodes: Vec<GraphNodeDto>) -> (Vec<GraphNodeDto>, std::collections::HashMap<String, String>) {
    use std::collections::HashMap;

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

pub fn load_roadmap_graph(root: &Path) -> Result<RoadmapGraphDto, String> {
    let registry_file = registry_path(root);
    if !registry_file.is_file() {
        return Err(format!(
            "not a bellman roadmap: missing {}",
            registry_file.display()
        ));
    }

    let links_file = links_path(root).ok_or_else(|| {
        format!(
            "not a bellman roadmap: missing links/links.jsonc or links/links.json under {}",
            root.display()
        )
    })?;

    let registry_raw = fs::read_to_string(&registry_file)
        .map_err(|error| format!("failed to read {}: {error}", registry_file.display()))?;
    let links_raw = fs::read_to_string(&links_file)
        .map_err(|error| format!("failed to read {}: {error}", links_file.display()))?;

    let registry: RegistryDocument = serde_json::from_str(&registry_raw)
        .map_err(|error| format!("invalid registry JSON: {error}"))?;
    let links: LinksDocument = serde_json::from_str(&links_raw)
        .map_err(|error| format!("invalid links JSON: {error}"))?;

    let mut nodes = registry
        .instances
        .iter()
        .filter(|instance| instance.kind == "node")
        .map(|instance| GraphNodeDto {
            id: instance.id.clone(),
            node_type: instance.type_name.clone(),
        })
        .collect::<Vec<_>>();

    nodes.sort_by(|left, right| left.id.cmp(&right.id));
    nodes.dedup_by(|left, right| left.id == right.id);

    let (nodes, id_aliases) = deduplicate_graph_nodes(nodes);

    let links = links
        .links
        .iter()
        .map(|link| GraphLinkDto {
            id: link.id.clone(),
            link_type: link.link_type.clone(),
            source: id_aliases
                .get(&link.source)
                .cloned()
                .unwrap_or_else(|| link.source.clone()),
            target: id_aliases
                .get(&link.out)
                .cloned()
                .unwrap_or_else(|| link.out.clone()),
        })
        .collect();

    let link_types = registry
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
    }

    #[test]
    fn deduplicates_registry_aliases_with_the_same_type_and_label() {
        let nodes = vec![
            GraphNodeDto {
                id: "usv-lars-p2".to_string(),
                node_type: "project".to_string(),
            },
            GraphNodeDto {
                id: "project--usv-lars-p2".to_string(),
                node_type: "project".to_string(),
            },
        ];

        let (canonical, aliases) = deduplicate_graph_nodes(nodes);
        assert_eq!(canonical.len(), 1);
        assert_eq!(canonical[0].id, "project--usv-lars-p2");
        assert_eq!(
            aliases.get("usv-lars-p2"),
            Some(&"project--usv-lars-p2".to_string())
        );
    }
}
