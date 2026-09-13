use serde::{Deserialize, Serialize};
use serde_yaml::Value as YamlValue;

#[derive(Debug)]
struct ParsedDuration {
    amount: f64,
    unit: char,
    normalized: String,
}

/// YAML/IPC sentinel for a missing numeric estimate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum UnknownSentinel {
    #[serde(rename = "unknown")]
    Unknown,
}

/// Estimate payload from the UI: a duration triple or the explicit `unknown` sentinel.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum EstimateInput {
    Triple([String; 3]),
    Unknown(UnknownSentinel),
}

/// Parses a duration token such as `1w`, `2.5d`, or `8h`.
/// Trims leading/trailing whitespace, then matches `^(\d+(?:\.\d)?)([hdw])$`
/// (case-insensitive). Internal whitespace is rejected.
fn parse_duration_token(token: &str) -> Result<ParsedDuration, String> {
    let token = token.trim();
    if token.is_empty() {
        return Err("duration token is empty".to_string());
    }

    let bytes = token.as_bytes();
    let mut index = 0;
    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
    }
    if index == 0 {
        return Err(format!(
            "invalid duration amount in {token:?}; expected a number like 1 or 2.5"
        ));
    }

    if index < bytes.len() && bytes[index] == b'.' {
        index += 1;
        if index >= bytes.len() || !bytes[index].is_ascii_digit() {
            return Err(format!(
                "invalid duration amount in {token:?}; expected a number like 1 or 2.5"
            ));
        }
        index += 1;
        if index < bytes.len() && bytes[index].is_ascii_digit() {
            return Err(format!(
                "duration amount may have at most one decimal place in {token:?}"
            ));
        }
    }

    let amount_str = &token[..index];
    if index >= bytes.len() {
        return Err(format!(
            "invalid duration unit in {token:?}; expected h, d, or w"
        ));
    }

    let unit = (bytes[index] as char).to_ascii_lowercase();
    if !matches!(unit, 'h' | 'd' | 'w') {
        return Err(format!(
            "invalid duration unit in {token:?}; expected h, d, or w"
        ));
    }
    index += 1;
    if index != bytes.len() {
        return Err(format!(
            "invalid duration unit in {token:?}; expected h, d, or w"
        ));
    }

    let amount: f64 = amount_str.parse().map_err(|_| {
        format!("invalid duration amount in {token:?}; expected a number like 1 or 2.5")
    })?;
    if !amount.is_finite() || amount <= 0.0 {
        return Err(format!(
            "duration amount must be greater than zero in {token:?}"
        ));
    }

    Ok(ParsedDuration {
        amount,
        unit,
        normalized: format!("{amount_str}{unit}"),
    })
}

pub type WorkPackageEstimate = [String; 3];

/// Validates an optimistic / likely / pessimistic estimate triple.
pub fn validate_work_package_estimate(
    estimate: &[String; 3],
) -> Result<WorkPackageEstimate, String> {
    let optimistic = parse_duration_token(&estimate[0])?;
    let likely = parse_duration_token(&estimate[1])?;
    let pessimistic = parse_duration_token(&estimate[2])?;

    if optimistic.unit != likely.unit || likely.unit != pessimistic.unit {
        return Err(
            "estimate values must use the same duration suffix (h, d, or w)".to_string(),
        );
    }

    if !(optimistic.amount <= likely.amount && likely.amount <= pessimistic.amount) {
        return Err(
            "estimates must be ordered: optimistic ≤ likely ≤ pessimistic".to_string(),
        );
    }

    Ok([optimistic.normalized, likely.normalized, pessimistic.normalized])
}

/// Resolves a UI estimate payload into a validated triple, or `None` for unknown.
/// Absent / null inputs are treated as unknown.
pub fn resolve_estimate_input(
    input: Option<&EstimateInput>,
) -> Result<Option<WorkPackageEstimate>, String> {
    match input {
        None | Some(EstimateInput::Unknown(UnknownSentinel::Unknown)) => Ok(None),
        Some(EstimateInput::Triple(tokens)) => {
            Ok(Some(validate_work_package_estimate(tokens)?))
        }
    }
}

fn estimate_shape_error(detail: &str) -> String {
    format!("estimate must be \"unknown\" or a 3-point duration triple; {detail}")
}

