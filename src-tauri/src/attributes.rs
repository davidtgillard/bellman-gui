//! Load attribute definitions and parse/write classification assignments.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value as JsonValue};
use serde_yaml::{Mapping, Value as YamlValue};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AttributeAssignmentDto {
    pub name: String,
    pub value: JsonValue,
    #[serde(default)]
    pub payload: Map<String, JsonValue>,
    #[serde(default)]
    pub pinned_version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AttributeDefinitionDto {
    pub name: String,
    pub version: String,
    pub description: String,
    pub applies_to: Vec<String>,
    pub cardinality: String,
    pub required: bool,
    pub values: Option<JsonValue>,
    pub value_schema: Option<JsonValue>,
    pub assignment_schema: Option<JsonValue>,
}

fn strip_jsonc(text: &str) -> String {
    let mut out = String::new();
    let mut chars = text.chars().peekable();
    let mut in_string = false;
    while let Some(ch) = chars.next() {
        if in_string {
            out.push(ch);
            if ch == '\\' {
                if let Some(escaped) = chars.next() {
                    out.push(escaped);
                }
                continue;
            }
            if ch == '"' {
                in_string = false;
            }
            continue;
        }
        if ch == '"' {
            in_string = true;
            out.push(ch);
            continue;
        }
        if ch == '/' && chars.peek() == Some(&'/') {
            chars.next();
            for next in chars.by_ref() {
                if next == '\n' {
                    out.push('\n');
                    break;
                }
            }
            continue;
        }
        if ch == '/' && chars.peek() == Some(&'*') {
            chars.next();
            loop {
                match chars.next() {
                    None => break,
                    Some('*') if chars.peek() == Some(&'/') => {
                        chars.next();
                        break;
                    }
                    Some('\n') => out.push('\n'),
                    Some(_) => {}
                }
            }
            continue;
        }
        out.push(ch);
    }
    strip_trailing_commas(&out)
}

/// Drops commas that precede `}` or `]`, leaving separators between properties intact.
fn strip_trailing_commas(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::new();
    let mut in_string = false;
    let mut i = 0;
    while i < chars.len() {
        let ch = chars[i];
        if in_string {
            out.push(ch);
            if ch == '\\' && i + 1 < chars.len() {
                out.push(chars[i + 1]);
                i += 2;
                continue;
            }
            if ch == '"' {
                in_string = false;
            }
            i += 1;
            continue;
        }
        if ch == '"' {
            in_string = true;
            out.push(ch);
            i += 1;
            continue;
        }
        if ch == ',' {
            let mut lookahead = i + 1;
            while lookahead < chars.len() && chars[lookahead].is_whitespace() {
                lookahead += 1;
            }
            if lookahead < chars.len() && (chars[lookahead] == '}' || chars[lookahead] == ']') {
                i += 1;
                continue;
            }
        }
        out.push(ch);
        i += 1;
    }
    out
}

pub fn load_attribute_catalog(root: &Path) -> Vec<AttributeDefinitionDto> {
    let directory = root.join("attributes");
    let Ok(entries) = fs::read_dir(&directory) else {
        return Vec::new();
    };
    let mut paths: Vec<_> = entries.filter_map(|entry| entry.ok()).collect();
    paths.sort_by_key(|entry| entry.file_name());
    let mut catalog = Vec::new();
    for entry in paths {
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("jsonc") {
            continue;
        }
        let Ok(raw) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(doc) = serde_json::from_str::<JsonValue>(&strip_jsonc(&raw)) else {
            continue;
        };
        let Some(obj) = doc.as_object() else {
            continue;
        };
        let Some(name) = obj.get("name").and_then(JsonValue::as_str) else {
            continue;
        };
        let Some(version) = obj.get("version").and_then(JsonValue::as_str) else {
            continue;
        };
        let Some(applies) = obj.get("applies_to").and_then(JsonValue::as_array) else {
            continue;
        };
        let Some(cardinality) = obj.get("cardinality").and_then(JsonValue::as_str) else {
            continue;
        };
        catalog.push(AttributeDefinitionDto {
            name: name.to_string(),
            version: version.to_string(),
            description: obj
                .get("description")
                .and_then(JsonValue::as_str)
                .unwrap_or("")
                .to_string(),
            applies_to: applies
                .iter()
                .filter_map(JsonValue::as_str)
                .map(str::to_string)
                .collect(),
            cardinality: cardinality.to_string(),
            required: obj.get("required").and_then(JsonValue::as_bool).unwrap_or(false),
            values: obj.get("values").cloned(),
            value_schema: obj.get("value_schema").cloned(),
            assignment_schema: obj.get("assignment_schema").cloned(),
        });
    }
    catalog
}

fn parse_scalar(text: &str) -> JsonValue {
    let stripped = text.trim();
    if stripped.len() >= 2 && stripped.starts_with('"') && stripped.ends_with('"') {
        return JsonValue::String(stripped[1..stripped.len() - 1].to_string());
    }
    if stripped == "true" {
        return JsonValue::Bool(true);
    }
    if stripped == "false" {
        return JsonValue::Bool(false);
    }
    if let Ok(value) = stripped.parse::<i64>() {
        if stripped.chars().all(|ch| ch.is_ascii_digit() || ch == '-') {
            return JsonValue::from(value);
        }
    }
    if let Ok(value) = stripped.parse::<f64>() {
        if stripped.contains('.') {
            return JsonValue::from(value);
        }
    }
    JsonValue::String(stripped.to_string())
}

fn is_token(text: &str) -> bool {
    let mut chars = text.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    first.is_ascii_alphanumeric()
        && chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '.' || ch == '_' || ch == '-')
}

