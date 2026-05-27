import type {
  MappingSecurityPolicy,
  StreamCodecId,
  StreamDoneEvent,
  StreamDonePolicy,
  ToolEventPolicy
} from "./streamEvents";
import {
  streamMappingsToLegacySseEventMappings,
  type StreamMappingRule
} from "./streamMapping";
import type { ResponseMode, SseEventMapping, ProxyProfile } from "./profile";

export interface ResponseTemplate {
  id: string;
  name: string;
  responseMode: ResponseMode;
  description: string;
  customJsonTemplate?: string;
  sseEventMappings?: SseEventMapping[];
  sseDoneEvent?: { targetEvent: string; data: unknown };
  streamCodec?: StreamCodecId;
  streamMappings?: StreamMappingRule[];
  streamDoneEvent?: StreamDoneEvent;
  toolEventPolicy?: ToolEventPolicy;
  mappingSecurityPolicy?: MappingSecurityPolicy;
  streamDonePolicy?: StreamDonePolicy;
  sseDataEvents?: string[];
  examplePreview: string;
}

export const BUILTIN_RESPONSE_TEMPLATES: ResponseTemplate[] = [
  {
    id: "openai_chat_json",
    name: "OpenAI Chat JSON",
    responseMode: "block",
    description: "等待完整响应后返回 OpenAI 兼容的 JSON 对象，适合非流式场景。",
    examplePreview: '{"id":"chatcmpl-xxx","object":"chat.completion","choices":[{"message":{"content":"回答内容"}}]}'
  },
  {
    id: "openai_sse",
    name: "OpenAI SSE",
    responseMode: "stream",
    description: "逐字流式返回 OpenAI 兼容的 SSE 事件，适合聊天对话。",
    examplePreview: 'event: proxy_status\ndata: {"stage":"provider_start"}\n\ndata: {"choices":[{"delta":{"content":"你"}}]}\n\ndata: [DONE]'
  },
  {
    id: "business_code_data_message",
    name: "业务 JSON（code/data/message）",
    responseMode: "custom_json",
    description: "包装 AI 数据到 {code, data, message} 结构的自定义 JSON 模板。",
    customJsonTemplate: '{"code":0,"data":<aiData/>,"message":"ok"}',
    examplePreview: '{"code":0,"data":"AI 回答内容","message":"ok"}'
  },
  {
    id: "generic_sse",
    name: "通用 SSE 映射",
    responseMode: "mapped_sse",
    description: "映射 provider 的 reasoning 和 message 事件到自定义 SSE 事件流。",
    sseEventMappings: [
      { source: "reasoning", targetEvent: "reasoning" },
      { source: "message", targetEvent: "message" }
    ],
    examplePreview: 'event:reasoning\ndata:"思考内容"\n\nevent:message\ndata:"回答内容"\n\nevent:done\ndata:{"status":"completed"}'
  }
];

BUILTIN_RESPONSE_TEMPLATES.push(
  {
    id: "generic_chat_sse",
    name: "通用聊天 SSE",
    responseMode: "mapped_sse",
    description: "只输出最终回答文本增量，适合目标接口只需要 answer/message 事件的场景。",
    streamMappings: [
      {
        id: "message",
        enabled: true,
        match: { kind: "delta", channel: "message" },
        emit: { protocol: "sse", event: "message", data: { content: "{{content}}" } }
      }
    ],
    streamDoneEvent: {
      event: "done",
      data: { status: "completed" }
    },
    examplePreview: 'event: message\ndata: {"content":"你好"}\n\nevent: done\ndata: {"status":"completed"}'
  },
  {
    id: "chat_reasoning_sse",
    name: "带推理过程 SSE",
    responseMode: "mapped_sse",
    description: "区分 reasoning 和 message 两类文本增量，适合目标页面需要展示思考过程的场景。",
    streamMappings: [
      {
        id: "reasoning",
        enabled: true,
        match: { kind: "delta", channel: "reasoning" },
        emit: { protocol: "sse", event: "reasoning", data: { delta: "{{content}}" } }
      },
      {
        id: "message",
        enabled: true,
        match: { kind: "delta", channel: "message" },
        emit: { protocol: "sse", event: "message", data: { delta: "{{content}}" } }
      }
    ],
    streamDoneEvent: {
      event: "done",
      data: { status: "completed" }
    },
    examplePreview: 'event: reasoning\ndata: {"delta":"先分析"}\n\nevent: message\ndata: {"delta":"你好"}'
  },
  {
    id: "tool_status_sse",
    name: "工具状态 SSE",
    responseMode: "mapped_sse",
    description: "输出工具 start/delta/end 状态，默认只返回脱敏后的工具信息。",
    toolEventPolicy: {
      enabled: true,
      includeInput: "redacted",
      includeOutput: "none",
      redactPaths: true,
      redactSecrets: true
    },
    streamMappings: [
      {
        id: "tool-start",
        enabled: true,
        match: { kind: "tool_call_start", channel: "tool" },
        emit: {
          protocol: "sse",
          event: "tool",
          data: { type: "tool.start", toolName: "{{tool.name}}", toolId: "{{tool.id}}" }
        }
      },
      {
        id: "tool-delta",
        enabled: true,
        match: { kind: "tool_call_delta", channel: "tool" },
        emit: {
          protocol: "sse",
          event: "tool",
          data: { type: "tool.input.delta", toolName: "{{tool.name}}", delta: "{{tool.inputDelta}}" }
        }
      },
      {
        id: "tool-end",
        enabled: true,
        match: { kind: "tool_call_end", channel: "tool" },
        emit: {
          protocol: "sse",
          event: "tool",
          data: { type: "tool.end", toolName: "{{tool.name}}", status: "{{tool.status}}" }
        }
      }
    ],
    streamDoneEvent: {
      event: "done",
      data: { status: "completed" }
    },
    examplePreview: 'event: tool\ndata: {"type":"tool.start","toolName":"Read","toolId":"toolu_1"}'
  },
  {
    id: "business_stream_sse",
    name: "业务流式 SSE",
    responseMode: "mapped_sse",
    description: "把文本和错误包装为 code/data/message 结构，适合已有业务流式协议。",
    streamMappings: [
      {
        id: "chat",
        enabled: true,
        match: { kind: "delta", channel: "message" },
        emit: {
          protocol: "sse",
          event: "chat",
          data: { code: 0, data: { type: "answer.delta", content: "{{content}}" }, message: "ok" }
        }
      },
      {
        id: "error",
        enabled: true,
        match: { kind: "error" },
        emit: {
          protocol: "sse",
          event: "error",
          data: { code: 500, data: null, message: "{{content}}" }
        }
      }
    ],
    streamDoneEvent: {
      event: "finish",
      data: { code: 0, data: { status: "completed" }, message: "done" }
    },
    examplePreview: 'event: chat\ndata: {"code":0,"data":{"type":"answer.delta","content":"你好"},"message":"ok"}\n\nevent: finish\ndata: {"code":0,"data":{"status":"completed"},"message":"done"}'
  }
);

