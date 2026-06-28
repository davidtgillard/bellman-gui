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

    let nodes = registry
        .instances
        .iter()
        .filter(|instance| instance.kind == "node")
        .map(|instance| GraphNodeDto {
            id: instance.id.clone(),
            node_type: instance.type_name.clone(),
        })
        .collect();

    let links = links
        .links
        .iter()
        .map(|link| GraphLinkDto {
            id: link.id.clone(),
            link_type: link.link_type.clone(),
            source: link.source.clone(),
            target: link.out.clone(),
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
}
