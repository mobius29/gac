export type CompletionShell = "bash" | "zsh";

const SUPPORTED_COMPLETION_SHELLS: CompletionShell[] = ["bash", "zsh"];

const ORIGIN_BRANCH_LIST_COMMAND =
  "git for-each-ref --format='%(refname:short)' refs/remotes/origin 2>/dev/null | sed 's#^origin/##' | grep -v '^HEAD$'";

function buildZshCompletionScript(): string {
  return [
    "#compdef gac",
    "",
    "_gac_origin_branches() {",
    "  local -a branches",
    `  branches=(\${(f)"$(${ORIGIN_BRANCH_LIST_COMMAND})"})`,
    "  _describe 'origin branches' branches",
    "}",
    "",
    "_gac() {",
    "  local curcontext=\"$curcontext\"",
    "  typeset -A opt_args",
    "  _arguments -C \\",
    "    '(-h --help)'{-h,--help}'[Show this help message and exit]' \\",
    "    '-commit[Commit with the generated message]' \\",
    "    '-debug[Print pipeline debug metadata to stderr]' \\",
    "    '-no-unstaged-fallback[Only read staged diff; do not fallback to unstaged diff]' \\",
    "    '-completion[Print shell completion script]:shell:(bash zsh)' \\",
    "    '-pr[Create GitHub pull request targeting branch]:target branch:_gac_origin_branches'",
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
    "    -pr)",
    "      COMPREPLY=( $(compgen -W \"$(_gac_origin_branches)\" -- \"$cur\") )",
    "      return 0",
    "      ;;",
    "    -completion)",
    "      COMPREPLY=( $(compgen -W \"bash zsh\" -- \"$cur\") )",
    "      return 0",
    "      ;;",
    "  esac",
    "",
    "  COMPREPLY=( $(compgen -W \"-h --help -commit -debug -no-unstaged-fallback -pr -completion\" -- \"$cur\") )",
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
