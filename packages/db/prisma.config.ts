/**
 * Prisma configuration for @stockviewer/db.
 *
 * Every path here is resolved against this file rather than the working
 * directory. The CLI is invoked from the repository root (`npm run db:*`) and
 * can equally be run from inside this package, and a cwd-relative schema path
 * resolves to a different file in each case — or to none, which Prisma reports
 * as a missing schema rather than a missing cwd.
 *
 * .env.local lives at the repository root because the web app owns
 * DATABASE_URL and both the app and the service read it from there.
 */
import path from "node:path";

import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

const packageDir = __dirname;
const repoRoot = path.resolve(packageDir, "..", "..");

config({ path: path.join(repoRoot, ".env.local") });

export default defineConfig({
  schema: path.join(packageDir, "prisma", "schema.prisma"),
  migrations: {
    path: path.join(packageDir, "prisma", "migrations"),
  },
  engine: "classic",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
