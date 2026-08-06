import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "mssql", "tedious"],
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./sql/**/*",
      "./data/pjm_network_model.raw",
      "../backend/modelling/pjm_da_models/sql_inputs/**/*",
    ],
  },
};

export default nextConfig;
