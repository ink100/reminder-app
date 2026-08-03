import { config } from "dotenv";

// Match Next's project-level env priority without depending on Next.js.
export function loadProjectEnv() {
  const mode = process.env.NODE_ENV;
  const paths = [
    mode ? `.env.${mode}.local` : undefined,
    mode === "test" ? undefined : ".env.local",
    mode ? `.env.${mode}` : undefined,
    ".env",
  ].filter((path): path is string => Boolean(path));

  config({ path: paths, override: false, quiet: true });
}
