import type { MessageReturnStructure } from "./profile";
import { createChatCompletion, createStreamChunk, createStreamDone } from "./openai";

export interface MessageProtocolRequestInput {
  structure: MessageReturnStructure;
  targetPath?: string;
  body: unknown;
}

export interface ProtocolMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface RoutedMessageProtocolRequest {
  protocol: MessageReturnStructure;
  model?: string;
  stream: boolean;
  messages: ProtocolMessage[];
}

export interface MessageProtocolResponseInput {
  structure: MessageReturnStructure;
  content?: string;
  model?: string;
  id?: string;
  itemId?: string;
}

type UnknownRecord = Record<string, unknown>;

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizeRole(value: unknown): ProtocolMessage["role"] {
  const role = typeof value === "string" ? value.toLowerCase() : "";
  if (role === "system" || role === "developer") {
    return "system";
  }
  if (role === "assistant" || role === "model") {
    return "assistant";
  }
  if (role === "tool" || role === "function") {
    return "tool";
  }
  return "user";
}

function contentToText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(contentToText).filter(Boolean).join("\n");
  }
  if (isRecord(value)) {
    if (typeof value.text === "string") {
      return value.text;
    }
    if (typeof value.content === "string") {
      return value.content;
    }
    if (Array.isArray(value.parts)) {
      return contentToText(value.parts);
    }
    if (Array.isArray(value.content)) {
      return contentToText(value.content);
    }
  }
  return "";
}

function pushMessage(messages: ProtocolMessage[], role: unknown, content: unknown): void {
  const text = contentToText(content).trim();
  if (!text) {
    return;
  }
  messages.push({
    role: normalizeRole(role),
    content: text
  });
}

function extractAnthropicMessages(body: UnknownRecord): ProtocolMessage[] {
  const messages: ProtocolMessage[] = [];
  pushMessage(messages, "system", body.system);
  if (Array.isArray(body.messages)) {
    for (const item of body.messages) {
      if (isRecord(item)) {
        pushMessage(messages, item.role, item.content);
      }
    }
  }
  return messages;
}

function extractOpenAiChatMessages(body: UnknownRecord): ProtocolMessage[] {
  const messages: ProtocolMessage[] = [];
  if (!Array.isArray(body.messages)) {
    return messages;
  }
  for (const item of body.messages) {
    if (isRecord(item)) {
      pushMessage(messages, item.role, item.content);
    }
  }
  return messages;
}

function extractOpenAiResponsesMessages(body: UnknownRecord): ProtocolMessage[] {
  const messages: ProtocolMessage[] = [];
  pushMessage(messages, "system", body.instructions);
  const input = body.input;
  if (typeof input === "string") {
    pushMessage(messages, "user", input);
    return messages;
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      if (isRecord(item)) {
        pushMessage(messages, item.role, item.content ?? item.text);
      } else {
        pushMessage(messages, "user", item);
      }
    }
  }
  return messages;
}

function extractGeminiMessages(body: UnknownRecord): ProtocolMessage[] {
  const messages: ProtocolMessage[] = [];
  pushMessage(messages, "system", body.systemInstruction);
  const contents = body.contents;
  if (typeof contents === "string") {
    pushMessage(messages, "user", contents);
    return messages;
  }
  if (Array.isArray(contents)) {
    for (const item of contents) {
      if (isRecord(item)) {
        pushMessage(messages, item.role, item.parts ?? item.content);
      } else {
        pushMessage(messages, "user", item);
      }
    }
  }
  return messages;
}

