export function composePrompt(parameters: unknown, configuredPrompt?: string): string {
  const context = `<parames>${JSON.stringify(parameters, null, 2)}</parames>`;
  const prompt = configuredPrompt?.trim();
  return prompt ? `${context}${prompt}` : context;
}
