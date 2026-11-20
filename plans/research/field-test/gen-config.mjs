import { writeFileSync } from "node:fs";

const uis = process.argv.slice(2);
const views = uis.flatMap((ui) =>
  ["jumpy", "stable"].flatMap((variant) =>
    [390, 768, 1280, 1440].map((width) => ({
      page: `${ui}-${variant}`,
      name: `${width}`,
      url: `/?page=field-test&ui=${ui}&variant=${variant}`,
      width,
      height: 900,
      steps: [{ wait: `[data-anchor='${ui.slice(0, 4)}']` }],
    })),
  ),
);
const config = {
  baseUrl: "http://localhost:5173",
  anchorAttribute: "data-anchor",
  maxAnchors: 4,
  jumpScale: "viewport",
  views,
};
writeFileSync(new URL("audit.config.json", import.meta.url), JSON.stringify(config, null, 2));
