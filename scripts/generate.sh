#!/usr/bin/env bash
set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"

declare TMTHEME_URL=""
declare TMTHEME_LICENSE_URL=""
declare -a VARIANT_NAMES=()
declare -a VARIANT_MODES=()
declare -a VARIANT_TEMPLATES=()
declare -a VARIANT_COLOR_KEYS=()
declare -A VARIANT_COLORS=()

trim() {
	local value="$1"
	value="${value#"${value%%[![:space:]]*}"}"
	value="${value%"${value##*[![:space:]]}"}"
	printf '%s' "$value"
}

parse_variants_toml() {
	local file="$1"
	local section="root"
	local current_index=-1
	local raw_line
	local line
	local key
	local value

	while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
		line="$(trim "$raw_line")"
		[[ -z "$line" || "$line" == \#* ]] && continue

		if [[ "$line" == "[[variants]]" ]]; then
			current_index="${#VARIANT_NAMES[@]}"
			VARIANT_NAMES+=("")
			VARIANT_MODES+=("")
			VARIANT_TEMPLATES+=("")
			VARIANT_COLOR_KEYS+=("")
			section="variant"
			continue
		fi

		if [[ "$line" == "[variants.colors]" ]]; then
			if (( current_index < 0 )); then
				printf '[variants.colors] appeared before [[variants]].\n' >&2
				return 1
			fi
			section="colors"
			continue
		fi

		if [[ "$line" =~ ^([A-Za-z0-9_]+)[[:space:]]*=[[:space:]]*\"([^\"]*)\"$ ]]; then
			key="${BASH_REMATCH[1]}"
			value="${BASH_REMATCH[2]}"
		else
			printf 'Unsupported TOML syntax: %s\n' "$line" >&2
			return 1
		fi

		case "$section" in
			root)
				case "$key" in
					tmtheme) TMTHEME_URL="$value" ;;
					tmtheme_license) TMTHEME_LICENSE_URL="$value" ;;
					*)
						printf 'Unknown root key: %s\n' "$key" >&2
						return 1
						;;
				esac
				;;
			variant)
				case "$key" in
					name) VARIANT_NAMES[$current_index]="$value" ;;
					mode) VARIANT_MODES[$current_index]="$value" ;;
					template) VARIANT_TEMPLATES[$current_index]="$value" ;;
					*)
						printf 'Unknown variant key: %s\n' "$key" >&2
						return 1
						;;
				esac
				;;
			colors)
				VARIANT_COLORS["$current_index:$key"]="$value"
				VARIANT_COLOR_KEYS[$current_index]+="$key"$'\n'
				;;
		esac
	done < "$file"

	if [[ -z "$TMTHEME_URL" || -z "$TMTHEME_LICENSE_URL" ]]; then
		printf 'variants.toml must define tmtheme and tmtheme_license.\n' >&2
		return 1
	fi
	if (( ${#VARIANT_NAMES[@]} == 0 )); then
		printf 'variants.toml must define at least one [[variants]] entry.\n' >&2
		return 1
	fi
}

replace_in_file() {
	local file="$1"
	local placeholder="$2"
	local replacement="$3"

	PLACEHOLDER="$placeholder" REPLACEMENT="$replacement" \
		perl -0pi -e 's/\Q$ENV{PLACEHOLDER}\E/$ENV{REPLACEMENT}/g' "$file"
}

fetch_file() {
	local url="$1"
	local target="$2"
	local tmp_file

	tmp_file="$(mktemp)"

	if command -v curl >/dev/null 2>&1 &&
		curl -fsSL --connect-timeout 5 "$url" -o "$tmp_file" 2>/dev/null; then
		mv "$tmp_file" "$target"
		return
	fi

	if command -v wget >/dev/null 2>&1 &&
		wget -qO "$tmp_file" --timeout=5 --tries=1 "$url" 2>/dev/null; then
		mv "$tmp_file" "$target"
		return
	fi

	rm -f "$tmp_file"

	if [[ -f "$target" ]]; then
		printf 'Failed to fetch %s; using existing %s instead.\n' "$url" "$target" >&2
		return
	fi

	printf 'Failed to fetch %s and no existing %s fallback was found.\n' "$url" "$target" >&2
	return 1
}

generate_variant() {
	local index="$1"
	local name="${VARIANT_NAMES[$index]}"
	local mode="${VARIANT_MODES[$index]}"
	local template="${VARIANT_TEMPLATES[$index]}"
	local lower_name="${name,,}"
	local key
	local wd

	if [[ -z "$name" || -z "$mode" || -z "$template" ]]; then
		printf 'Variant %s must define name, mode, and template.\n' "$index" >&2
		return 1
	fi

	lower_name="${lower_name// /-}"
	wd="$REPO_DIR/$lower_name.yazi"
	mkdir -p "$wd"

	cp "$SCRIPT_DIR/templates/$template" "$wd/flavor.toml"
	while IFS= read -r key; do
		[[ -z "$key" ]] && continue
		replace_in_file "$wd/flavor.toml" "\${$key}" "${VARIANT_COLORS["$index:$key"]}"
	done <<< "${VARIANT_COLOR_KEYS[$index]-}"
	replace_in_file "$wd/flavor.toml" '${variant}' "$lower_name"

	cp "$SCRIPT_DIR/README.md" "$wd/README.md"
	replace_in_file "$wd/README.md" '${mode}' "$mode"
	replace_in_file "$wd/README.md" '${variant}' "$lower_name"
	replace_in_file "$wd/README.md" '${variant_cap}' "$name"

	fetch_file "$TMTHEME_URL" "$wd/tmtheme.xml"
	fetch_file "$TMTHEME_LICENSE_URL" "$wd/LICENSE-tmtheme"
}

parse_variants_toml "$SCRIPT_DIR/variants.toml"

for index in "${!VARIANT_NAMES[@]}"; do
	generate_variant "$index"
done
