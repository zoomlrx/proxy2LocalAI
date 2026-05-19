export interface SseFrame {
  event: string;
  data: string;
}

export interface ExtractAiDataOptions {
  sseDataEvents?: string[];
}

export interface RenderCustomJsonTemplateInput {
  aiData: string;
  template?: string;
}

const AI_DATA_TAG = "<aiData/>";

export function parseSseFrames(raw: string): SseFrame[] {
  const frames: SseFrame[] = [];
  let event = "message";
  const dataLines: string[] = [];

  const flush = () => {
    if (dataLines.length === 0) {
      return;
    }
    frames.push({
      event,
      data: dataLines.join("\n")
    });
    event = "message";
    dataLines.length = 0;
  };

  for (const line of raw.split(/\r?\n/)) {
    if (line.trim() === "") {
      flush();
      continue;
    }
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim() || "message";
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  flush();
  return frames;
}

function decodeSseData(data: string): string {
  if (data === "[DONE]") {
    return "";
  }
  try {
    const parsed = JSON.parse(data) as unknown;
    if (typeof parsed === "string") {
      return parsed;
    }
    if (parsed && typeof parsed === "object") {
      return JSON.stringify(parsed);
    }
    return String(parsed ?? "");
  } catch {
    return data;
  }
}

function looksLikeSse(raw: string): boolean {
  return /^event:/m.test(raw) || /^data:/m.test(raw);
}

export function extractAiData(raw: string, options: ExtractAiDataOptions = {}): string {
  const events = new Set(options.sseDataEvents?.length ? options.sseDataEvents : ["message"]);
  if (!looksLikeSse(raw)) {
    return raw;
  }

  return parseSseFrames(raw)
    .filter((frame) => events.has(frame.event))
    .map((frame) => decodeSseData(frame.data))
    .join("");
}

export function renderCustomJsonTemplate(input: RenderCustomJsonTemplateInput): string {
  const template = input.template?.trim() || AI_DATA_TAG;
  return template.replaceAll(AI_DATA_TAG, JSON.stringify(input.aiData));
}

export function validateCustomJsonTemplate(template: string | undefined): void {
  const normalized = template?.trim();
  if (!normalized) {
    return;
  }
  if (!normalized.includes(AI_DATA_TAG)) {
    throw new Error("自定义 JSON 模板必须包含 <aiData/>");
  }
  const rendered = renderCustomJsonTemplate({
    aiData: "test",
    template: normalized
  });
  try {
    JSON.parse(rendered);
  } catch {
    throw new Error("自定义 JSON 模板替换 <aiData/> 后必须是合法 JSON");
  }
}
