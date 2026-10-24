declare module "enlumine:sql-lexical-data" {
  export const tokenTypes: string[];
  export const wordGroups: string[];
  export const min: number;
  export const max: number;
  export const main: RegExp;
  export const numberPattern: RegExp;
  export const atProbe: RegExp;
  export const atAtProbe: RegExp;
  export const dollarProbe: RegExp;
  export enum Kind {
    Comment,
    String,
    Identifier,
    Operator,
    Variable,
    Number,
    Punctuation,
    StringEscape,
    Bit,
    Keyword,
    Boolean,
    Type,
  }
}
