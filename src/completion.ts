export type CompletionShell = "bash" | "zsh";

const SUPPORTED_COMPLETION_SHELLS: CompletionShell[] = ["bash", "zsh"];

const ORIGIN_BRANCH_LIST_COMMAND =
  "git for-each-ref --format='%(refname:short)' refs/remotes/origin 2>/dev/null | sed 's#^origin/##' | grep -v '^HEAD$'";

function buildZshCompletionScript(): string {
  return [
    "#compdef gac",
    "",
    "_gac_origin_branches() {",
    `  ${ORIGIN_BRANCH_LIST_COMMAND}`,
    "}",
    "",
    "_gac() {",
    "  local cur prev",
    "  cur=\"${words[CURRENT]}\"",
    "  prev=\"${words[CURRENT-1]}\"",
    "",
    "  case \"$prev\" in",
    "    pr)",
    "      local -a branches",
    "      branches=( ${(f)\"$(_gac_origin_branches)\"} )",
    "      compadd -- \"${branches[@]}\"",
    "      return 0",
    "      ;;",
    "    completion)",
    "      compadd -- bash zsh",
    "      return 0",
    "      ;;",
    "  esac",
    "",
    "  compadd -- -h --help commit debug no-unstaged-fallback pr completion",
    "}",
    "",
    "compdef _gac gac",
  ].join("\n");
}

function buildBashCompletionScript(): string {
  return [
    "_gac_origin_branches() {",
    `  ${ORIGIN_BRANCH_LIST_COMMAND}`,
    "}",
    "",
    "_gac_completions() {",
    "  local cur prev",
    "  cur=\"${COMP_WORDS[COMP_CWORD]}\"",
    "  prev=\"${COMP_WORDS[COMP_CWORD-1]}\"",
    "",
    "  case \"$prev\" in",
    "    pr)",
    "      COMPREPLY=( $(compgen -W \"$(_gac_origin_branches)\" -- \"$cur\") )",
    "      return 0",
    "      ;;",
    "    completion)",
    "      COMPREPLY=( $(compgen -W \"bash zsh\" -- \"$cur\") )",
    "      return 0",
    "      ;;",
    "  esac",
    "",
    "  COMPREPLY=( $(compgen -W \"-h --help commit debug no-unstaged-fallback pr completion\" -- \"$cur\") )",
    "}",
    "",
    "complete -F _gac_completions gac",
  ].join("\n");
}

export function isCompletionShell(value: string): value is CompletionShell {
  return SUPPORTED_COMPLETION_SHELLS.includes(value as CompletionShell);
}

export function getCompletionScript(shell: CompletionShell): string {
  if (shell === "zsh") {
    return buildZshCompletionScript();
  }

  return buildBashCompletionScript();
}
