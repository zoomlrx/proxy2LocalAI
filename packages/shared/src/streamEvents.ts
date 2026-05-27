export type StreamEventProvider = "claude" | "codex" | "custom";

export type StreamEventKind =
  | "lifecycle"
  | "delta"
  | "snapshot"
  | "tool_call_start"
  | "tool_call_delta"
  | "tool_call_end"
  | "tool_result"
  | "tool_approval"
  | "usage"
  | "error"
  | "done"
  | "raw";

export type StreamEventChannel =
  | "message"
  | "reasoning"
  | "tool"
  | "status"
  | "debug";

export type StreamCodecId =
  | "claude-code-v1"
  | "codex-cli-v1"
  | "custom-jsonl-v1";

export interface NormalizedStreamEvent {
  provider: StreamEventProvider;
  eventId: string;
  sequence: number;
  turnId?: string;
  parentId?: string;
  correlationId?: string;
  blockIndex?: number;
  kind: StreamEventKind;
  channel: StreamEventChannel;
  role?: "assistant" | "user" | "system" | "tool";
  content?: string;
  data?: unknown;
  raw?: unknown;
  tool?: {
    id?: string;
    name?: string;
    input?: unknown;
    inputDelta?: string;
    output?: unknown;
    status?: "started" | "running" | "completed" | "failed" | "approval_required";
  };
  meta?: {
    sessionId?: string;
    model?: string;
    providerEventType?: string;
    finishReason?: string;
    timestamp?: string;
  };
}

export interface StreamDoneEvent {
  event: string;
  data: unknown;
}

export interface ToolEventPolicy {
  enabled: boolean;
  includeInput: "none" | "redacted" | "raw";
  includeOutput: "none" | "summary" | "raw";
  allowToolNames?: string[];
  denyToolNames?: string[];
  redactPaths: boolean;
  redactSecrets: boolean;
}

export interface MappingSecurityPolicy {
  allowedVariables: string[];
  allowRaw: boolean;
  allowData: boolean;
  allowToolInput: boolean;
  allowToolOutput: boolean;
  redactDiagnostics: boolean;
  redactPreview: boolean;
  persistRenderedFrames: boolean;
}

export interface StreamDonePolicy {
  onProviderDone: "emit_completed" | "none";
  onProviderError: "emit_failed" | "none";
  onRendererError: "skip_frame" | "emit_error" | "fail_stream";
  onClientAbort: "none";
}

export const STREAM_EVENT_KINDS: StreamEventKind[] = [
  "lifecycle",
  "delta",
  "snapshot",
  "tool_call_start",
  "tool_call_delta",
  "tool_call_end",
  "tool_result",
  "tool_approval",
  "usage",
  "error",
  "done",
  "raw"
];

export const STREAM_EVENT_CHANNELS: StreamEventChannel[] = [
  "message",
  "reasoning",
  "tool",
  "status",
  "debug"
];

export const DEFAULT_STREAM_DONE_EVENT: StreamDoneEvent = {
  event: "done",
  data: { status: "completed" }
};

export const DEFAULT_TOOL_EVENT_POLICY: ToolEventPolicy = {
  enabled: false,
  includeInput: "redacted",
  includeOutput: "none",
  redactPaths: true,
  redactSecrets: true
};

export const DEFAULT_MAPPING_SECURITY_POLICY: MappingSecurityPolicy = {
  allowedVariables: [
    "content",
    "sequence",
    "eventId",
    "turnId",
    "parentId",
    "correlationId",
    "blockIndex",
    "kind",
    "channel",
    "role",
    "tool.id",
    "tool.name",
    "tool.inputDelta",
    "tool.status",
    "meta.sessionId",
    "meta.model",
    "meta.providerEventType",
    "meta.finishReason"
  ],
  allowRaw: false,
  allowData: false,
  allowToolInput: false,
  allowToolOutput: false,
  redactDiagnostics: true,
  redactPreview: true,
  persistRenderedFrames: false
};

