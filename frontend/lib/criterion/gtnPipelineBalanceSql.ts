import "server-only";

import { readFileSync } from "fs";
import path from "path";

const sqlDir = path.join(process.cwd(), "sql", "criterion-gtn-pipeline-balance", "runtime");

export const criterionGtnPipelineBalanceSql = {
  latestCompleteDate: readFileSync(path.join(sqlDir, "latest-complete-date.sql"), "utf8"),
  flowSummary: readFileSync(path.join(sqlDir, "flow-summary.sql"), "utf8"),
  componentBalance: readFileSync(path.join(sqlDir, "component-balance.sql"), "utf8"),
  plantNoms: readFileSync(path.join(sqlDir, "plant-noms.sql"), "utf8"),
  capacity: readFileSync(path.join(sqlDir, "capacity.sql"), "utf8"),
  diagnostics: readFileSync(path.join(sqlDir, "diagnostics.sql"), "utf8"),
} as const;
