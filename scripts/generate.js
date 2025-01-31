import fs, { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))

const VARIANTS = {
	"Tokyonight Day": {
		// Core Colors
		text: "#3760bf",
		text_secondary: "#6172b0",
		text_inverted: "#b4b5b9",
		background: "#e1e2e7",
		background_alt: "#d0d5e3",

		// Surfaces
		surface: "#c4c8da",
		surface1: "#a8aecb",
		surface2: "#b7c1e3",
		surface3: "#cbd9e0",

		// Primary Palette
		primary: "#2e7de9",
		secondary: "#9854f1",
		tertiary: "#7847bd",

		// Accents
		accent: "#07879d",
		border_accent: "#4094a3",

		// Status Colors
		red: "#f52a65",
		red_dark: "#c64343",
		green: "#587539",
		green_light: "#387068",
		yellow: "#8c6c3e",
		orange: "#b15c00",

		// Cyan Variants
		cyan: "#38919f",
		cyan_light: "#007197",

		// Blue Variants
		blue_dark: "#7890dd",

		// Text Variants
		onSurface1: "#a8aecb",
		onSurface2: "#a1a6c5",
		onSurface3: "#848cb5",

		_light: true,
		_template: "tokyonight.toml",
		_tmtheme: "https://raw.githubusercontent.com/enkia/enki-theme/refs/heads/master/scheme/Enki-Tokyo-Night.tmTheme",
		_tmthemeLicense: "https://raw.githubusercontent.com/enkia/enki-theme/refs/heads/master/LICENSE",
	},
	"Tokyonight Moon": {
		// Core Colors
		text: "#c8d3f5",
		text_secondary: "#828bb8",
		text_inverted: "#1b1d2b",
		background: "#222436",
		background_alt: "#1e2030",

		// Surfaces
		surface: "#2f334d",
		surface1: "#3b4261",
		surface2: "#2d3f76",
		surface3: "#203346",

		// Primary Palette
		primary: "#82aaff",
		secondary: "#c099ff",
		tertiary: "#fca7ea",

		// Accents
		accent: "#0db9d7",
		border_accent: "#589ed7",

		// Status Colors
		red: "#ff757f",
		red_dark: "#c53b53",
		green: "#c3e88d",
		green_light: "#4fd6be",
		yellow: "#ffc777",
		orange: "#ff966c",

		// Cyan Variants
		cyan: "#41a6b5", //
		cyan_light: "#86e1fc",

		// Blue Variants
		blue_dark: "#3e68d7",

		// Text Variants
		onSurface1: "#3b4261",
		onSurface2: "#444a73",
		onSurface3: "#636da6",

		_template: "tokyonight.toml",
		_tmtheme: "https://raw.githubusercontent.com/enkia/enki-theme/refs/heads/master/scheme/Enki-Tokyo-Night.tmTheme",
		_tmthemeLicense: "https://raw.githubusercontent.com/enkia/enki-theme/refs/heads/master/LICENSE",
	},
	"Tokyonight Night": {
		// Core Colors
		text: "#c0caf5",
		text_secondary: "#a9b1d6",
		text_inverted: "#15161e",
		background: "#1a1b26",
		background_alt: "#16161e",

		// Surfaces
		surface: "#292e42",
		surface1: "#3b4261",
		surface2: "#283457",
		surface3: "#192b38",

		// Primary Palette
		primary: "#7aa2f7",
		secondary: "#bb9af7",
		tertiary: "#9d7cd8",

		// Accents
		accent: "#0db9d7",
		border_accent: "#27a1b9",

		// Status Colors
		red: "#f7768e",
		red_dark: "#db4b4b",
		green: "#9ece6a",
		green_light: "#73daca",
		yellow: "#e0af68",
		orange: "#ff9e64",

		// Cyan Variants
		cyan: "#41a6b5",
		cyan_light: "#7dcfff",

		// Blue Variants
		blue_dark: "#3d59a1",

		// Text Variants
		onSurface1: "#3b4261",
		onSurface2: "#414868",
		onSurface3: "#565f89",

		_template: "tokyonight.toml",
		_tmtheme: "https://raw.githubusercontent.com/enkia/enki-theme/refs/heads/master/scheme/Enki-Tokyo-Night.tmTheme",
		_tmthemeLicense: "https://raw.githubusercontent.com/enkia/enki-theme/refs/heads/master/LICENSE",
	},
	"Tokyonight Storm": {
		// Core Colors
		text: "#c0caf5",
		text_secondary: "#a9b1d6",
		text_inverted: "#1d202f",
		background: "#24283b",
		background_alt: "#1f2335",

		// Surfaces
		surface: "#292e42",
		surface1: "#3b4261",
		surface2: "#2e3c64",
		surface3: "#22374b",

		// Primary Palette
		primary: "#7aa2f7",
		secondary: "#bb9af7",
		tertiary: "#9d7cd8",

		// Accents
		accent: "#0db9d7",
		border_accent: "#29a4bd",

		// Status Colors
		red: "#f7768e",
		red_dark: "#db4b4b",
		green: "#9ece6a",
		green_light: "#73daca",
		yellow: "#e0af68",
		orange: "#ff9e64",

		// Cyan Variants
		cyan: "#41a6b5",
		cyan_light: "#7dcfff",

		// Blue Variants
		blue_dark: "#3d59a1",

		// Text Variants
		onSurface1: "#3b4261",
		onSurface2: "#414868",
		onSurface3: "#565f89",


		_template: "tokyonight.toml",
		_tmtheme: "https://raw.githubusercontent.com/enkia/enki-theme/refs/heads/master/scheme/Enki-Tokyo-Night.tmTheme",
		_tmthemeLicense: "https://raw.githubusercontent.com/enkia/enki-theme/refs/heads/master/LICENSE",
	},
}

async function generate() {
	const readme = await readFile(join(__dirname, "./README.md"), "utf8")

	for (const [name, colors] of Object.entries(VARIANTS)) {
		const lowerName = name.toLowerCase().replace(/ /g, "-")
		const wd = join(__dirname, `../${lowerName}.yazi`)
		try {
			await access(wd)
		} catch {
			await mkdir(wd)
		}

		// Dynamically load template
		const template = await readFile(
			join(__dirname, "./templates", colors._template),
			"utf8"
		);

		// Process replacements
		let s = template;
		for (const [name, color] of Object.entries(colors)) {
			s = s.replaceAll(`\${${name}}`, color)
		}

		// Write files
		await writeFile(join(wd, "flavor.toml"), s.replaceAll("${variant}", lowerName)
		);

		await writeFile(
			join(wd, "README.md"),
			readme
				.replaceAll("${mode}", colors._light ? "light" : "dark")
				.replaceAll("${variant}", lowerName)
				.replaceAll("${variant_cap}", name)
		);

		// tmtheme.xml
		await writeFile(join(wd, "tmtheme.xml"), await fetch(colors._tmtheme).then(r => r.text()))

		// LICENSE-tmtheme
		await writeFile(join(wd, "LICENSE-tmtheme"), await fetch(colors._tmthemeLicense).then(r => r.text()))
	}
}

generate().catch(console.error);
