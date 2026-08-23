use std::{
    env, fs, io,
    path::{Path, PathBuf},
    process::Command,
};

struct Config {
    tmtheme: String,
    tmtheme_license: String,
    variants: Vec<Variant>,
}

struct Variant {
    name: String,
    mode: String,
    template: String,
    colors: Vec<(String, String)>,
}

enum Section {
    Root,
    Variant,
    Colors,
}

fn main() {
    if let Err(error) = generate() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn generate() -> io::Result<()> {
    let script_dir = find_script_dir()?;
    let repo_dir = script_dir
        .parent()
        .ok_or_else(|| io::Error::other("failed to find repository root"))?;
    let config = parse_variants_toml(&fs::read_to_string(script_dir.join("variants.toml"))?)?;
    let readme = fs::read_to_string(script_dir.join("README.md"))?;

    for variant in &config.variants {
        let lower_name = variant.name.to_ascii_lowercase().replace(' ', "-");
        let wd = repo_dir.join(format!("{lower_name}.yazi"));
        fs::create_dir_all(&wd)?;

        let mut flavor = fs::read_to_string(script_dir.join("templates").join(&variant.template))?;
        for (key, color) in &variant.colors {
            flavor = flavor.replace(&format!("${{{key}}}"), color);
        }
        flavor = flavor.replace("${variant}", &lower_name);
        fs::write(wd.join("flavor.toml"), flavor)?;

        let generated_readme = readme
            .replace("${mode}", &variant.mode)
            .replace("${variant}", &lower_name)
            .replace("${variant_cap}", &variant.name);
        fs::write(wd.join("README.md"), generated_readme)?;

        fs::write(
            wd.join("tmtheme.xml"),
            fetch_bytes(&config.tmtheme, &wd.join("tmtheme.xml"))?,
        )?;
        fs::write(
            wd.join("LICENSE-tmtheme"),
            fetch_bytes(&config.tmtheme_license, &wd.join("LICENSE-tmtheme"))?,
        )?;
    }

    Ok(())
}

fn find_script_dir() -> io::Result<PathBuf> {
    let cwd = env::current_dir()?;
    let from_repo_root = cwd.join("scripts");
    let from_scripts_dir = cwd.clone();

    if from_repo_root
        .join("templates")
        .join("tokyonight.toml")
        .is_file()
    {
        return Ok(from_repo_root);
    }

    if from_scripts_dir
        .join("templates")
        .join("tokyonight.toml")
        .is_file()
    {
        return Ok(from_scripts_dir);
    }

    Err(io::Error::other(
        "run from the repository root or the scripts directory",
    ))
}

fn parse_variants_toml(input: &str) -> io::Result<Config> {
    let mut config = Config {
        tmtheme: String::new(),
        tmtheme_license: String::new(),
        variants: Vec::new(),
    };
    let mut section = Section::Root;

    for (index, raw_line) in input.lines().enumerate() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        if line == "[[variants]]" {
            config.variants.push(Variant {
                name: String::new(),
                mode: String::new(),
                template: String::new(),
                colors: Vec::new(),
            });
            section = Section::Variant;
            continue;
        }

        if line == "[variants.colors]" {
            if config.variants.is_empty() {
                return Err(io::Error::other(format!(
                    "[variants.colors] before [[variants]] at line {}",
                    index + 1
                )));
            }
            section = Section::Colors;
            continue;
        }

        let (key, value) = parse_key_value(line).ok_or_else(|| {
            io::Error::other(format!(
                "unsupported TOML syntax at line {}: {}",
                index + 1,
                line
            ))
        })?;

        match section {
            Section::Root => match key {
                "tmtheme" => config.tmtheme = value.to_owned(),
                "tmtheme_license" => config.tmtheme_license = value.to_owned(),
                _ => {
                    return Err(io::Error::other(format!(
                        "unknown root key at line {}: {}",
                        index + 1,
                        key
                    )));
                }
            },
            Section::Variant => {
                let variant = config
                    .variants
                    .last_mut()
                    .ok_or_else(|| io::Error::other("variant key before [[variants]]"))?;
                match key {
                    "name" => variant.name = value.to_owned(),
                    "mode" => variant.mode = value.to_owned(),
                    "template" => variant.template = value.to_owned(),
                    _ => {
                        return Err(io::Error::other(format!(
                            "unknown variant key at line {}: {}",
                            index + 1,
                            key
                        )));
                    }
                }
            }
            Section::Colors => {
                let variant = config
                    .variants
                    .last_mut()
                    .ok_or_else(|| io::Error::other("color key before [[variants]]"))?;
                variant.colors.push((key.to_owned(), value.to_owned()));
            }
        }
    }

    if config.tmtheme.is_empty() || config.tmtheme_license.is_empty() {
        return Err(io::Error::other(
            "variants.toml must define tmtheme and tmtheme_license",
        ));
    }
    if config.variants.is_empty() {
        return Err(io::Error::other(
            "variants.toml must define at least one [[variants]] entry",
        ));
    }
    for variant in &config.variants {
        if variant.name.is_empty() || variant.mode.is_empty() || variant.template.is_empty() {
            return Err(io::Error::other(
                "each variant must define name, mode, and template",
            ));
        }
    }

    Ok(config)
}

fn parse_key_value(line: &str) -> Option<(&str, &str)> {
    let (key, value) = line.split_once('=')?;
    let key = key.trim();
    let value = value.trim();
    let value = value.strip_prefix('"')?.strip_suffix('"')?;

    if key.is_empty() || !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return None;
    }

    Some((key, value))
}

fn fetch_bytes(url: &str, fallback_path: &Path) -> io::Result<Vec<u8>> {
    if let Ok(output) = Command::new("curl")
        .args(["-fsSL", "--connect-timeout", "5", url])
        .output()
    {
        if output.status.success() {
            return Ok(output.stdout);
        }
    }

    if let Ok(output) = Command::new("wget")
        .args(["-qO", "-", "--timeout=5", "--tries=1", url])
        .output()
    {
        if output.status.success() {
            return Ok(output.stdout);
        }
    }

    eprintln!(
        "Failed to fetch {}; using existing {} instead.",
        url,
        fallback_path.display()
    );
    fs::read(fallback_path)
}