fn parse_payload(payload: &str) -> Map<String, JsonValue> {
    let mut data = Map::new();
    let mut items = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    for ch in payload.chars() {
        if ch == '"' {
            in_quotes = !in_quotes;
        }
        if ch == ',' && !in_quotes {
            items.push(std::mem::take(&mut current));
            continue;
        }
        current.push(ch);
    }
    if !current.trim().is_empty() {
        items.push(current);
    }
    for item in items {
        let Some((key, raw)) = item.split_once(':') else {
            continue;
        };
        let key = key.trim();
        if key.is_empty() {
            continue;
        }
        data.insert(key.to_string(), parse_scalar(raw));
    }
    data
}

pub fn parse_classifications_markdown(markdown: &str) -> Vec<AttributeAssignmentDto> {
    let mut assignments = Vec::new();
    let mut in_section = false;
    for line in markdown.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix('#') {
            let hashes = trimmed.chars().take_while(|ch| *ch == '#').count();
            let title = rest.trim().trim_start_matches('#').trim();
            if hashes == 2 && title == "Classifications" {
                in_section = true;
                continue;
            }
            if in_section && hashes <= 2 {
                break;
            }
        }
        if !in_section || trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let Some(rest) = trimmed.strip_prefix("- ") else {
            continue;
        };
        let Some((head, after)) = rest.split_once(':') else {
            continue;
        };
        let head = head.trim();
        let (name, pin) = match head.rsplit_once('@') {
            Some((name, version)) => (name.to_string(), Some(version.to_string())),
            None => (head.to_string(), None),
        };
        let after = after.trim();
        let (value_text, payload) = if let Some(start) = after.find('[') {
            let value = after[..start].trim();
            let end = after.rfind(']').unwrap_or(after.len());
            let payload = if end > start { &after[start + 1..end] } else { "" };
            (value, parse_payload(payload))
        } else {
            (after, Map::new())
        };
        if !is_token(value_text) {
            continue;
        }
        assignments.push(AttributeAssignmentDto {
            name,
            value: JsonValue::String(value_text.to_string()),
            payload,
            pinned_version: pin,
        });
    }
    assignments
}

