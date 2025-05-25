import fs from "fs";
const path = "dist/bundle.global.d.ts";

let content = fs.readFileSync(path, "utf8");

// Indent all lines for namespace wrapping
content = content
  .split("\n")
  .map((line) => "  " + line)
  .join("\n");

const wrapped = `declare namespace GQuery {
${content}
}
declare var GQuery: typeof GQuery;
`;

fs.writeFileSync(path, wrapped);
console.log("bundle/global.d.ts wrapped for IIFE global.");
