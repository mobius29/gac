import type { NoiseAssessment } from "../types.js";

const LOCKFILE_NAMES = new Set([
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
  "cargo.lock",
  "gemfile.lock",
  "composer.lock",
  "podfile.lock",
  "packages.lock.json",
]);

const COVERAGE_PATTERNS = [/^coverage\//, /\/coverage\//];
const BUILD_OUTPUT_PATTERNS = [
  /^dist\//,
  /^build\//,
  /^out\//,
  /^target\//,
  /^lib\//,
  /^storybook-static\//,
  /^public\/build\//,
  /^\.next\//,
  /^\.nuxt\//,
  /\/dist\//,
  /\/build\//,
];
const GENERATED_PATTERNS = [/^generated\//, /^__generated__\//, /\/generated\//, /\/__generated__\//];
const MINIFIED_PATTERN = /\.min\.[a-z0-9]+$/i;
const SOURCE_MAP_PATTERN = /\.map$/i;
const GENERATED_MARKER_PATTERN = /(@generated|auto-generated|automatically generated|do not edit)/i;

function normalizePathForMatch(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

function getBasename(path: string): string {
  const segments = path.split("/");
  return segments[segments.length - 1] ?? path;
}

function hasGeneratedMarker(patchText?: string): boolean {
  if (!patchText) {
    return false;
  }
  return GENERATED_MARKER_PATTERN.test(patchText);
}

function looksLikeMinifiedPatch(patchText?: string): boolean {
  if (!patchText) {
    return false;
  }

  const addedLines = patchText
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1))
    .filter((line) => line.length > 0);

  if (addedLines.length < 3) {
    return false;
  }

  const longLineCount = addedLines.filter((line) => line.length >= 180).length;
  if (longLineCount === 0) {
    return false;
  }

  const totalLength = addedLines.reduce((sum, line) => sum + line.length, 0);
  if (totalLength === 0) {
    return false;
  }

  const whitespaceChars = addedLines.reduce((sum, line) => {
    const matches = line.match(/\s/g);
    return sum + (matches?.length ?? 0);
  }, 0);

  const longLineRatio = longLineCount / addedLines.length;
  const whitespaceRatio = whitespaceChars / totalLength;
  return longLineRatio >= 0.6 && whitespaceRatio < 0.08;
}

export function detectNoise(filePath: string, isBinary: boolean, patchText?: string): NoiseAssessment {
  const normalizedPath = normalizePathForMatch(filePath);
  const basename = getBasename(normalizedPath);

  if (isBinary) {
    return { isNoise: true, reason: "binary", confidence: 0.98 };
  }

  if (LOCKFILE_NAMES.has(basename)) {
    return { isNoise: true, reason: "lockfile", confidence: 0.97 };
  }

  if (SOURCE_MAP_PATTERN.test(normalizedPath)) {
    return { isNoise: true, reason: "sourcemap", confidence: 0.96 };
  }

  if (MINIFIED_PATTERN.test(basename) || looksLikeMinifiedPatch(patchText)) {
    return { isNoise: true, reason: "minified", confidence: 0.93 };
  }

  if (COVERAGE_PATTERNS.some((pattern) => pattern.test(normalizedPath))) {
    return { isNoise: true, reason: "coverage", confidence: 0.96 };
  }

  if (BUILD_OUTPUT_PATTERNS.some((pattern) => pattern.test(normalizedPath))) {
    return { isNoise: true, reason: "build_artifact", confidence: 0.91 };
  }

  if (GENERATED_PATTERNS.some((pattern) => pattern.test(normalizedPath)) || hasGeneratedMarker(patchText)) {
    return { isNoise: true, reason: "generated", confidence: 0.88 };
  }

  return { isNoise: false, confidence: 0.9, reason: "unknown" };
}
