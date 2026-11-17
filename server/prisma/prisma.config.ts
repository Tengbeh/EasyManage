import "dotenv/config";
import { defineConfig } from "prisma/config";
export default defineConfig({
  schema: "schema.prisma",
  migrations: { path: "migrations" },
  datasource: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://unconfigured:unconfigured@127.0.0.1:5432/easymanage",
  },
});