/// Reads an optional estimate from YAML.
/// Missing, null, or the `"unknown"` sentinel become `Ok(None)`.
/// A 3-string sequence is validated (leading/trailing whitespace trimmed).
/// Any other shape, including wrong-length sequences, is `Err`.
pub fn parse_estimate_yaml(
    value: Option<&YamlValue>,
) -> Result<Option<WorkPackageEstimate>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    if value.is_null() {
        return Ok(None);
    }
    if let Some(text) = value.as_str() {
        if text == "unknown" {
            return Ok(None);
        }
        return Err(estimate_shape_error("got a string other than \"unknown\""));
    }
    let Some(items) = value.as_sequence() else {
        return Err(estimate_shape_error("got a value that is not a string or sequence"));
    };
    if items.len() != 3 {
        return Err(estimate_shape_error(&format!("got {} values", items.len())));
    }

    let mut tokens = [String::new(), String::new(), String::new()];
    for (index, item) in items.iter().enumerate() {
        let Some(token) = item.as_str() else {
            return Err(estimate_shape_error("entries must all be strings"));
        };
        tokens[index] = token.to_string();
    }
    Ok(Some(validate_work_package_estimate(&tokens)?))
}

/// Maps a YAML estimate onto the IPC wire value (triple or `"unknown"`).
/// Invalid duration tokens or a malformed estimate fail the load.
pub fn estimate_wire_from_yaml(value: Option<&YamlValue>) -> Result<EstimateInput, String> {
    match parse_estimate_yaml(value)? {
        Some(tokens) => Ok(EstimateInput::Triple(tokens)),
        None => Ok(EstimateInput::Unknown(UnknownSentinel::Unknown)),
    }
}

/// Builds a YAML value for a validated estimate triple.
pub fn estimate_yaml_value(estimate: &WorkPackageEstimate) -> YamlValue {
    YamlValue::Sequence(
        estimate
            .iter()
            .map(|token| YamlValue::from(token.as_str()))
            .collect(),
    )
}

