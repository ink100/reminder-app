import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineNuxtConfig({
  future: { compatibilityVersion: 4 },
  ssr: true,
  modules: ["@element-plus/nuxt"],
  css: ["~/assets/css/main.css"],
  components: [{ path: "~/components", pathPrefix: false }],
  alias: {
    "@": rootDir,
  },
  nitro: {
    preset: "node-server",
  },
});