fn yaml_scalar(value: &JsonValue) -> YamlValue {
    match value {
        JsonValue::Bool(flag) => YamlValue::Bool(*flag),
        JsonValue::Number(number) => {
            if let Some(int) = number.as_i64() {
                YamlValue::Number(int.into())
            } else if let Some(float) = number.as_f64() {
                YamlValue::Number(serde_yaml::Number::from(float))
            } else {
                YamlValue::String(number.to_string())
            }
        }
        JsonValue::String(text) => YamlValue::String(text.clone()),
        other => YamlValue::String(other.to_string()),
    }
}

pub fn classifications_yaml(assignments: &[AttributeAssignmentDto]) -> Option<YamlValue> {
    if assignments.is_empty() {
        return None;
    }
    let mut grouped: Vec<(String, Vec<&AttributeAssignmentDto>)> = Vec::new();
    for assignment in assignments {
        let head = match &assignment.pinned_version {
            Some(pin) if !pin.is_empty() => format!("{}@{pin}", assignment.name),
            _ => assignment.name.clone(),
        };
        if let Some((_, bucket)) = grouped.iter_mut().find(|(key, _)| key == &head) {
            bucket.push(assignment);
        } else {
            grouped.push((head, vec![assignment]));
        }
    }
    let mut map = Mapping::new();
    for (head, bucket) in grouped {
        let values: Vec<YamlValue> = bucket
            .into_iter()
            .map(|assignment| {
                if assignment.payload.is_empty() && !assignment.value.is_object() {
                    yaml_scalar(&assignment.value)
                } else {
                    let mut entry = Mapping::new();
                    entry.insert(YamlValue::from("value"), yaml_scalar(&assignment.value));
                    for (key, value) in &assignment.payload {
                        entry.insert(YamlValue::from(key.as_str()), yaml_scalar(value));
                    }
                    YamlValue::Mapping(entry)
                }
            })
            .collect();
        let yaml = if values.len() == 1 {
            values.into_iter().next().unwrap()
        } else {
            YamlValue::Sequence(values)
        };
        map.insert(YamlValue::from(head), yaml);
    }
    Some(YamlValue::Mapping(map))
}

fn parse_xy(version: &str) -> Option<(u32, u32)> {
    let (major, minor) = version.split_once('.')?;
    Some((major.parse().ok()?, minor.parse().ok()?))
}

pub fn pin_still_legal(pin: Option<&str>, definition_version: &str) -> bool {
    let Some(pin) = pin.filter(|value| !value.is_empty()) else {
        return false;
    };
    let Some((pin_major, pin_minor)) = parse_xy(pin) else {
        return false;
    };
    let Some((def_major, def_minor)) = parse_xy(definition_version) else {
        return false;
    };
    pin_major == def_major && pin_minor <= def_minor
}

pub fn with_legal_pins(
    assignments: &[AttributeAssignmentDto],
    catalog: &[AttributeDefinitionDto],
) -> Vec<AttributeAssignmentDto> {
    assignments
        .iter()
        .map(|assignment| {
            let definition = catalog.iter().find(|item| item.name == assignment.name);
            let pin = assignment.pinned_version.as_deref().and_then(|value| {
                let version = definition.map(|item| item.version.as_str()).unwrap_or("");
                if pin_still_legal(Some(value), version) {
                    Some(value.to_string())
                } else {
                    None
                }
            });
            let mut next = assignment.clone();
            next.pinned_version = pin;
            next
        })
        .collect()
}

