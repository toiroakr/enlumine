import type { EditorTheme } from "../types.js";
import sql from "../../../sql/src/themes/ansi.js";
import graphql from "../../../graphql/src/themes/ansi.js";

const theme: EditorTheme = Object.freeze({ sql, graphql });

export default theme;