/// Builds a YAML estimate: a duration triple, or the explicit `unknown` sentinel.
pub fn estimate_yaml_value_or_unknown(estimate: Option<&WorkPackageEstimate>) -> YamlValue {
    match estimate {
        Some(tokens) => estimate_yaml_value(tokens),
        None => YamlValue::from("unknown"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_orders_estimates() {
        let estimate =
            validate_work_package_estimate(&["1w".into(), "2w".into(), "4w".into()]).unwrap();
        assert_eq!(
            estimate,
            ["1w".to_string(), "2w".to_string(), "4w".to_string()]
        );
    }

    #[test]
    fn rejects_out_of_order_estimates() {
        let err = validate_work_package_estimate(&["4w".into(), "2w".into(), "1w".into()])
            .unwrap_err();
        assert!(err.contains("ordered"));
    }

    #[test]
    fn rejects_mixed_duration_suffixes() {
        let err = validate_work_package_estimate(&["1d".into(), "2d".into(), "1w".into()])
            .unwrap_err();
        assert!(err.contains("same duration suffix"));
    }

    #[test]
    fn rejects_zero_durations() {
        let err = parse_duration_token("0w").unwrap_err();
        assert!(err.contains("greater than zero"));
    }

    #[test]
    fn rejects_invalid_units() {
        let err = parse_duration_token("3x").unwrap_err();
        assert!(err.contains("unit"));
    }

    #[test]
    fn rejects_scientific_notation_and_partial_decimals() {
        assert!(parse_duration_token("1e2w").is_err());
        assert!(parse_duration_token("1.w").is_err());
        assert!(parse_duration_token(".5w").is_err());
        assert!(parse_duration_token("2.50d").is_err());
    }

    #[test]
    fn rejects_internal_whitespace_in_duration_tokens() {
        assert!(parse_duration_token("1 w").is_err());
        assert!(parse_duration_token("1    d").is_err());
        assert!(parse_duration_token("5  w").is_err());
        assert!(parse_duration_token("1\td").is_err());
    }

    #[test]
    fn trims_leading_and_trailing_whitespace() {
        assert_eq!(parse_duration_token("1w ").unwrap().normalized, "1w");
        assert_eq!(parse_duration_token("  1w  ").unwrap().normalized, "1w");
        assert_eq!(parse_duration_token("\t1w").unwrap().normalized, "1w");
    }

    #[test]
    fn normalizes_case_without_whitespace() {
        let parsed = parse_duration_token("1W").unwrap();
        assert_eq!(parsed.normalized, "1w");
    }

    #[test]
    fn parse_estimate_yaml_shape_and_validation() {
        assert_eq!(parse_estimate_yaml(None).unwrap(), None);
        assert_eq!(
            parse_estimate_yaml(Some(&YamlValue::Null)).unwrap(),
            None
        );
        assert_eq!(
            parse_estimate_yaml(Some(&YamlValue::from("unknown"))).unwrap(),
            None
        );
        let wrong_length = parse_estimate_yaml(Some(&YamlValue::Sequence(vec![
            YamlValue::from("1w"),
            YamlValue::from("2w"),
        ])))
        .unwrap_err();
        assert_eq!(
            wrong_length,
            "estimate must be \"unknown\" or a 3-point duration triple; got 2 values"
        );
        let not_unknown = parse_estimate_yaml(Some(&YamlValue::from("1w"))).unwrap_err();
        assert_eq!(
            not_unknown,
            "estimate must be \"unknown\" or a 3-point duration triple; got a string other than \"unknown\""
        );
        assert_eq!(
            parse_estimate_yaml(Some(&YamlValue::Sequence(vec![
                YamlValue::from("1w"),
                YamlValue::from("2w"),
                YamlValue::from("4w"),
            ])))
            .unwrap(),
            Some(["1w".into(), "2w".into(), "4w".into()])
        );
        assert_eq!(
            parse_estimate_yaml(Some(&YamlValue::Sequence(vec![
                YamlValue::from("1W"),
                YamlValue::from("2w"),
                YamlValue::from("4w"),
            ])))
            .unwrap(),
            Some(["1w".into(), "2w".into(), "4w".into()])
        );
        assert_eq!(
            parse_estimate_yaml(Some(&YamlValue::Sequence(vec![
                YamlValue::from(" 1w "),
                YamlValue::from("2w"),
                YamlValue::from("4w"),
            ])))
            .unwrap(),
            Some(["1w".into(), "2w".into(), "4w".into()])
        );
        assert_eq!(
            parse_estimate_yaml(Some(&YamlValue::Sequence(vec![
                YamlValue::from("4w"),
                YamlValue::from("2w"),
                YamlValue::from("1w"),
            ])))
            .unwrap_err(),
            "estimates must be ordered: optimistic ≤ likely ≤ pessimistic"
        );
        assert!(parse_estimate_yaml(Some(&YamlValue::Sequence(vec![
            YamlValue::from("1 w"),
            YamlValue::from("2w"),
            YamlValue::from("4w"),
        ])))
        .unwrap_err()
        .contains("invalid duration unit in \"1 w\""));
    }

    #[test]
    fn resolve_estimate_input_accepts_unknown_and_triples() {
        assert_eq!(resolve_estimate_input(None).unwrap(), None);
        assert_eq!(
            resolve_estimate_input(Some(&EstimateInput::Unknown(
                UnknownSentinel::Unknown
            )))
            .unwrap(),
            None
        );
        assert_eq!(
            resolve_estimate_input(Some(&EstimateInput::Triple([
                "1w".into(),
                "2w".into(),
                "4w".into(),
            ])))
            .unwrap(),
            Some(["1w".into(), "2w".into(), "4w".into()])
        );
        assert_eq!(
            resolve_estimate_input(Some(&EstimateInput::Triple([
                " 1w ".into(),
                "2w".into(),
                "4w".into(),
            ])))
            .unwrap(),
            Some(["1w".into(), "2w".into(), "4w".into()])
        );
        assert!(resolve_estimate_input(Some(&EstimateInput::Triple([
            "1 w".into(),
            "2w".into(),
            "4w".into(),
        ])))
        .is_err());
    }

    #[test]
    fn estimate_input_rejects_non_unknown_string_at_deserialize() {
        assert!(serde_json::from_str::<EstimateInput>(r#""maybe""#).is_err());
        assert_eq!(
            serde_json::from_str::<EstimateInput>(r#""unknown""#).unwrap(),
            EstimateInput::Unknown(UnknownSentinel::Unknown)
        );
    }

    #[test]
    fn estimate_yaml_value_or_unknown_writes_sentinel() {
        assert_eq!(
            estimate_yaml_value_or_unknown(None),
            YamlValue::from("unknown")
        );
        assert_eq!(
            estimate_yaml_value_or_unknown(Some(&["1w".into(), "2w".into(), "4w".into()])),
            YamlValue::Sequence(vec![
                YamlValue::from("1w"),
                YamlValue::from("2w"),
                YamlValue::from("4w"),
            ])
        );
    }

    #[test]
    fn estimate_wire_from_yaml_rejects_invalid_tokens() {
        assert_eq!(
            estimate_wire_from_yaml(None).unwrap(),
            EstimateInput::Unknown(UnknownSentinel::Unknown)
        );
        assert_eq!(
            estimate_wire_from_yaml(Some(&YamlValue::Sequence(vec![
                YamlValue::from("1w"),
                YamlValue::from("2w"),
                YamlValue::from("4w"),
            ])))
            .unwrap(),
            EstimateInput::Triple(["1w".into(), "2w".into(), "4w".into()])
        );
        assert!(estimate_wire_from_yaml(Some(&YamlValue::Sequence(vec![
            YamlValue::from("1 w"),
            YamlValue::from("2w"),
            YamlValue::from("4w"),
        ])))
        .unwrap_err()
        .contains("invalid duration unit in \"1 w\""));
        assert!(estimate_wire_from_yaml(Some(&YamlValue::Sequence(vec![
            YamlValue::from("1w"),
            YamlValue::from("2w"),
        ])))
        .unwrap_err()
        .contains("got 2 values"));
    }
}