export const DEFAULT_STREAM_DONE_POLICY: StreamDonePolicy = {
  onProviderDone: "emit_completed",
  onProviderError: "emit_failed",
  onRendererError: "skip_frame",
  onClientAbort: "none"
};

export function getDefaultStreamCodec(provider: string): StreamCodecId {
  if (provider === "claude") {
    return "claude-code-v1";
  }
  if (provider === "codex") {
    return "codex-cli-v1";
  }
  return "custom-jsonl-v1";
}

export function cloneStreamDoneEvent(event: StreamDoneEvent = DEFAULT_STREAM_DONE_EVENT): StreamDoneEvent {
  return {
    event: event.event,
    data: JSON.parse(JSON.stringify(event.data)) as unknown
  };
}

export function cloneToolEventPolicy(policy: ToolEventPolicy = DEFAULT_TOOL_EVENT_POLICY): ToolEventPolicy {
  return {
    ...policy,
    allowToolNames: policy.allowToolNames ? [...policy.allowToolNames] : undefined,
    denyToolNames: policy.denyToolNames ? [...policy.denyToolNames] : undefined
  };
}

export function cloneMappingSecurityPolicy(policy: MappingSecurityPolicy = DEFAULT_MAPPING_SECURITY_POLICY): MappingSecurityPolicy {
  return {
    ...policy,
    allowedVariables: [...policy.allowedVariables]
  };
}

export function cloneStreamDonePolicy(policy: StreamDonePolicy = DEFAULT_STREAM_DONE_POLICY): StreamDonePolicy {
  return { ...policy };
}

export function sanitizeStreamEventForMapping(
  event: NormalizedStreamEvent,
  toolPolicy: ToolEventPolicy = DEFAULT_TOOL_EVENT_POLICY
): NormalizedStreamEvent | null {
  if (event.channel === "tool") {
    if (!toolPolicy.enabled) {
      return null;
    }
    const toolName = event.tool?.name;
    if (toolName && toolPolicy.denyToolNames?.includes(toolName)) {
      return null;
    }
    if (toolPolicy.allowToolNames?.length && (!toolName || !toolPolicy.allowToolNames.includes(toolName))) {
      return null;
    }

    const tool = event.tool ? { ...event.tool } : undefined;
    if (tool) {
      if (toolPolicy.includeInput === "none") {
        delete tool.input;
        delete tool.inputDelta;
      } else if (toolPolicy.includeInput === "redacted") {
        if (tool.input !== undefined) tool.input = "[redacted]";
        if (tool.inputDelta !== undefined) tool.inputDelta = "[redacted]";
      }

      if (toolPolicy.includeOutput === "none") {
        delete tool.output;
      } else if (toolPolicy.includeOutput === "summary" && tool.output !== undefined) {
        tool.output = summarizeValue(tool.output);
      }
    }

    return summarizeDiagnosticPayloads({
      ...event,
      tool
    });
  }

  if (shouldSummarizeDiagnosticPayloads(event)) {
    return summarizeDiagnosticPayloads(event);
  }

  return event;
}

function shouldSummarizeDiagnosticPayloads(event: NormalizedStreamEvent): boolean {
  return (
    event.channel === "debug"
    || event.channel === "status"
    || event.kind === "error"
    || event.kind === "raw"
    || event.kind === "lifecycle"
  );
}

function summarizeDiagnosticPayloads(event: NormalizedStreamEvent): NormalizedStreamEvent {
  return {
    ...event,
    data: event.data === undefined ? undefined : summarizeValue(event.data),
    raw: event.raw === undefined ? undefined : summarizeValue(event.raw)
  };
}

function summarizeValue(value: unknown): { type: string; chars: number } {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return {
    type: Array.isArray(value) ? "array" : value === null ? "null" : typeof value,
    chars: text.length
  };
}
