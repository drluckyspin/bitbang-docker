/** Files embedded in the binary at build time with `import ... with { type: "text" }`. */
declare module "*.md" {
  const text: string;
  export default text;
}
