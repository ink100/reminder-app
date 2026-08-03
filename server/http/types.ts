export type RouteParams = Record<string, string>;

export type RouteHandler = (
  request: Request,
  context: { params: Promise<RouteParams> },
) => Response | Promise<Response>;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type RouteDefinition = {
  source: string;
  path: string;
  method: HttpMethod;
  handler: RouteHandler;
  pattern: RegExp;
  parameterNames: string[];
  match(pathname: string): RouteParams | undefined;
};

export type UncompiledRouteDefinition = Omit<RouteDefinition, "pattern" | "parameterNames" | "match">;
