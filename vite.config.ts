import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { crx, type ManifestV3Export } from "@crxjs/vite-plugin";
import { defineConfig, type Plugin } from "vite";

const root = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(root, "manifest.json");
const distDir = resolve(root, "dist");

function readSourceManifest(): ManifestV3Export {
  return JSON.parse(readFileSync(manifestPath, "utf8")) as ManifestV3Export;
}

/** Fail the build if CRXJS writes a different name or version than manifest.json. */
function assertBuiltManifest(): Plugin {
  return {
    name: "gcet-manifest-version",
    apply: "build",
    closeBundle() {
      const source = readSourceManifest() as {
        name?: string;
        version?: string;
      };
      const builtPath = resolve(distDir, "manifest.json");
      const built = JSON.parse(readFileSync(builtPath, "utf8")) as {
        name?: string;
        version?: string;
      };
      if (built.name !== source.name || built.version !== source.version) {
        throw new Error(
          `dist/manifest.json is "${built.name}" ${built.version}, but manifest.json is "${source.name}" ${source.version}`,
        );
      }
      console.log(
        `\nExtension card title: ${built.name}\nVersion field: ${built.version}\nLoad unpacked this folder:\n${distDir}\n`,
      );
    },
  };
}

export default defineConfig({
  build: {
    outDir: distDir,
    emptyOutDir: true,
  },
  plugins: [
    crx({ manifest: readSourceManifest }),
    assertBuiltManifest(),
  ],
  test: {
    environment: "happy-dom",
    globals: true,
  },
});
