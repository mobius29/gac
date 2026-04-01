import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { parseDotEnv } from "../utils/env.js";

export interface AppConfig {
  llmProvider?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  openaiBaseUrl?: string;
}

export interface LoadedConfig {
  config: AppConfig;
  loadedFiles: string[];
}

export interface ConfigLoaderOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
}

const CONFIG_FILE_NAME = ".gac.config";

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseConfigFile(filePath: string): AppConfig {
  const objectValue = parseDotEnv(readFileSync(filePath, "utf8"));
  return {
    llmProvider: asString(objectValue.GIT_AUTO_COMMIT_LLM_PROVIDER ?? objectValue.LLM_PROVIDER),
    openaiApiKey: asString(objectValue.OPENAI_API_KEY),
    openaiModel: asString(objectValue.OPENAI_MODEL),
    openaiBaseUrl: asString(objectValue.OPENAI_BASE_URL),
  };
}

function mergeConfig(base: AppConfig, override: AppConfig): AppConfig {
  return {
    llmProvider: override.llmProvider ?? base.llmProvider,
    openaiApiKey: override.openaiApiKey ?? base.openaiApiKey,
    openaiModel: override.openaiModel ?? base.openaiModel,
    openaiBaseUrl: override.openaiBaseUrl ?? base.openaiBaseUrl,
  };
}

function isDescendantOrSame(parentPath: string, childPath: string): boolean {
  const relativePath = relative(parentPath, childPath);
  return (
    relativePath.length === 0 ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

function resolveProjectRoot(cwd: string): string {
  let currentPath = resolve(cwd);

  while (true) {
    if (existsSync(join(currentPath, ".git"))) {
      return currentPath;
    }

    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) {
      return resolve(cwd);
    }

    currentPath = parentPath;
  }
}

function defaultConfigPaths(projectRoot: string, homeDir: string): string[] {
  const resolvedProjectRoot = resolve(projectRoot);
  const resolvedHomeDir = resolve(homeDir);
  const configPaths: string[] = [];

  const appendConfigPath = (dir: string) => {
    const configPath = join(dir, CONFIG_FILE_NAME);
    if (!configPaths.includes(configPath)) {
      configPaths.push(configPath);
    }
  };

  appendConfigPath(resolvedHomeDir);

  if (!isDescendantOrSame(resolvedHomeDir, resolvedProjectRoot)) {
    appendConfigPath(resolvedProjectRoot);
    return configPaths;
  }

  const relativeToHome = relative(resolvedHomeDir, resolvedProjectRoot);
  if (!relativeToHome) {
    return configPaths;
  }

  const segments = relativeToHome.split(sep).filter((segment) => segment.length > 0);
  let currentPath = resolvedHomeDir;

  for (const segment of segments) {
    currentPath = join(currentPath, segment);
    appendConfigPath(currentPath);
  }

  return configPaths;
}

export function loadConfig(options: ConfigLoaderOptions = {}): LoadedConfig {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const homeDir = options.homeDir ?? homedir();
  const projectRoot = resolveProjectRoot(cwd);

  const configuredPath = env.GAC_CONFIG?.trim() || env.GIT_AUTO_COMMIT_CONFIG?.trim();
  const configFiles = configuredPath
    ? [resolve(configuredPath)]
    : defaultConfigPaths(projectRoot, homeDir);

  let mergedConfig: AppConfig = {};
  const loadedFiles: string[] = [];

  for (const filePath of configFiles) {
    if (!existsSync(filePath)) {
      continue;
    }

    mergedConfig = mergeConfig(mergedConfig, parseConfigFile(filePath));
    loadedFiles.push(filePath);
  }

  return {
    config: mergedConfig,
    loadedFiles,
  };
}
