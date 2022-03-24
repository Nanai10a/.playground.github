import { build } from "esbuild";

build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  sourcemap: true,
  platform: "node",
  target: ["node16.14"],
  legalComments: "linked",
  outfile: "dist/index.js",
}).catch(console.log);