pub fn append_classifications_markdown(markdown: &str, assignments: &[AttributeAssignmentDto]) -> String {
    let mut lines: Vec<&str> = markdown.lines().collect();
    let mut start = None;
    let mut end = lines.len();
    for (index, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        let hashes = trimmed.chars().take_while(|ch| *ch == '#').count();
        if hashes == 2 && trimmed.trim_start_matches('#').trim() == "Classifications" {
            start = Some(index);
            continue;
        }
        if start.is_some() && hashes > 0 && hashes <= 2 {
            end = index;
            break;
        }
    }
    if let Some(start) = start {
        lines.drain(start..end);
    }
    let mut body = lines.join("\n");
    body = body.trim_end().to_string();
    if assignments.is_empty() {
        return format!("{body}\n");
    }
    body.push_str("\n\n## Classifications\n\n");
    for assignment in assignments {
        let pin = assignment
            .pinned_version
            .as_ref()
            .filter(|pin| !pin.is_empty())
            .map(|pin| format!("@{pin}"))
            .unwrap_or_default();
        let value = format_scalar(&assignment.value);
        let payload = assignment
            .payload
            .iter()
            .map(|(key, value)| format!("{key}: {}", format_scalar(value)))
            .collect::<Vec<_>>()
            .join(", ");
        if payload.is_empty() {
            body.push_str(&format!("- {}{pin}: {value}\n", assignment.name));
        } else {
            body.push_str(&format!(
                "- {}{pin}: {value} [{payload}]\n",
                assignment.name
            ));
        }
    }
    body
}

pub fn yaml_classifications(value: Option<&YamlValue>) -> Vec<AttributeAssignmentDto> {
    let Some(YamlValue::Mapping(map)) = value else {
        return Vec::new();
    };
    let mut assignments = Vec::new();
    for (key, item) in map {
        let Some(head) = key.as_str() else {
            continue;
        };
        let (name, pin) = match head.rsplit_once('@') {
            Some((name, version)) => (name.to_string(), Some(version.to_string())),
            None => (head.to_string(), None),
        };
        let entries = match item {
            YamlValue::Sequence(items) => items.clone(),
            other => vec![other.clone()],
        };
        for entry in entries {
            match entry {
                YamlValue::Mapping(fields) => {
                    let value = fields
                        .get(YamlValue::from("value"))
                        .map(yaml_to_json)
                        .unwrap_or(JsonValue::Null);
                    let mut payload = Map::new();
                    for (field, field_value) in fields {
                        if field.as_str() == Some("value") {
                            continue;
                        }
                        if let Some(field_name) = field.as_str() {
                            payload.insert(field_name.to_string(), yaml_to_json(&field_value));
                        }
                    }
                    assignments.push(AttributeAssignmentDto {
                        name: name.clone(),
                        value,
                        payload,
                        pinned_version: pin.clone(),
                    });
                }
                other => assignments.push(AttributeAssignmentDto {
                    name: name.clone(),
                    value: yaml_to_json(&other),
                    payload: Map::new(),
                    pinned_version: pin.clone(),
                }),
            }
        }
    }
    assignments
}

fn format_scalar(value: &JsonValue) -> String {
    match value {
        JsonValue::String(text) if is_token(text) && text != "true" && text != "false" => {
            text.clone()
        }
        JsonValue::String(text) => serde_json::to_string(text).unwrap_or_else(|_| text.clone()),
        JsonValue::Bool(flag) => flag.to_string(),
        JsonValue::Number(number) => number.to_string(),
        other => other.to_string(),
    }
}

fn yaml_to_json(value: &YamlValue) -> JsonValue {
    serde_json::to_value(value).unwrap_or(JsonValue::Null)
}

fn is_open_object(definition: &AttributeDefinitionDto) -> bool {
    let open_values = definition
        .values
        .as_ref()
        .is_none_or(JsonValue::is_null);
    open_values
        && definition
            .value_schema
            .as_ref()
            .and_then(|schema| schema.get("type"))
            .and_then(JsonValue::as_str)
            == Some("object")
}

fn definition_applies(definition: &AttributeDefinitionDto, node_type: &str) -> bool {
    definition.applies_to.iter().any(|kind| kind == node_type)
        && !(node_type != "work_package" && is_open_object(definition))
}

