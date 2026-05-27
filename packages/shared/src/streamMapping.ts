import {
  DEFAULT_MAPPING_SECURITY_POLICY,
  type MappingSecurityPolicy,
  type NormalizedStreamEvent,
  type StreamEventChannel,
  type StreamEventKind
} from "./streamEvents";
import type { SseEventMapping } from "./profile";

export interface StreamMappingRule {
  id: string;
  enabled: boolean;
  match: {
    kind?: StreamEventKind;
    channel?: StreamEventChannel;
    providerEventType?: string;
    toolName?: string;
    correlationId?: string;
  };
  emit: {
    protocol: "sse";
    event: string;
    data: unknown;
  };
}

export interface RenderStreamMappingOptions {
  missingVariablePolicy: "empty_string" | "drop_frame" | "error";
  rendererErrorPolicy: "drop_frame" | "emit_error" | "throw";
  securityPolicy: MappingSecurityPolicy;
}

export interface RenderedSseFrame {
  event: string;
  data: string;
  frame: string;
}

export const DEFAULT_RENDER_STREAM_MAPPING_OPTIONS: RenderStreamMappingOptions = {
  missingVariablePolicy: "empty_string",
  rendererErrorPolicy: "drop_frame",
  securityPolicy: DEFAULT_MAPPING_SECURITY_POLICY
};

class DropFrameError extends Error {}

export function validateSseEventName(name: string): { ok: boolean; message?: string } {
  if (!name) {
    return { ok: false, message: "SSE event 不能为空" };
  }
  if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(name)) {
    return { ok: false, message: "SSE event 只能包含字母、数字、下划线、点、冒号和短横线" };
  }
  return { ok: true };
}

export function matchesStreamMappingRule(event: NormalizedStreamEvent, rule: StreamMappingRule): boolean {
  if (!rule.enabled) {
    return false;
  }
  const match = rule.match ?? {};
  return (
    (match.kind === undefined || match.kind === event.kind)
    && (match.channel === undefined || match.channel === event.channel)
    && (match.providerEventType === undefined || match.providerEventType === event.meta?.providerEventType)
    && (match.toolName === undefined || match.toolName === event.tool?.name)
    && (match.correlationId === undefined || match.correlationId === event.correlationId)
  );
}

export function renderStreamMappingFramesForEvent(
  event: NormalizedStreamEvent,
  rules: StreamMappingRule[],
  options: Partial<RenderStreamMappingOptions> = {}
): RenderedSseFrame[] {
  const frames: RenderedSseFrame[] = [];
  for (const rule of rules) {
    if (!matchesStreamMappingRule(event, rule)) {
      continue;
    }
    const frame = renderStreamMappingFrame(event, rule, options);
    if (frame) {
      frames.push(frame);
    }
  }
  return frames;
}

export function renderStreamMappingFrame(
  event: NormalizedStreamEvent,
  rule: StreamMappingRule,
  options: Partial<RenderStreamMappingOptions> = {}
): RenderedSseFrame | null {
  const resolvedOptions = resolveOptions(options);
  try {
    const validation = validateSseEventName(rule.emit.event);
    if (!validation.ok) {
      throw new Error(validation.message ?? "invalid SSE event name");
    }
    const dataValue = renderTemplateValue(rule.emit.data, event, resolvedOptions);
    const data = JSON.stringify(dataValue);
    return {
      event: rule.emit.event,
      data,
      frame: serializeSseFrame(rule.emit.event, data)
    };
  } catch (error) {
    if (error instanceof DropFrameError || resolvedOptions.rendererErrorPolicy === "drop_frame") {
      return null;
    }
    if (resolvedOptions.rendererErrorPolicy === "emit_error") {
      const data = JSON.stringify({
        message: error instanceof Error ? error.message : "renderer error"
      });
      return {
        event: "error",
        data,
        frame: serializeSseFrame("error", data)
      };
    }
    throw error;
  }
}

export function serializeSseFrame(event: string, data: string): string {
  const dataLines = data.split(/\r?\n/).map((line) => `data: ${line}`);
  return [`event: ${event}`, ...dataLines, ""].join("\n") + "\n";
}

