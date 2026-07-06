export type RenderContext = {
  title: string;
  summary: string;
  source: string;
  event_type: string;
  payload: Record<string, unknown>;
};

function getPathValue(source: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value && typeof value === "object" && key in value) {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);
}

export function renderTemplate(content: string, context: RenderContext) {
  const fullContext: Record<string, unknown> = {
    ...context,
    payload: context.payload,
    json: {
      title: context.title,
      summary: context.summary,
      source: context.source,
      event_type: context.event_type,
      payload: context.payload,
    },
  };

  if (content.trim() === "{{json}}") {
    return JSON.stringify(fullContext.json);
  }

  return content.replace(/{{\s*([\w.]+)\s*}}/g, (_match, key: string) => {
    const value = getPathValue(fullContext, key);
    if (value === undefined || value === null) return "";
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  });
}
