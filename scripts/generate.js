import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))

async function generate() {
	const config = parseVariantsToml(
		await readFile(join(__dirname, "./variants.toml"), "utf8")
	)
	const readme = await readFile(join(__dirname, "./README.md"), "utf8")

	for (const variant of config.variants) {
		const lowerName = variant.name.toLowerCase().replace(/ /g, "-")
		const wd = join(__dirname, `../${lowerName}.yazi`)
		try {
			await access(wd)
		} catch {
			await mkdir(wd)
		}

		const template = await readFile(
			join(__dirname, "./templates", variant.template),
			"utf8"
		)

		let flavor = template
		for (const [name, color] of Object.entries(variant.colors)) {
			flavor = flavor.replaceAll(`\${${name}}`, color)
		}
		flavor = flavor.replaceAll("${variant}", lowerName)

		await writeFile(join(wd, "flavor.toml"), flavor)

		await writeFile(
			join(wd, "README.md"),
			readme
				.replaceAll("${mode}", variant.mode)
				.replaceAll("${variant}", lowerName)
				.replaceAll("${variant_cap}", variant.name)
		)

		await writeFile(
			join(wd, "tmtheme.xml"),
			await fetchText(config.tmtheme, join(wd, "tmtheme.xml"))
		)

		await writeFile(
			join(wd, "LICENSE-tmtheme"),
			await fetchText(config.tmthemeLicense, join(wd, "LICENSE-tmtheme"))
		)
	}
}

function parseVariantsToml(input) {
	const config = {
		tmtheme: "",
		tmthemeLicense: "",
		variants: [],
	}
	let section = "root"
	let currentVariant = undefined

	for (const [index, rawLine] of input.split(/\r?\n/).entries()) {
		const line = rawLine.trim()
		if (!line || line.startsWith("#")) {
			continue
		}

		if (line === "[[variants]]") {
			currentVariant = { name: "", mode: "", template: "", colors: {} }
			config.variants.push(currentVariant)
			section = "variant"
			continue
		}

		if (line === "[variants.colors]") {
			if (!currentVariant) {
				throw new Error(`[variants.colors] before [[variants]] at line ${index + 1}`)
			}
			section = "colors"
			continue
		}

		const match = line.match(/^([A-Za-z0-9_]+)\s*=\s*"([^"]*)"$/)
		if (!match) {
			throw new Error(`Unsupported TOML syntax at line ${index + 1}: ${line}`)
		}

		const [, key, value] = match
		if (section === "root") {
			if (key === "tmtheme") {
				config.tmtheme = value
			} else if (key === "tmtheme_license") {
				config.tmthemeLicense = value
			} else {
				throw new Error(`Unknown root key at line ${index + 1}: ${key}`)
			}
		} else if (section === "variant") {
			currentVariant[key] = value
		} else if (section === "colors") {
			currentVariant.colors[key] = value
		}
	}

	if (!config.tmtheme || !config.tmthemeLicense) {
		throw new Error("variants.toml must define tmtheme and tmtheme_license")
	}
	if (config.variants.length === 0) {
		throw new Error("variants.toml must define at least one [[variants]] entry")
	}
	for (const variant of config.variants) {
		if (!variant.name || !variant.mode || !variant.template) {
			throw new Error("each variant must define name, mode, and template")
		}
	}

	return config
}

async function fetchText(url, fallbackPath) {
	try {
		const response = await fetch(url)
		if (!response.ok) {
			throw new Error(`HTTP ${response.status} ${response.statusText}`)
		}
		return await response.text()
	} catch (error) {
		try {
			console.warn(
				`Failed to fetch ${url}; using existing ${fallbackPath} instead.`
			)
			return await readFile(fallbackPath, "utf8")
		} catch {
			throw error
		}
	}
}

generate().catch(error => {
	console.error(error)
	process.exitCode = 1
})