export function getBuiltinResponseTemplate(id: string): ResponseTemplate | undefined {
  return BUILTIN_RESPONSE_TEMPLATES.find((template) => template.id === id);
}

export function applyResponseTemplateToProfile(profile: ProxyProfile, template: ResponseTemplate): ProxyProfile {
  const legacyMappings = template.sseEventMappings
    ?? (template.streamMappings ? streamMappingsToLegacySseEventMappings(template.streamMappings) : undefined);
  return {
    ...profile,
    responseTemplateId: template.id,
    responseMode: template.responseMode,
    ...(template.customJsonTemplate !== undefined && { customJsonTemplate: template.customJsonTemplate }),
    ...(legacyMappings !== undefined && { sseEventMappings: legacyMappings }),
    ...(template.sseDoneEvent !== undefined && { sseDoneEvent: template.sseDoneEvent }),
    ...(template.streamDoneEvent !== undefined && { sseDoneEvent: { targetEvent: template.streamDoneEvent.event, data: template.streamDoneEvent.data } }),
    ...(template.sseDataEvents !== undefined && { sseDataEvents: template.sseDataEvents }),
    ...(template.streamCodec !== undefined && { streamCodec: template.streamCodec }),
    ...(template.streamMappings !== undefined && { streamMappings: template.streamMappings }),
    ...(template.streamDoneEvent !== undefined && { streamDoneEvent: template.streamDoneEvent }),
    ...(template.toolEventPolicy !== undefined && { toolEventPolicy: template.toolEventPolicy }),
    ...(template.mappingSecurityPolicy !== undefined && { mappingSecurityPolicy: template.mappingSecurityPolicy }),
    ...(template.streamDonePolicy !== undefined && { streamDonePolicy: template.streamDonePolicy })
  };
}

export interface InferredTemplate {
  responseMode: ResponseMode;
  suggestedTemplateId: string;
  sseEventMappings?: SseEventMapping[];
  customJsonTemplate?: string;
}

export function inferResponseTemplateFromSample(sample: string): InferredTemplate {
  const trimmed = sample.trim();

  // 检查是否是 SSE 格式（包含 event: 或 data: 行）
  if (/^event:/m.test(trimmed) || /^data:/m.test(trimmed)) {
    // 提取事件名
    const eventNames = new Set<string>();
    for (const match of trimmed.matchAll(/^event:(.+)$/gm)) {
      const name = match[1]?.trim();
      if (name) {
        eventNames.add(name);
      }
    }

    // 如果有 done 事件，移除它
    eventNames.delete("done");

    const mappings: SseEventMapping[] = Array.from(eventNames).map((name) => ({
      source: name,
      targetEvent: name
    }));

    return {
      responseMode: "mapped_sse",
      suggestedTemplateId: "generic_sse",
      sseEventMappings: mappings.length > 0 ? mappings : undefined
    };
  }

  // 检查是否是合法 JSON
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      // 检查是否包含 code/data/message 结构
      const hasBusinessFields = "code" in parsed && "data" in parsed && "message" in parsed;
      if (hasBusinessFields) {
        // 生成匹配的模板
        const template = trimmed
          .replace(/"data"\s*:\s*"[^"]*"/, '"data":<aiData/>')
          .replace(/"data"\s*:\s*\{[^}]*\}/, '"data":<aiData/>')
          .replace(/"data"\s*:\s*\[[^\]]*\]/, '"data":<aiData/>');

        return {
          responseMode: "custom_json",
          suggestedTemplateId: "business_code_data_message",
          customJsonTemplate: template.includes("<aiData/>") ? template : '{"code":0,"data":<aiData/>,"message":"ok"}'
        };
      }

      // 其他 JSON 结构
      return {
        responseMode: "block",
        suggestedTemplateId: "openai_chat_json"
      };
    }
  } catch {
    // 不是 JSON，继续
  }

  // 默认：纯文本 -> block 模式
  return {
    responseMode: "block",
    suggestedTemplateId: "openai_chat_json"
  };
}
