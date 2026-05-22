export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ComposePromptOptions {
  contextRegex?: string;
  contextRegexFlags?: string;
  conversationHistory?: ConversationTurn[];
}

function escapeXmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function extractPromptContext(parameters: unknown, options: ComposePromptOptions = {}): string {
  const serialized = JSON.stringify(parameters, null, 2);
  const pattern = options.contextRegex?.trim();
  if (!pattern) {
    return serialized;
  }

  const regex = new RegExp(pattern, options.contextRegexFlags || "s");
  if (!regex.global) {
    const match = regex.exec(serialized);
    return match?.[1] ?? match?.[0] ?? "";
  }

  const matches: string[] = [];
  for (const match of serialized.matchAll(regex)) {
    matches.push(match[1] ?? match[0]);
  }
  return matches.join("\n");
}

function renderHistory(history: ConversationTurn[] | undefined): string {
  if (!history?.length) {
    return "";
  }
  const turns = history
    .map((turn) => `<turn role="${turn.role}">${escapeXmlText(turn.content)}</turn>`)
    .join("");
  return `<history>${turns}</history>`;
}

export function composePrompt(parameters: unknown, configuredPrompt?: string, options: ComposePromptOptions = {}): string {
  const context = `<parames>${extractPromptContext(parameters, options)}</parames>`;
  const history = renderHistory(options.conversationHistory);
  const prompt = configuredPrompt?.trim();
  return prompt ? `${history}${context}${prompt}` : `${history}${context}`;
}
