import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

// cf dev / cf build start Vite with this config (Worker settings are in cloudflare.config.ts)
export default defineConfig({ plugins: [cloudflare()] });
