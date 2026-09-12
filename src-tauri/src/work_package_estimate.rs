use serde_yaml::Value as YamlValue;

#[derive(Debug)]
struct ParsedDuration {
    amount: f64,
    unit: char,
    normalized: String,
}

/// Parses a duration token such as `1w`, `2.5d`, or `8h`.
/// Grammar matches the UI: `^(\d+(?:\.\d)?)\s*([hdw])$` (case-insensitive, trimmed).
fn parse_duration_token(token: &str) -> Result<ParsedDuration, String> {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return Err("duration token is empty".to_string());
    }

    let bytes = trimmed.as_bytes();
    let mut index = 0;
    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
    }
    if index == 0 {
        return Err(format!(
            "invalid duration amount in {trimmed:?}; expected a number like 1 or 2.5"
        ));
    }

    if index < bytes.len() && bytes[index] == b'.' {
        index += 1;
        if index >= bytes.len() || !bytes[index].is_ascii_digit() {
            return Err(format!(
                "invalid duration amount in {trimmed:?}; expected a number like 1 or 2.5"
            ));
        }
        index += 1;
        if index < bytes.len() && bytes[index].is_ascii_digit() {
            return Err(format!(
                "duration amount may have at most one decimal place in {trimmed:?}"
            ));
        }
    }

    let amount_str = &trimmed[..index];
    while index < bytes.len() && bytes[index].is_ascii_whitespace() {
        index += 1;
    }
    if index >= bytes.len() {
        return Err(format!(
            "invalid duration unit in {trimmed:?}; expected h, d, or w"
        ));
    }

    let unit = (bytes[index] as char).to_ascii_lowercase();
    if !matches!(unit, 'h' | 'd' | 'w') {
        return Err(format!(
            "invalid duration unit in {trimmed:?}; expected h, d, or w"
        ));
    }
    index += 1;
    if index != bytes.len() {
        return Err(format!(
            "invalid duration unit in {trimmed:?}; expected h, d, or w"
        ));
    }

    let amount: f64 = amount_str.parse().map_err(|_| {
        format!("invalid duration amount in {trimmed:?}; expected a number like 1 or 2.5")
    })?;
    if !amount.is_finite() || amount <= 0.0 {
        return Err(format!(
            "duration amount must be greater than zero in {trimmed:?}"
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

/// Reads an optional estimate sequence from YAML without validating durations.
/// Missing, empty, wrong-length, or non-string entries become `None`.
pub fn parse_estimate_yaml(value: Option<&YamlValue>) -> Option<WorkPackageEstimate> {
    let value = value?;
    let items = value.as_sequence()?;
    if items.len() != 3 {
        return None;
    }

    let mut tokens = [String::new(), String::new(), String::new()];
    for (index, item) in items.iter().enumerate() {
        tokens[index] = item.as_str()?.to_string();
    }
    Some(tokens)
}

/// Builds a YAML sequence for a validated estimate triple.
pub fn estimate_yaml_value(estimate: &WorkPackageEstimate) -> YamlValue {
    YamlValue::Sequence(
        estimate
            .iter()
            .map(|token| YamlValue::from(token.as_str()))
            .collect(),
    )
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
    fn normalizes_space_before_unit() {
        let parsed = parse_duration_token("1 w").unwrap();
        assert_eq!(parsed.normalized, "1w");
    }

    #[test]
    fn parse_estimate_yaml_is_lenient() {
        assert_eq!(parse_estimate_yaml(None), None);
        assert_eq!(
            parse_estimate_yaml(Some(&YamlValue::Sequence(vec![
                YamlValue::from("4w"),
                YamlValue::from("2w"),
                YamlValue::from("1w"),
            ]))),
            Some(["4w".into(), "2w".into(), "1w".into()])
        );
        assert_eq!(
            parse_estimate_yaml(Some(&YamlValue::Sequence(vec![
                YamlValue::from("1w"),
                YamlValue::from("2w"),
            ]))),
            None
        );
        assert_eq!(
            parse_estimate_yaml(Some(&YamlValue::from("1w"))),
            None
        );
    }
}
