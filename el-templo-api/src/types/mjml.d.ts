/**
 * Minimal type declaration for `mjml` (v5).
 *
 * The `mjml` package (D-23, the one approved Phase 119 dependency) ships no
 * bundled `.d.ts` and there is no `@types/mjml` for v5. We declare only the
 * surface we use: the default export is an async function that compiles an
 * MJML document string to bulletproof table HTML.
 *
 * NOTE: mjml v5 is asynchronous — it returns a Promise (v4 was synchronous).
 */
declare module "mjml" {
  export interface MJMLParseError {
    line: number;
    message: string;
    tagName: string;
    formattedMessage: string;
  }

  export interface MJMLParseResults {
    html: string;
    json: unknown;
    errors: MJMLParseError[];
  }

  export interface MJMLParsingOptions {
    /** Fail on any validation error. Default "soft". */
    validationLevel?: "strict" | "soft" | "skip";
    /** Minify the produced HTML. */
    minify?: boolean;
    /** Keep comments in the output. Default true. */
    keepComments?: boolean;
  }

  export default function mjml2html(
    mjml: string,
    options?: MJMLParsingOptions,
  ): Promise<MJMLParseResults>;
}
