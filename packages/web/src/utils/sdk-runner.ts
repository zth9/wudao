export const SDK_RUNNER_TOOL_NAMES = new Set([
  "invoke_sdk_runner",
  "invoke_claude_code_runner",
  "invoke_codex_runner",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

export function extractSdkRunId(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const sdkRunId = typeof record.sdk_run_id === "string" ? record.sdk_run_id.trim() : "";
  return sdkRunId || null;
}

export function extractSdkRunIdFromToolOutput(toolName: string, output: unknown): string | null {
  if (!SDK_RUNNER_TOOL_NAMES.has(toolName)) {
    return null;
  }
  return extractSdkRunId(output);
}

export function extractSdkRunIdFromToolContent(content: unknown): string | null {
  const record = asRecord(content);
  if (!record) {
    return null;
  }

  const toolName = typeof record.toolName === "string" ? record.toolName : "";
  return extractSdkRunIdFromToolOutput(toolName, record.output);
}

export function shortSdkRunId(runId: string, size = 8): string {
  const normalized = runId.trim();
  return normalized.length > size ? normalized.slice(0, size) : normalized;
}
