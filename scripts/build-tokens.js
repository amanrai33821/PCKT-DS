/**
 * ============================================
 * DESIGN TOKEN BUILD SCRIPT
 * ============================================
 *
 * Features:
 * ✅ Reads nested design token JSON
 * ✅ Supports Light + Dark themes
 * ✅ Removes unwanted root prefixes
 * ✅ Generates:
 *    - dist/root.css
 *    - dist/tailwind.colors.js
 * ✅ Sorts tokens alphabetically
 * ✅ Detects:
 *    - removed tokens
 *    - renamed tokens
 *    - light/dark mismatch
 * ✅ Saves snapshot for future diff checks
 *
 * ============================================
 */

const fs = require("fs");

// ============================================
// CONFIG
// ============================================

const INPUT_FILE = "./tokens/tokens.json";
const OUTPUT_DIR = "./dist";
const SNAPSHOT_FILE = `${OUTPUT_DIR}/tokens.snapshot.json`;

// Root-level groups to REMOVE from final token names
// Example:
// colours-black-100 → black-100
const IGNORED_ROOTS = [
    "assetmapped",
    "purposemapped",
    "colours",
];

// ============================================
// HELPERS
// ============================================

// Convert token names to kebab-case
// Example:
// "Red Primary" → "red-primary"
const normalize = (str) =>
    str
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

// Convert:
// rgba(33, 101, 135, 1)
// →
// 33, 101, 135
const rgbaToRgb = (rgba) => {
    const match = rgba.match(/rgba?\(([^)]+)\)/);

    if (!match) {
        throw new Error(`❌ Invalid RGBA value: ${rgba}`);
    }

    return match[1]
        .split(",")
        .slice(0, 3)
        .map((v) => v.trim())
        .join(", ");
};

// ============================================
// LOAD INPUT
// ============================================

const input = JSON.parse(
    fs.readFileSync(INPUT_FILE, "utf-8")
);

// Final flattened tokens
let lightVars = {};
let darkVars = {};

// ============================================
// RECURSIVE TOKEN WALKER
// ============================================

function walk(obj, path = []) {

    Object.entries(obj).forEach(([key, val]) => {

        const cleanKey = normalize(key);
        console.log(cleanKey);
        // Remove unwanted root prefixes
        const shouldIgnore =
            path.length === 0 &&
            IGNORED_ROOTS.includes(cleanKey);

        const currentPath = shouldIgnore
            ? path
            : [...path, cleanKey];

        // ------------------------------------
        // FINAL TOKEN NODE
        // ------------------------------------

        if (
            val?.type === "color" &&
            val?.value?.light &&
            val?.value?.dark
        ) {
            const tokenName = currentPath.join("-");

            lightVars[tokenName] = rgbaToRgb(
                val.value.light
            );

            darkVars[tokenName] = rgbaToRgb(
                val.value.dark
            );

            return;
        }

        // ------------------------------------
        // CONTINUE RECURSION
        // ------------------------------------

        if (
            typeof val === "object" &&
            val !== null
        ) {
            walk(val, currentPath);
        }
    });
}

// Start parsing entire token JSON
walk(input);

// ============================================
// VALIDATE LIGHT/DARK CONSISTENCY
// ============================================

const lightKeys = Object.keys(lightVars);
const darkKeys = Object.keys(darkVars);

const missingInDark = lightKeys.filter(
    (k) => !darkVars[k]
);

const missingInLight = darkKeys.filter(
    (k) => !lightVars[k]
);

if (
    missingInDark.length ||
    missingInLight.length
) {

    console.error(
        "\n❌ Light/Dark mismatch detected!"
    );

    if (missingInDark.length) {
        console.error("\nMissing in DARK:");

        missingInDark.forEach((k) =>
            console.error("  -", k)
        );
    }

    if (missingInLight.length) {
        console.error("\nMissing in LIGHT:");

        missingInLight.forEach((k) =>
            console.error("  -", k)
        );
    }

    process.exit(1);
}

// ============================================
// SORT TOKENS
// ============================================

// Stable git diffs
const sortedKeys = [...lightKeys].sort();

// ============================================
// VALIDATE TOKEN NAMES
// ============================================

sortedKeys.forEach((key) => {

    // Prevent uppercase/spaces
    if (/[A-Z\s]/.test(key)) {
        throw new Error(
            `❌ Invalid token name: ${key}`
        );
    }
});

// ============================================
// LOAD PREVIOUS SNAPSHOT
// ============================================

let previous = {};

if (fs.existsSync(SNAPSHOT_FILE)) {
    previous = JSON.parse(
        fs.readFileSync(
            SNAPSHOT_FILE,
            "utf-8"
        )
    );
}

// ============================================
// DIFF CHECK
// ============================================

const added = [];
const removed = [];
const changed = [];

// Detect added + updated
sortedKeys.forEach((key) => {

    if (!previous.light?.[key]) {
        added.push(key);
    }
    else if (
        previous.light[key] !==
        lightVars[key]
    ) {
        changed.push(key);
    }
});

// Detect removed tokens
Object.keys(previous.light || {}).forEach(
    (key) => {

        if (!lightVars[key]) {
            removed.push(key);
        }
    }
);

// ============================================
// LOG CHANGES
// ============================================

if (added.length) {

    console.log("\n🟢 Added tokens:");

    added.forEach((k) =>
        console.log("  +", k)
    );
}

if (changed.length) {

    console.log("\n🟡 Updated tokens:");

    changed.forEach((k) =>
        console.log("  ~", k)
    );
}

if (removed.length) {

    console.log("\n🔴 Removed tokens:");

    removed.forEach((k) =>
        console.log("  -", k)
    );
}

// ============================================
// FAIL ON BREAKING CHANGE
// ============================================

// Removed token = breaking change
// Rename also appears as remove + add
if (removed.length) {

    console.error(
        "\n❌ Breaking change detected (removed or renamed token)"
    );

    process.exit(1);
}

// ============================================
// ENSURE DIST FOLDER EXISTS
// ============================================

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
}

// ============================================
// GENERATE root.css
// ============================================

let css = `:root {\n`;

sortedKeys.forEach((key) => {

    css += `  --${key}: ${lightVars[key]};\n`;
});

css += `}\n\n.dark {\n`;

sortedKeys.forEach((key) => {

    css += `  --${key}: ${darkVars[key]};\n`;
});

css += `}\n`;

fs.writeFileSync(
    `${OUTPUT_DIR}/root.css`,
    css
);

// ============================================
// GENERATE tailwind.colors.js
// ============================================

const colors = {};

sortedKeys.forEach((key) => {

    colors[key] =
        `rgba(var(--${key}))`;
});

fs.writeFileSync(
    `${OUTPUT_DIR}/tailwind.colors.js`,
    "module.exports = " +
    JSON.stringify(colors, null, 2)
);

// ============================================
// SAVE SNAPSHOT
// ============================================

fs.writeFileSync(
    SNAPSHOT_FILE,
    JSON.stringify(
        {
            light: lightVars,
            dark: darkVars,
        },
        null,
        2
    )
);

// ============================================
// DONE
// ============================================

console.log(
    "\n✅ Tokens built successfully"
);