import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/**/*": ["./sql/**/*.sql"],
  },
};

export default nextConfig;