function extractGeminiModelFromPath(path: string | undefined): string | undefined {
  if (!path) {
    return undefined;
  }
  const match = /\/models\/([^/:]+):/.exec(path);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export function routeMessageProtocolRequest(input: MessageProtocolRequestInput): RoutedMessageProtocolRequest {
  const body = isRecord(input.body) ? input.body : {};
  const model = stringValue(body.model)
    ?? (input.structure === "gemini_generate_content" ? extractGeminiModelFromPath(input.targetPath) : undefined);
  const stream = body.stream === true;

  switch (input.structure) {
    case "openai_chat_completions":
      return { protocol: input.structure, model, stream, messages: extractOpenAiChatMessages(body) };
    case "openai_responses":
      return { protocol: input.structure, model, stream, messages: extractOpenAiResponsesMessages(body) };
    case "gemini_generate_content":
      return { protocol: input.structure, model, stream, messages: extractGeminiMessages(body) };
    case "anthropic_messages":
    default:
      return { protocol: "anthropic_messages", model, stream, messages: extractAnthropicMessages(body) };
  }
}

export function createMessageProtocolPromptPayload(input: MessageProtocolRequestInput): RoutedMessageProtocolRequest {
  return routeMessageProtocolRequest(input);
}

export function createMessageProtocolJsonResponse(input: MessageProtocolResponseInput): unknown {
  const model = input.model ?? "proxy2localai";
  const content = input.content ?? "";
  switch (input.structure) {
    case "openai_chat_completions":
      return createChatCompletion({ id: input.id, content, model });
    case "openai_responses":
      return createResponsesObject({ id: input.id, itemId: input.itemId, content, model });
    case "gemini_generate_content":
      return createGeminiGenerateContentResponse({ id: input.id, content, model });
    case "anthropic_messages":
    default:
      return createAnthropicMessage({ id: input.id, content, model });
  }
}

export function createMessageProtocolStreamStart(input: MessageProtocolResponseInput): string {
  const model = input.model ?? "proxy2localai";
  switch (input.structure) {
    case "anthropic_messages":
      return [
        sseFrame("message_start", {
          type: "message_start",
          message: createAnthropicMessage({ id: input.id, content: "", model })
        }),
        sseFrame("content_block_start", {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" }
        })
      ].join("");
    case "openai_responses":
      return sseFrame("response.created", {
        type: "response.created",
        response: createResponsesObject({ id: input.id, itemId: input.itemId, content: "", model, status: "in_progress" })
      });
    default:
      return "";
  }
}

export function createMessageProtocolStreamChunk(input: MessageProtocolResponseInput): string {
  const model = input.model ?? "proxy2localai";
  const content = input.content ?? "";
  switch (input.structure) {
    case "openai_chat_completions":
      return createStreamChunk({ id: input.id, content, model });
    case "openai_responses":
      return sseFrame("response.output_text.delta", {
        type: "response.output_text.delta",
        response_id: input.id ?? createId("resp"),
        item_id: input.itemId ?? createId("msg"),
        output_index: 0,
        content_index: 0,
        delta: content
      });
    case "gemini_generate_content":
      return `data: ${JSON.stringify(createGeminiGenerateContentResponse({ id: input.id, content, model, finishReason: null }))}\n\n`;
    case "anthropic_messages":
    default:
      return sseFrame("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: content }
      });
  }
}

export function createMessageProtocolStreamDone(input: MessageProtocolResponseInput): string {
  const model = input.model ?? "proxy2localai";
  const content = input.content ?? "";
  switch (input.structure) {
    case "openai_chat_completions":
      return createStreamDone();
    case "openai_responses":
      return [
        sseFrame("response.output_text.done", {
          type: "response.output_text.done",
          response_id: input.id ?? createId("resp"),
          item_id: input.itemId ?? createId("msg"),
          output_index: 0,
          content_index: 0,
          text: content
        }),
        sseFrame("response.completed", {
          type: "response.completed",
          response: createResponsesObject({ id: input.id, itemId: input.itemId, content, model })
        })
      ].join("");
    case "gemini_generate_content":
      return `data: ${JSON.stringify(createGeminiGenerateContentResponse({ id: input.id, content: "", model }))}\n\n`;
    case "anthropic_messages":
    default:
      return [
        sseFrame("content_block_stop", {
          type: "content_block_stop",
          index: 0
        }),
        sseFrame("message_delta", {
          type: "message_delta",
          delta: { stop_reason: "end_turn", stop_sequence: null },
          usage: { output_tokens: 0 }
        }),
        sseFrame("message_stop", { type: "message_stop" })
      ].join("");
  }
}

function createAnthropicMessage(input: { id?: string; content: string; model: string }) {
  return {
    id: input.id ?? createId("msg"),
    type: "message",
    role: "assistant",
    model: input.model,
    content: input.content ? [{ type: "text", text: input.content }] : [],
    stop_reason: input.content ? "end_turn" : null,
    stop_sequence: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0
    }
  };
}

function createResponsesObject(input: { id?: string; itemId?: string; content: string; model: string; status?: "completed" | "in_progress" }) {
  const status = input.status ?? "completed";
  return {
    id: input.id ?? createId("resp"),
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status,
    model: input.model,
    output: status === "completed" ? [
      {
        id: input.itemId ?? createId("msg"),
        type: "message",
        status: "completed",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: input.content,
            annotations: []
          }
        ]
      }
    ] : [],
    output_text: status === "completed" ? input.content : "",
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0
    }
  };
}

function createGeminiGenerateContentResponse(input: { id?: string; content: string; model: string; finishReason?: "STOP" | null }) {
  const finishReason = Object.prototype.hasOwnProperty.call(input, "finishReason")
    ? input.finishReason
    : "STOP";
  const candidate: UnknownRecord = {
    index: 0,
    content: {
      role: "model",
      parts: input.content ? [{ text: input.content }] : []
    }
  };
  if (finishReason !== undefined && finishReason !== null) {
    candidate.finishReason = finishReason;
  }
  return {
    candidates: [candidate],
    usageMetadata: {
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0
    },
    modelVersion: input.model,
    responseId: input.id ?? createId("resp")
  };
}

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