fn allowed_tokens(definition: &AttributeDefinitionDto) -> Option<Vec<String>> {
    match definition.values.as_ref()? {
        JsonValue::Array(items) => Some(
            items
                .iter()
                .filter_map(JsonValue::as_str)
                .map(str::to_string)
                .collect(),
        ),
        JsonValue::Object(map) => Some(map.keys().cloned().collect()),
        _ => None,
    }
}

fn value_matches_schema(schema: &JsonValue, value: &JsonValue) -> bool {
    let Some(typ) = schema.get("type").and_then(JsonValue::as_str) else {
        return true;
    };
    match typ {
        "string" => value.is_string(),
        "number" => value.is_number(),
        "integer" => value.as_i64().is_some() || value.as_u64().is_some(),
        "boolean" => value.is_boolean(),
        "object" => value.is_object(),
        _ => true,
    }
}

fn number_bounds_error(schema: &JsonValue, value: &JsonValue) -> Option<String> {
    let obj = schema.as_object()?;
    let number = value.as_f64()?;
    if let Some(min) = obj.get("minimum").and_then(JsonValue::as_f64) {
        if number < min {
            return Some(format!("must be >= {min}"));
        }
    }
    if let Some(max) = obj.get("maximum").and_then(JsonValue::as_f64) {
        if number > max {
            return Some(format!("must be <= {max}"));
        }
    }
    None
}

fn assignment_data_error(
    definition: &AttributeDefinitionDto,
    payload: &Map<String, JsonValue>,
) -> Option<String> {
    if payload.is_empty() {
        return None;
    }
    let Some(schema) = definition
        .assignment_schema
        .as_ref()
        .and_then(JsonValue::as_object)
    else {
        return Some(format!(
            "{} does not accept assignment data.",
            definition.name
        ));
    };
    let schema_type = schema.get("type").and_then(JsonValue::as_str);
    if schema_type.is_some() && schema_type != Some("object") {
        return Some(format!("{} data is invalid: must be object", definition.name));
    }
    let properties = schema.get("properties").and_then(JsonValue::as_object);
    let additional_false = schema.get("additionalProperties") == Some(&JsonValue::Bool(false));
    for (key, value) in payload {
        match properties.and_then(|map| map.get(key)) {
            Some(property) => {
                if let Some(detail) = number_bounds_error(property, value) {
                    return Some(format!(
                        "{} data is invalid: {key} {detail}",
                        definition.name
                    ));
                }
            }
            None if additional_false => {
                return Some(format!(
                    "{} data is invalid: additional property {key}",
                    definition.name
                ));
            }
            None => {}
        }
    }
    None
}

