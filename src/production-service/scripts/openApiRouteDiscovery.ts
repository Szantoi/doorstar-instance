import { readFile, readdir } from "node:fs/promises";
import { METHODS } from "node:http";
import { join } from "node:path";
import ts from "typescript";
import {
  documentedHttpMethods,
  legacyProductionRouteGroup,
  type DocumentedHttpMethod,
} from "../src/httpRouteTopology.js";

export interface RouteSource {
  readonly relativePath: string;
  readonly content: string;
}

export interface DeclaredOpenApiRoute {
  readonly method: DocumentedHttpMethod;
  readonly pathTemplate: string;
  /** File and line for an actionable drift or duplicate error. */
  readonly source: string;
}

export interface LegacyRouteDiscoveryConfig {
  readonly mountPath: string;
  readonly sourceFiles: readonly string[];
}

const expressRouteMethods = new Set([...METHODS.map((method) => method.toLowerCase()), "all"]);

/** Recursively reads only real TypeScript files; symlinked route trees fail closed. */
export async function readLegacyRouteSources(routeDirectory: string): Promise<readonly RouteSource[]> {
  const sources: RouteSource[] = [];

  async function visit(directory: string, relativeDirectory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = relativeDirectory.length === 0 ? entry.name : `${relativeDirectory}/${entry.name}`;
      const absolutePath = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`OpenAPI route discovery does not follow symlinked source: ${relativePath}.`);
      }
      if (entry.isDirectory()) {
        await visit(absolutePath, relativePath);
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        sources.push(Object.freeze({ relativePath, content: await readFile(absolutePath, "utf8") }));
      }
    }
  }

  await visit(routeDirectory, "");
  return Object.freeze(sources);
}

/**
 * Parses direct Express Router declarations using the TypeScript AST. Dynamic
 * path expressions, chained `router.route`, and nested mounts intentionally
 * fail instead of being omitted from the route contract check.
 */
export function discoverLegacyProductionRouteDeclarations(
  sources: readonly RouteSource[],
  config: LegacyRouteDiscoveryConfig = legacyProductionRouteGroup,
): readonly DeclaredOpenApiRoute[] {
  const sourcesByPath = indexRouteSources(sources, config.sourceFiles);
  const routes: DeclaredOpenApiRoute[] = [];
  for (const sourceFile of config.sourceFiles) {
    const source = sourcesByPath.get(sourceFile)!;
    for (const route of collectDirectRouterRoutes(source)) {
      routes.push(Object.freeze({
        method: route.method,
        pathTemplate: toOpenApiPath(config.mountPath, route.pathTemplate),
        source: route.source,
      }));
    }
  }
  return assertUniqueDeclaredOpenApiRoutes(routes);
}

export function assertUniqueDeclaredOpenApiRoutes(
  routes: readonly DeclaredOpenApiRoute[],
): readonly DeclaredOpenApiRoute[] {
  const routesByOperation = new Map<string, DeclaredOpenApiRoute>();
  for (const route of routes) {
    if (!isDocumentedHttpMethod(route.method) || !route.pathTemplate.startsWith("/")) {
      throw new Error(`Invalid declared OpenAPI route at ${route.source}.`);
    }
    const operation = `${route.method.toUpperCase()} ${route.pathTemplate}`;
    const previous = routesByOperation.get(operation);
    if (previous !== undefined) {
      throw new Error(`Duplicate Express route declaration ${operation}: ${previous.source} and ${route.source}.`);
    }
    routesByOperation.set(operation, route);
  }
  return Object.freeze([...routes]);
}

