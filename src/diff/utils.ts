export function estimateTokens(input: string): number {
  if (!input) return 0;
  return Math.ceil(input.length / 4);
}

export function normalizePath(pathCandidate: string): string {
  return pathCandidate.replace(/^a\//, "").replace(/^b\//, "").trim();
}