/// Catalog checks that must pass before assignments are written to disk.
pub fn validate_assignments(
    node_type: &str,
    catalog: &[AttributeDefinitionDto],
    assignments: &[AttributeAssignmentDto],
) -> Result<(), String> {
    let mut errors = Vec::new();
    let mut counts: Vec<(String, usize)> = Vec::new();
    for (index, assignment) in assignments.iter().enumerate() {
        let Some(definition) = catalog.iter().find(|item| item.name == assignment.name) else {
            errors.push(format!("Unknown attribute \"{}\".", assignment.name));
            continue;
        };
        if !definition_applies(definition, node_type) {
            errors.push(format!(
                "{} does not apply to {node_type}.",
                definition.name
            ));
            continue;
        }
        if let Some((_, count)) = counts.iter_mut().find(|(name, _)| name == &assignment.name) {
            *count += 1;
        } else {
            counts.push((assignment.name.clone(), 1));
        }
        if let Some(tokens) = allowed_tokens(definition) {
            let text = assignment
                .value
                .as_str()
                .map(str::to_string)
                .unwrap_or_else(|| assignment.value.to_string());
            if assignment.value.is_object() || !tokens.iter().any(|token| token == &text) {
                errors.push(format!(
                    "\"{text}\" is not an allowed {} value.",
                    definition.name
                ));
            }
        } else if let Some(schema) = &definition.value_schema {
            if !value_matches_schema(schema, &assignment.value) {
                errors.push(format!("{} value is invalid.", definition.name));
            }
        }
        if let Some(message) = assignment_data_error(definition, &assignment.payload) {
            errors.push(message);
        }
        let duplicate = assignments.iter().take(index).any(|other| {
            other.name == assignment.name && other.value == assignment.value
        });
        if duplicate {
            errors.push(format!("Duplicate {} value.", assignment.name));
        }
    }
    for definition in catalog {
        if !definition.required || !definition_applies(definition, node_type) {
            continue;
        }
        let count = counts
            .iter()
            .find(|(name, _)| name == &definition.name)
            .map(|(_, count)| *count)
            .unwrap_or(0);
        if count == 0 {
            errors.push(format!("{} is required.", definition.name));
        }
        if definition.cardinality == "one" && count > 1 {
            errors.push(format!("{} allows only one value.", definition.name));
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join(" "))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn definition(name: &str, version: &str) -> AttributeDefinitionDto {
        AttributeDefinitionDto {
            name: name.to_string(),
            version: version.to_string(),
            description: String::new(),
            applies_to: vec!["project".to_string()],
            cardinality: "one".to_string(),
            required: false,
            values: None,
            value_schema: None,
            assignment_schema: None,
        }
    }

    fn assignment(name: &str, pin: Option<&str>) -> AttributeAssignmentDto {
        AttributeAssignmentDto {
            name: name.to_string(),
            value: json!("P1"),
            payload: Map::new(),
            pinned_version: pin.map(str::to_string),
        }
    }

    #[test]
    fn keeps_a_same_major_pin_not_newer_than_the_definition() {
        let catalog = vec![definition("priority", "1.2")];
        let stripped = with_legal_pins(&[assignment("priority", Some("1.1"))], &catalog);
        assert_eq!(stripped[0].pinned_version.as_deref(), Some("1.1"));
    }

    #[test]
    fn drops_a_pin_from_a_newer_or_other_major() {
        let catalog = vec![definition("priority", "1.0")];
        let too_new = with_legal_pins(&[assignment("priority", Some("1.1"))], &catalog);
        assert_eq!(too_new[0].pinned_version, None);
        let other_major = with_legal_pins(&[assignment("priority", Some("2.0"))], &catalog);
        assert_eq!(other_major[0].pinned_version, None);
    }

    #[test]
    fn omits_classifications_yaml_when_empty() {
        assert!(classifications_yaml(&[]).is_none());
    }

    #[test]
    fn strip_jsonc_keeps_commas_between_properties() {
        let raw = r#"{
  "$schema": "https://example.com/schema.json",
  "name": "objective",
  "version": "1.0",
  "applies_to": ["initiative", "project"],
  "cardinality": "many",
  "required": false,
  // json schema
  "value_schema": { "type": "string" },
}"#;
        let parsed: JsonValue =
            serde_json::from_str(&strip_jsonc(raw)).expect("pretty-printed jsonc should parse");
        assert_eq!(parsed["name"], "objective");
        assert_eq!(parsed["value_schema"]["type"], "string");
        assert_eq!(
            parsed["applies_to"],
            json!(["initiative", "project"])
        );
    }

    #[test]
    fn load_attribute_catalog_reads_pretty_printed_jsonc() {
        let dir = std::env::temp_dir().join(format!(
            "bellman-gui-attr-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(dir.join("attributes")).unwrap();
        fs::write(
            dir.join("attributes/objective.jsonc"),
            r#"{
  "$schema": "https://github.com/davidtgillard/bellman/schemas/attribute-definition/1.0.json",
  "name": "objective",
  "version": "1.0",
  "applies_to": ["initiative", "project"],
  "cardinality": "many",
  "required": false,
  "value_schema": { "type": "string" }
}
"#,
        )
        .unwrap();
        let catalog = load_attribute_catalog(&dir);
        let _ = fs::remove_dir_all(&dir);
        assert_eq!(catalog.len(), 1);
        assert_eq!(catalog[0].name, "objective");
        assert!(catalog[0].applies_to.iter().any(|kind| kind == "project"));
    }

    #[test]
    fn markdown_round_trips_pins_and_payloads() {
        let markdown = include_str!(
            "../../src/fixtures/example-roadmap/projects/billing-redesign/billing-redesign.md"
        );
        let parsed = parse_classifications_markdown(markdown);
        assert_eq!(
            parsed
                .iter()
                .map(|item| item.name.as_str())
                .collect::<Vec<_>>(),
            ["priority", "program", "goal"]
        );
        assert_eq!(parsed[1].pinned_version.as_deref(), Some("1.0"));
        assert_eq!(parsed[1].payload.get("allocation"), Some(&json!(0.5)));
        let rewritten = append_classifications_markdown("# Title\n\nBody.\n", &parsed);
        let again = parse_classifications_markdown(&rewritten);
        assert_eq!(again, parsed);
        assert!(rewritten.contains("- program@1.0: platform-v2 [allocation: 0.5]"));
    }

    #[test]
    fn payload_parse_keeps_quoted_commas() {
        let payload = parse_payload(r#"note: "hello, world", allocation: 0.5"#);
        assert_eq!(payload.get("note"), Some(&json!("hello, world")));
        assert_eq!(payload.get("allocation"), Some(&json!(0.5)));
    }

    #[test]
    fn yaml_classifications_round_trip() {
        let mut payload = Map::new();
        payload.insert("allocation".to_string(), json!(0.5));
        let original = vec![
            AttributeAssignmentDto {
                name: "priority".to_string(),
                value: json!("P1"),
                payload: Map::new(),
                pinned_version: None,
            },
            AttributeAssignmentDto {
                name: "program".to_string(),
                value: json!("platform-v2"),
                payload,
                pinned_version: Some("1.0".to_string()),
            },
        ];
        let yaml = classifications_yaml(&original).expect("yaml");
        let parsed = yaml_classifications(Some(&yaml));
        assert_eq!(parsed.len(), original.len());
        for item in &original {
            assert!(parsed.iter().any(|other| other == item));
        }
    }

    #[test]
    fn validate_assignments_rejects_unknown_and_required_missing() {
        let mut priority = definition("priority", "1.0");
        priority.required = true;
        priority.values = Some(json!(["P0", "P1"]));
        let catalog = vec![priority];
        let missing = validate_assignments("project", &catalog, &[]);
        assert!(missing.unwrap_err().contains("priority is required"));
        let unknown = validate_assignments(
            "project",
            &catalog,
            &[assignment("goal", None)],
        );
        assert!(unknown.unwrap_err().contains("Unknown attribute"));
        let ok = validate_assignments(
            "project",
            &catalog,
            &[assignment("priority", None)],
        );
        assert!(ok.is_ok());
    }

    #[test]
    fn validate_assignments_rejects_out_of_range_payload() {
        let mut program = definition("program", "1.0");
        program.applies_to = vec!["work_package".to_string()];
        program.values = Some(json!({"platform-v2": {"title": "Platform v2"}}));
        program.assignment_schema = Some(json!({
            "type": "object",
            "additionalProperties": false,
            "properties": { "allocation": { "type": "number", "minimum": 0, "maximum": 1 } }
        }));
        let mut payload = Map::new();
        payload.insert("allocation".to_string(), json!(2));
        let bad = AttributeAssignmentDto {
            name: "program".to_string(),
            value: json!("platform-v2"),
            payload,
            pinned_version: None,
        };
        let err = validate_assignments("work_package", &[program], &[bad]).unwrap_err();
        assert!(err.contains("allocation"));
    }
}
