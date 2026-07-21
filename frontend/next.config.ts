import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "mssql", "tedious"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./sql/**/*.sql"],
  },
};

export default nextConfig;
