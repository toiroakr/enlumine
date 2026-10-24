export type Language =
  "javascript" | "typescript" | "json" | "sql" | "graphql" | "plain";

export function resolveLanguage(name: string): Language {
  switch (name.toLowerCase()) {
    case "js":
    case "mjs":
    case "cjs":
    case "javascript":
      return "javascript";
    case "ts":
    case "mts":
    case "cts":
    case "typescript":
      return "typescript";
    case "json":
      return "json";
    case "sql":
      return "sql";
    case "graphql":
    case "gql":
      return "graphql";
    case "plain":
    case "text":
    case "txt":
    case "plaintext":
      return "plain";
    default:
      throw new RangeError(`Unsupported language: ${name}`);
  }
}
