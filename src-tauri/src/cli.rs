use std::path::PathBuf;
use std::process;

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct CliOptions {
    pub initial_roadmap_root: Option<PathBuf>,
}

const HELP: &str = "\
Usage: bellman-gui [OPTIONS] [ROADMAP_ROOT]

Arguments:
  ROADMAP_ROOT  Initial bellman roadmap root directory

Options:
  -r, --roadmap PATH  Initial bellman roadmap root directory
  -h, --help          Print help
";

pub fn parse_cli_args(args: impl IntoIterator<Item = String>) -> CliOptions {
    let mut iter = args.into_iter();
    let mut initial_roadmap_root = None;

    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "-h" | "--help" => {
                print!("{HELP}");
                process::exit(0);
            }
            "-r" | "--roadmap" => match iter.next() {
                Some(path) => initial_roadmap_root = Some(PathBuf::from(path)),
                None => {
                    eprintln!("error: --roadmap requires a path");
                    process::exit(1);
                }
            },
            other if other.starts_with('-') => {
                eprintln!("error: unknown option {other}");
                process::exit(1);
            }
            path => {
                if initial_roadmap_root.is_some() {
                    eprintln!("error: unexpected extra argument {path}");
                    process::exit(1);
                }
                initial_roadmap_root = Some(PathBuf::from(path));
            }
        }
    }

    CliOptions {
        initial_roadmap_root,
    }
}

pub fn cli_options_from_env() -> CliOptions {
    parse_cli_args(std::env::args().skip(1))
}

#[cfg(test)]
mod tests {
    use super::{parse_cli_args, CliOptions};

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_string()).collect()
    }

    #[test]
    fn returns_empty_options_without_args() {
        assert_eq!(
            parse_cli_args(args(&[])),
            CliOptions {
                initial_roadmap_root: None
            }
        );
    }

    #[test]
    fn accepts_positional_roadmap_root() {
        assert_eq!(
            parse_cli_args(args(&["/tmp/my-roadmap"])),
            CliOptions {
                initial_roadmap_root: Some("/tmp/my-roadmap".into())
            }
        );
    }

    #[test]
    fn accepts_long_flag_roadmap_root() {
        assert_eq!(
            parse_cli_args(args(&["--roadmap", "/tmp/my-roadmap"])),
            CliOptions {
                initial_roadmap_root: Some("/tmp/my-roadmap".into())
            }
        );
    }

    #[test]
    fn accepts_short_flag_roadmap_root() {
        assert_eq!(
            parse_cli_args(args(&["-r", "/tmp/my-roadmap"])),
            CliOptions {
                initial_roadmap_root: Some("/tmp/my-roadmap".into())
            }
        );
    }
}
