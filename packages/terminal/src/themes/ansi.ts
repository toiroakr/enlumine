import type { LineStyles, LineTheme } from "../types.js";

export const sql: LineStyles = {
  keyword: "\x1b[34m", boolean: "\x1b[34m", type: "\x1b[34m",
  function: "\x1b[35m", identifier: "\x1b[33m", variable: "\x1b[33m",
  string: "\x1b[92m", string_escape: "\x1b[92m", bit: "\x1b[92m",
  number: "\x1b[36m", operator: "\x1b[90m", comment: "\x1b[90m",
  punctuation: "\x1b[90m", special: "\x1b[90m", bracket: "\x1b[2;33m",
};
export const graphql: LineStyles = {
  keyword: "\x1b[34m", definition: "\x1b[1;36m", property: "\x1b[94m",
  parameter: "\x1b[3;33m", type: "\x1b[36m", variable: "\x1b[35m",
  decorator: "\x1b[1;35m", number: "\x1b[34m", string: "\x1b[32m",
  comment: "\x1b[90m", punctuation: "\x1b[90m", bracket: "\x1b[2;33m", brace: "\x1b[33m",
};
const theme: LineTheme = { sql, graphql };

export default theme;
