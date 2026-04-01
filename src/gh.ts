import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface GhCommandRunner {
  run(args: string[]): { stdout: string; stderr: string; status: number };
}

class DefaultGhCommandRunner implements GhCommandRunner {
  run(args: string[]) {
    const result = spawnSync("gh", args, {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 10,
    });

    if (result.error) {
      throw result.error;
    }

    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      status: result.status ?? 1,
    };
  }
}

function runGhCommand(runner: GhCommandRunner, args: string[], purpose: string): string {
  const result = runner.run(args);
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `gh ${args.join(" ")} failed`;
    throw new Error(`Failed to ${purpose}: ${detail}`);
  }
  return result.stdout.trim();
}

export interface CreatePullRequestOptions {
  title: string;
  body?: string;
  base?: string;
  head?: string;
  draft?: boolean;
  cwd?: string;
}

export interface CreatePullRequestResult {
  output: string;
}

interface PullRequestTemplate {
  path: string;
  content: string;
}

interface PullRequestContent {
  title: string;
  body: string;
}

const TEMPLATE_FILE_CANDIDATES = [
  ".github/pull_request_template.md",
  ".github/PULL_REQUEST_TEMPLATE.md",
  "docs/pull_request_template.md",
  "docs/PULL_REQUEST_TEMPLATE.md",
  "pull_request_template.md",
  "PULL_REQUEST_TEMPLATE.md",
];

const TEMPLATE_DIRECTORY_CANDIDATES = [".github/PULL_REQUEST_TEMPLATE", "docs/PULL_REQUEST_TEMPLATE"];

const TEMPLATE_TITLE_DIRECTIVE = /^\s*#*\s*title\s*:\s*(.+)\s*$/i;
const TITLE_VARIABLE_PATTERN = /\{\{\s*(title|commit_subject|commit_message)\s*\}\}/gi;

function appendOptionalValue(args: string[], flag: string, value: string | undefined): void {
  if (value == null) {
    return;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return;
  }

  args.push(flag, trimmed);
}

function readTemplateFile(filePath: string): PullRequestTemplate {
  return {
    path: filePath,
    content: readFileSync(filePath, "utf8"),
  };
}

function tryReadTemplateAt(cwd: string, relativePath: string): PullRequestTemplate | undefined {
  const filePath = join(cwd, relativePath);
  if (!existsSync(filePath)) {
    return undefined;
  }

  const stat = statSync(filePath);
  if (!stat.isFile()) {
    return undefined;
  }

  return readTemplateFile(filePath);
}

function findTemplateInDirectory(cwd: string, relativeDirectory: string): PullRequestTemplate | undefined {
  const directoryPath = join(cwd, relativeDirectory);
  if (!existsSync(directoryPath)) {
    return undefined;
  }

  const stat = statSync(directoryPath);
  if (!stat.isDirectory()) {
    return undefined;
  }

  const entries = readdirSync(directoryPath)
    .filter((entry) => /\.(md|markdown)$/i.test(entry))
    .sort((left, right) => left.localeCompare(right));
  if (entries.length === 0) {
    return undefined;
  }

  return readTemplateFile(join(directoryPath, entries[0]));
}

function findPullRequestTemplate(cwd: string): PullRequestTemplate | undefined {
  for (const relativePath of TEMPLATE_FILE_CANDIDATES) {
    const template = tryReadTemplateAt(cwd, relativePath);
    if (template) {
      return template;
    }
  }

  for (const relativeDirectory of TEMPLATE_DIRECTORY_CANDIDATES) {
    const template = findTemplateInDirectory(cwd, relativeDirectory);
    if (template) {
      return template;
    }
  }

  return undefined;
}

function applyTitleVariables(templateText: string, generatedTitle: string): string {
  return templateText.replace(TITLE_VARIABLE_PATTERN, generatedTitle);
}

function parseTemplate(templateContent: string): { titleTemplate?: string; bodyTemplate: string } {
  const lines = templateContent.replace(/^\uFEFF/, "").split(/\r?\n/);
  const bodyLines: string[] = [];
  let titleTemplate: string | undefined;

  for (const line of lines) {
    if (titleTemplate == null) {
      const match = line.match(TEMPLATE_TITLE_DIRECTIVE);
      if (match) {
        titleTemplate = match[1].trim();
        continue;
      }
    }
    bodyLines.push(line);
  }

  return {
    titleTemplate,
    bodyTemplate: bodyLines.join("\n"),
  };
}

function buildPullRequestContent(
  generatedTitle: string,
  templateContent: string | undefined,
  explicitBody: string | undefined,
): PullRequestContent {
  const title = generatedTitle.trim();
  if (title.length === 0) {
    throw new Error("Cannot create pull request with an empty title");
  }

  if (explicitBody != null) {
    return {
      title,
      body: explicitBody,
    };
  }

  if (!templateContent) {
    return {
      title,
      body: "",
    };
  }

  const parsed = parseTemplate(templateContent);
  const renderedTemplateTitle = parsed.titleTemplate
    ? applyTitleVariables(parsed.titleTemplate, title).trim()
    : "";
  return {
    title: renderedTemplateTitle.length > 0 ? renderedTemplateTitle : title,
    body: applyTitleVariables(parsed.bodyTemplate, title),
  };
}

export function createPullRequest(
  options: CreatePullRequestOptions,
  runner: GhCommandRunner = new DefaultGhCommandRunner(),
): CreatePullRequestResult {
  const template = options.body == null ? findPullRequestTemplate(options.cwd ?? process.cwd()) : undefined;
  const content = buildPullRequestContent(options.title, template?.content, options.body);

  const args = ["pr", "create", "--title", content.title, "--body", content.body];
  if (options.draft) {
    args.push("--draft");
  }
  appendOptionalValue(args, "--base", options.base);
  appendOptionalValue(args, "--head", options.head);

  const output = runGhCommand(runner, args, "create pull request");
  return { output };
}
