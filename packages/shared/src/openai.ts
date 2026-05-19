export interface CreateChatCompletionInput {
  id?: string;
  content: string;
  model?: string;
}

export interface OpenAIErrorResponse {
  error: {
    type: string;
    message: string;
  };
}

function createId(prefix = "chatcmpl"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createChatCompletion(input: CreateChatCompletionInput) {
  return {
    id: input.id ?? createId(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: input.model ?? "web2LocalAgent",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: input.content
        },
        finish_reason: "stop"
      }
    ]
  };
}

export function createStreamChunk(input: CreateChatCompletionInput): string {
  const payload = {
    id: input.id ?? createId(),
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: input.model ?? "web2LocalAgent",
    choices: [
      {
        index: 0,
        delta: {
          content: input.content
        },
        finish_reason: null
      }
    ]
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export function createStreamDone(): string {
  return "data: [DONE]\n\n";
}

export function createErrorResponse(
  type: string,
  message: string,
  details: Record<string, unknown> = {}
): OpenAIErrorResponse {
  return {
    error: {
      type,
      message,
      ...details
    }
  };
}