export function legacySseMappingsToStreamMappings(mappings: SseEventMapping[]): StreamMappingRule[] {
  return mappings.map((mapping) => ({
    id: `legacy-${mapping.source}`,
    enabled: true,
    match: {
      kind: "delta",
      channel: legacySourceToChannel(mapping.source)
    },
    emit: {
      protocol: "sse",
      event: mapping.targetEvent,
      data: "{{content}}"
    }
  }));
}

export function streamMappingsToLegacySseEventMappings(rules: StreamMappingRule[]): SseEventMapping[] {
  const mappings: SseEventMapping[] = [];
  const seen = new Set<string>();
  for (const rule of rules) {
    if (!rule.enabled || rule.match.kind !== "delta" || !rule.match.channel) {
      continue;
    }
    if (rule.match.channel !== "message" && rule.match.channel !== "reasoning") {
      continue;
    }
    if (seen.has(rule.match.channel)) {
      continue;
    }
    seen.add(rule.match.channel);
    mappings.push({
      source: rule.match.channel,
      targetEvent: rule.emit.event
    });
  }
  return mappings;
}

function resolveOptions(options: Partial<RenderStreamMappingOptions>): RenderStreamMappingOptions {
  return {
    ...DEFAULT_RENDER_STREAM_MAPPING_OPTIONS,
    ...options,
    securityPolicy: {
      ...DEFAULT_MAPPING_SECURITY_POLICY,
      ...options.securityPolicy,
      allowedVariables: options.securityPolicy?.allowedVariables ?? DEFAULT_MAPPING_SECURITY_POLICY.allowedVariables
    }
  };
}

function legacySourceToChannel(source: string): StreamEventChannel {
  if (source === "reasoning") {
    return "reasoning";
  }
  if (source === "tool") {
    return "tool";
  }
  if (source === "status" || source === "error") {
    return "status";
  }
  return "message";
}

function renderTemplateValue(
  value: unknown,
  event: NormalizedStreamEvent,
  options: RenderStreamMappingOptions
): unknown {
  if (typeof value === "string") {
    return renderTemplateString(value, event, options);
  }
  if (Array.isArray(value)) {
    return value.map((item) => renderTemplateValue(item, event, options));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, child]) => [key, renderTemplateValue(child, event, options)])
    );
  }
  return value;
}

function renderTemplateString(
  template: string,
  event: NormalizedStreamEvent,
  options: RenderStreamMappingOptions
): unknown {
  const exact = /^{{\s*([^}]+?)\s*}}$/.exec(template);
  if (exact?.[1]) {
    return resolveVariableOrPolicy(exact[1].trim(), event, options);
  }
  return template.replace(/{{\s*([^}]+?)\s*}}/g, (_match, path: string) => {
    const value = resolveVariableOrPolicy(path.trim(), event, options);
    return value === undefined || value === null ? "" : String(value);
  });
}

function resolveVariableOrPolicy(
  path: string,
  event: NormalizedStreamEvent,
  options: RenderStreamMappingOptions
): unknown {
  assertVariableAllowed(path, options.securityPolicy);
  const value = readPath(event, path);
  if (value !== undefined) {
    return value;
  }
  if (options.missingVariablePolicy === "drop_frame") {
    throw new DropFrameError(`missing variable: ${path}`);
  }
  if (options.missingVariablePolicy === "error") {
    throw new Error(`missing variable: ${path}`);
  }
  return "";
}

function assertVariableAllowed(path: string, policy: MappingSecurityPolicy): void {
  if (path === "raw" || path.startsWith("raw.")) {
    if (!policy.allowRaw) {
      throw new Error(`variable not allowed: ${path}`);
    }
    return;
  }
  if (path === "data" || path.startsWith("data.")) {
    if (!policy.allowData) {
      throw new Error(`variable not allowed: ${path}`);
    }
    return;
  }
  if (path === "tool.input" || path.startsWith("tool.input.")) {
    if (!policy.allowToolInput) {
      throw new Error(`variable not allowed: ${path}`);
    }
    return;
  }
  if (path === "tool.output" || path.startsWith("tool.output.")) {
    if (!policy.allowToolOutput) {
      throw new Error(`variable not allowed: ${path}`);
    }
    return;
  }
  if (!policy.allowedVariables.includes(path)) {
    throw new Error(`variable not allowed: ${path}`);
  }
}

function readPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[part];
  }, value);
}
