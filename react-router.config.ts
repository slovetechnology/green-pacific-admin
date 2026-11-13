import type { Config } from "@react-router/dev/config";

// SPA mode: the build is a folder of static files (build/client) that cPanel serves as-is.
// All data comes from the separately hosted API, so nothing renders on a server.
export default {
  appDirectory: "src",
  ssr: false,
} satisfies Config;
