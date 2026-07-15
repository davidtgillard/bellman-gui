//! Parse `bellman validate` output into structured dependency warnings.

use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct DependencyWarningDto {
    pub line: Option<u32>,
    pub message: String,
}

#[derive(Debug, Clone)]
struct ParsedIssue {
    path: String,
    line: Option<u32>,
    message: String,
}

/// Returns true when a bellman message refers to a dependency problem.
pub fn is_dependency_message(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    lower.contains("dependency")
        || lower.contains("mandatory precedence cycle among work scopes")
}

fn strip_warning_prefix(line: &str) -> &str {
    line.strip_prefix("warning: ").unwrap_or(line).trim()
}

fn parse_issue_line(line: &str) -> Option<ParsedIssue> {
    let trimmed = strip_warning_prefix(line);
    let (path, message) = trimmed.split_once(": ")?;
    if path.is_empty() || message.is_empty() {
        return None;
    }

    let line = parse_line_number(message);
    Some(ParsedIssue {
        path: path.to_string(),
        line,
        message: message.to_string(),
    })
}

fn parse_line_number(message: &str) -> Option<u32> {
    let marker = "at line ";
    let start = message.find(marker)? + marker.len();
    let rest = &message[start..];
    let end = rest
        .find(|ch: char| !ch.is_ascii_digit())
        .unwrap_or(rest.len());
    rest[..end].parse().ok()
}

fn paths_match(issue_path: &str, source_path: &Path) -> bool {
    let source = source_path.to_string_lossy();
    if issue_path == source.as_ref() {
        return true;
    }
    let source_file_name = source_path.file_name().and_then(|name| name.to_str());
    let issue_file_name = Path::new(issue_path).file_name().and_then(|name| name.to_str());
    if let (Some(left), Some(right)) = (source_file_name, issue_file_name) {
        if left == right && issue_path.ends_with(left) {
            return true;
        }
    }
    source.ends_with(issue_path)
        || issue_path.ends_with(source.as_ref())
        || source
            .rsplit('/')
            .take(3)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<String>()
            .ends_with(issue_path.trim_start_matches("./"))
}

/// Collect dependency warnings for one markdown file from bellman validate output lines.
pub fn dependency_warnings_for_file(
    output_lines: &[String],
    source_path: &Path,
    include_scope_cycle: bool,
) -> Vec<DependencyWarningDto> {
    let mut warnings = Vec::new();

    for line in output_lines {
        let Some(issue) = parse_issue_line(line) else {
            continue;
        };

        if !is_dependency_message(&issue.message) {
            continue;
        }

        if issue.message.contains("mandatory precedence cycle among work scopes") {
            if include_scope_cycle {
                warnings.push(DependencyWarningDto {
                    line: None,
                    message: issue.message,
                });
            }
            continue;
        }

        if !paths_match(&issue.path, source_path) {
            continue;
        }

        warnings.push(DependencyWarningDto {
            line: issue.line,
            message: issue.message,
        });
    }

    warnings
}

/// Split bellman CLI stdout/stderr into individual non-empty lines.
pub fn split_output_lines(stdout: &str, stderr: &str) -> Vec<String> {
    let mut lines = Vec::new();
    for chunk in [stdout, stderr] {
        for line in chunk.lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                lines.push(trimmed.to_string());
            }
        }
    }
    lines
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn parses_dependency_syntax_line_number() {
        let lines = vec![
            "initiatives/foo.md: invalid dependency syntax at line 12: '- bad'".to_string(),
        ];
        let warnings = dependency_warnings_for_file(
            &lines,
            Path::new("/roadmap/initiatives/foo.md"),
            true,
        );
        assert_eq!(warnings.len(), 1);
        assert_eq!(warnings[0].line, Some(12));
        assert!(warnings[0].message.contains("invalid dependency syntax"));
    }

    #[test]
    fn parses_unknown_predecessor_for_matching_file() {
        let lines = vec![
            "initiatives/foo.md: unknown dependency predecessor 'missing'".to_string(),
        ];
        let warnings = dependency_warnings_for_file(
            &lines,
            Path::new("/roadmap/initiatives/foo.md"),
            true,
        );
        assert_eq!(warnings.len(), 1);
        assert_eq!(warnings[0].line, None);
    }

    #[test]
    fn ignores_issues_for_other_files() {
        let lines = vec![
            "initiatives/other.md: unknown dependency predecessor 'x'".to_string(),
        ];
        let warnings = dependency_warnings_for_file(
            &lines,
            Path::new("/roadmap/initiatives/foo.md"),
            true,
        );
        assert!(warnings.is_empty());
    }

    #[test]
    fn includes_scope_cycle_when_requested() {
        let lines = vec![
            "/roadmap: mandatory precedence cycle among work scopes".to_string(),
        ];
        let warnings = dependency_warnings_for_file(
            &lines,
            Path::new("/roadmap/initiatives/foo.md"),
            true,
        );
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].message.contains("precedence cycle"));
    }

    #[test]
    fn parses_warning_prefix_lines() {
        let lines = vec![
            "warning: initiatives/foo.md: ambiguous dependency reference 'bar'".to_string(),
        ];
        let warnings = dependency_warnings_for_file(
            &lines,
            Path::new("/roadmap/initiatives/foo.md"),
            true,
        );
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].message.contains("ambiguous dependency"));
    }
}