function indexRouteSources(
  sources: readonly RouteSource[],
  expectedSourceFiles: readonly string[],
): ReadonlyMap<string, RouteSource> {
  const sourcesByPath = new Map<string, RouteSource>();
  for (const source of sources) {
    const relativePath = source.relativePath.replace(/\\/gu, "/");
    if (!relativePath.endsWith(".ts")) throw new Error(`Route discovery received a non-TypeScript source: ${relativePath}.`);
    if (sourcesByPath.has(relativePath)) throw new Error(`Route discovery received a duplicate source: ${relativePath}.`);
    sourcesByPath.set(relativePath, Object.freeze({ ...source, relativePath }));
  }

  const expected = new Set<string>();
  for (const sourceFile of expectedSourceFiles) {
    if (expected.has(sourceFile)) throw new Error(`Route topology source registry is duplicated: ${sourceFile}.`);
    expected.add(sourceFile);
  }
  const missing = [...expected].filter((sourceFile) => !sourcesByPath.has(sourceFile));
  const stale = [...sourcesByPath.keys()].filter((sourceFile) => !expected.has(sourceFile));
  if (missing.length > 0 || stale.length > 0) {
    throw new Error(`Route topology source registry drift. Missing: ${missing.join(", ") || "none"}. Stale: ${stale.join(", ") || "none"}.`);
  }
  return sourcesByPath;
}

function collectDirectRouterRoutes(source: RouteSource): readonly DeclaredOpenApiRoute[] {
  const sourceFile = ts.createSourceFile(source.relativePath, source.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const routerIdentifiers = collectRouterIdentifiers(sourceFile);
  if (routerIdentifiers.size === 0) throw new Error(`Route source ${source.relativePath} does not declare an Express Router().`);

  const routes: DeclaredOpenApiRoute[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const receiver = node.expression.expression;
      if (ts.isIdentifier(receiver) && routerIdentifiers.has(receiver.text)) {
        const method = node.expression.name.text;
        const location = sourceLocation(sourceFile, node);
        if (method === "use" || method === "route") {
          throw new Error(`Unsupported nested Express router syntax at ${location}; register a direct literal route instead.`);
        }
        if (isExpressRouteMethod(method)) {
          if (!isDocumentedHttpMethod(method)) {
            throw new Error(`Unsupported OpenAPI HTTP method ${method.toUpperCase()} at ${location}.`);
          }
          const pathTemplate = literalRoutePath(node.arguments[0]);
          if (pathTemplate === undefined) {
            throw new Error(`Express route at ${location} must use a literal path for OpenAPI verification.`);
          }
          routes.push(Object.freeze({ method, pathTemplate, source: location }));
        }
      }
      if (ts.isElementAccessExpression(receiver) && ts.isIdentifier(receiver.expression) && routerIdentifiers.has(receiver.expression.text)) {
        throw new Error(`Unsupported computed Express router syntax at ${sourceLocation(sourceFile, node)}.`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return Object.freeze(routes);
}

function collectRouterIdentifiers(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const identifiers = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined && isRouterFactoryCall(node.initializer)) {
      identifiers.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return identifiers;
}

function isRouterFactoryCall(node: ts.Expression): boolean {
  if (!ts.isCallExpression(node)) return false;
  if (ts.isIdentifier(node.expression)) return node.expression.text === "Router";
  return ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression)
    && node.expression.expression.text === "express"
    && node.expression.name.text === "Router";
}

function literalRoutePath(node: ts.Expression | undefined): string | undefined {
  if (node === undefined || (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node))) return undefined;
  if (!node.text.startsWith("/")) throw new Error(`Express route path must start with '/': ${node.text}.`);
  return node.text;
}

function toOpenApiPath(mountPath: string, routePath: string): string {
  if (!mountPath.startsWith("/") || mountPath.endsWith("/")) {
    throw new Error(`Legacy route mount path must start with one leading slash and have no trailing slash: ${mountPath}.`);
  }
  return `${mountPath}${routePath}`.replace(/:([A-Za-z0-9_]+)/gu, "{$1}");
}

function isDocumentedHttpMethod(value: string): value is DocumentedHttpMethod {
  return (documentedHttpMethods as readonly string[]).includes(value);
}

function isExpressRouteMethod(value: string): boolean {
  return expressRouteMethods.has(value);
}

function sourceLocation(sourceFile: ts.SourceFile, node: ts.Node): string {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${sourceFile.fileName}:${position.line + 1}`;
}
