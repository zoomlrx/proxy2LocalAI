import type { NormalizedStreamEvent } from "@proxy2localai/shared";
import type { StreamCodec } from "./claudeCode";

interface CodecOptions {
  turnId?: string;
}

export function createCodexCliStreamCodec(options: CodecOptions = {}): StreamCodec {
  let sequence = 0;
  const turnId = options.turnId;

  const nextEvent = (event: Omit<NormalizedStreamEvent, "provider" | "eventId" | "sequence">): NormalizedStreamEvent => {
    sequence += 1;
    return {
      provider: "codex",
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
      const type = typeof record.type === "string" ? record.type : "";
      const messageType = asRecord(record.msg)?.type;

      if (type === "text" || messageType === "text") {
        const content = firstString(record.text, record.content, asRecord(record.msg)?.text, asRecord(record.msg)?.content);
        return content ? [nextEvent({
          kind: "delta",
          channel: "message",
          role: "assistant",
          content,
          meta: { providerEventType: type || "msg.text" }
        })] : [];
      }

      if (type === "exec_approval_request" || type === "apply_patch_approval_request") {
        const correlationId = firstString(record.id, record.call_id, record.request_id) ?? `codex_tool_${String(sequence + 1).padStart(4, "0")}`;
        return [nextEvent({
          correlationId,
          kind: "tool_approval",
          channel: "tool",
          content: type === "apply_patch_approval_request" ? "Patch approval required" : "Command approval required",
          tool: { name: type === "apply_patch_approval_request" ? "apply_patch" : "shell", status: "approval_required" },
          data: { reason: type },
          meta: { providerEventType: type }
        })];
      }

      if (type === "turn_complete") {
        return [nextEvent({
          kind: "done",
          channel: "status",
          data: record,
          meta: { providerEventType: type }
        })];
      }

      if (type === "error") {
        return [nextEvent({
          kind: "error",
          channel: "status",
          content: firstString(record.message, record.error) ?? "Codex error",
          data: record,
          meta: { providerEventType: type }
        })];
      }

      if (/exec|command|shell|tool/.test(type) && /start|begin|running/.test(type)) {
        const correlationId = firstString(record.id, record.call_id, record.tool_call_id) ?? `codex_tool_${String(sequence + 1).padStart(4, "0")}`;
        return [nextEvent({
          correlationId,
          kind: "tool_call_start",
          channel: "tool",
          tool: { id: correlationId, name: firstString(record.name) ?? "shell", status: "started" },
          data: record,
          meta: { providerEventType: type }
        })];
      }

      if (/output|result/.test(type)) {
        const correlationId = firstString(record.id, record.call_id, record.tool_call_id);
        return [nextEvent({
          correlationId,
          kind: "tool_result",
          channel: "tool",
          content: firstString(record.output, record.text, record.content),
          tool: { id: correlationId, name: firstString(record.name) ?? "shell", output: record.output, status: "completed" },
          data: record,
          meta: { providerEventType: type }
        })];
      }

      return [nextEvent({
        kind: "raw",
        channel: "debug",
        raw: parsed,
        meta: { providerEventType: type || "unknown" }
      })];
    }
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}
