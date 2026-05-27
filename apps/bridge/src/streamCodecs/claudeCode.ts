import type { NormalizedStreamEvent } from "@proxy2localai/shared";

interface ClaudeToolBlock {
  id: string;
  name?: string;
}

export interface StreamCodec {
  decodeLine(line: string): NormalizedStreamEvent[];
}

interface CodecOptions {
  turnId?: string;
}

export function createClaudeCodeStreamCodec(options: CodecOptions = {}): StreamCodec {
  let sequence = 0;
  const turnId = options.turnId;
  const toolBlocks = new Map<number, ClaudeToolBlock>();

  const nextEvent = (event: Omit<NormalizedStreamEvent, "provider" | "eventId" | "sequence">): NormalizedStreamEvent => {
    sequence += 1;
    return {
      provider: "claude",
      eventId: `evt_${String(sequence).padStart(6, "0")}`,
      sequence,
      ...(turnId ? { turnId } : {}),
      ...event
    };
  };

  return {
    decodeLine(line: string): NormalizedStreamEvent[] {
      const trimmed = line.trim();
      if (!trimmed) {
        return [];
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed) as unknown;
      } catch {
        return [nextEvent({
          kind: "raw",
          channel: "debug",
          content: line,
          raw: line,
          meta: { providerEventType: "raw_text" }
        })];
      }

      const record = asRecord(parsed);
      if (!record) {
        return [];
      }
      if (record.type === "stream_event") {
        return decodeStreamEvent(record.event, nextEvent, toolBlocks);
      }
      if (record.type === "result") {
        return [nextEvent({
          kind: "done",
          channel: "status",
          content: typeof record.result === "string" ? record.result : undefined,
          data: record,
          meta: { providerEventType: "result" }
        })];
      }
      if (record.type === "system" || record.type === "init" || record.type === "api_retry") {
        return [nextEvent({
          kind: "lifecycle",
          channel: "status",
          content: String(record.type),
          data: record,
          meta: { providerEventType: String(record.type) }
        })];
      }
      if (record.type === "assistant") {
        const content = extractClaudeAssistantText(record.message);
        return content ? [nextEvent({
          kind: "snapshot",
          channel: "message",
          role: "assistant",
          content,
          data: record,
          meta: { providerEventType: "assistant" }
        })] : [];
      }
      return [nextEvent({
        kind: "raw",
        channel: "debug",
        raw: parsed,
        meta: { providerEventType: typeof record.type === "string" ? record.type : "unknown" }
      })];
    }
  };
}

function decodeStreamEvent(
  value: unknown,
  nextEvent: (event: Omit<NormalizedStreamEvent, "provider" | "eventId" | "sequence">) => NormalizedStreamEvent,
  toolBlocks: Map<number, ClaudeToolBlock>
): NormalizedStreamEvent[] {
  const event = asRecord(value);
  if (!event || typeof event.type !== "string") {
    return [];
  }
  const blockIndex = typeof event.index === "number" ? event.index : undefined;

  if (event.type === "content_block_start") {
    const block = asRecord(event.content_block);
    if (block?.type === "tool_use") {
      const toolId = typeof block.id === "string" ? block.id : `claude_tool_${blockIndex ?? toolBlocks.size}`;
      const toolName = typeof block.name === "string" ? block.name : undefined;
      if (blockIndex !== undefined) {
        toolBlocks.set(blockIndex, { id: toolId, name: toolName });
      }
      return [nextEvent({
        blockIndex,
        correlationId: toolId,
        kind: "tool_call_start",
        channel: "tool",
        tool: { id: toolId, name: toolName, status: "started" },
        meta: { providerEventType: "content_block_start" }
      })];
    }
    return [];
  }

  if (event.type === "content_block_delta") {
    const delta = asRecord(event.delta);
    if (!delta || typeof delta.type !== "string") {
      return [];
    }
    if (delta.type === "text_delta" && typeof delta.text === "string") {
      return [nextEvent({
        blockIndex,
        kind: "delta",
        channel: "message",
        role: "assistant",
        content: delta.text,
        meta: { providerEventType: "content_block_delta" }
      })];
    }
    if (delta.type === "thinking_delta" || delta.type === "reasoning_delta") {
      const content = firstString(delta.thinking, delta.reasoning, delta.text, delta.delta);
      return content ? [nextEvent({
        blockIndex,
        kind: "delta",
        channel: "reasoning",
        role: "assistant",
        content,
        meta: { providerEventType: "content_block_delta" }
      })] : [];
    }
    if (delta.type === "input_json_delta") {
      const tool = blockIndex === undefined ? undefined : toolBlocks.get(blockIndex);
      const inputDelta = firstString(delta.partial_json, delta.text, delta.delta);
      return [nextEvent({
        blockIndex,
        correlationId: tool?.id,
        kind: "tool_call_delta",
        channel: "tool",
        tool: { id: tool?.id, name: tool?.name, inputDelta, status: "running" },
        meta: { providerEventType: "content_block_delta" }
      })];
    }
  }

  if (event.type === "content_block_stop") {
    const tool = blockIndex === undefined ? undefined : toolBlocks.get(blockIndex);
    if (!tool) {
      return [];
    }
    if (blockIndex !== undefined) {
      toolBlocks.delete(blockIndex);
    }
    return [nextEvent({
      blockIndex,
      correlationId: tool.id,
      kind: "tool_call_end",
      channel: "tool",
      tool: { id: tool.id, name: tool.name, status: "completed" },
      meta: { providerEventType: "content_block_stop" }
    })];
  }

  return [nextEvent({
    blockIndex,
    kind: "raw",
    channel: "debug",
    raw: event,
    meta: { providerEventType: event.type }
  })];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}

function extractClaudeAssistantText(message: unknown): string {
  const record = asRecord(message);
  if (!record) {
    return "";
  }
  const content = record.content;
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content.map((block) => {
    const item = asRecord(block);
    return item?.type === "text" && typeof item.text === "string" ? item.text : "";
  }).join("");
}
