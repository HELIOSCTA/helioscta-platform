import "server-only";

import { readFileSync } from "fs";
import path from "path";

const sqlDir = path.join(process.cwd(), "sql", "criterion-noms", "runtime");

export const criterionNomsSql = {
  plantNoms: readFileSync(path.join(sqlDir, "plant-noms.sql"), "utf8"),
} as const;
