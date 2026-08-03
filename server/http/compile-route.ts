import type { RouteDefinition, UncompiledRouteDefinition } from "./types";

const PARAMETER_SEGMENT = /^:([A-Za-z_][A-Za-z0-9_]*)$/;
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function compileRoute(definition: UncompiledRouteDefinition): RouteDefinition {
  if (!definition.path.startsWith("/")) throw new TypeError(`Route path must start with /: ${definition.path}`);

  const parameterNames: string[] = [];
  const segments = definition.path.split("/").slice(1).map((segment) => {
    const parameter = segment.match(PARAMETER_SEGMENT);
    if (!parameter) return escapeRegex(segment);
    parameterNames.push(parameter[1]);
    return "([^/]+)";
  });
  const pattern = new RegExp(`^/${segments.join("/")}/?$`);

  return {
    ...definition,
    pattern,
    parameterNames,
    match(pathname: string) {
      const result = pattern.exec(pathname);
      if (!result) return undefined;
      try {
        return Object.fromEntries(parameterNames.map((name, index) => [name, decodeURIComponent(result[index + 1])]));
      } catch {
        return undefined;
      }
    },
  };
}
