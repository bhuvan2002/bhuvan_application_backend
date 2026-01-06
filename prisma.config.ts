
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_Tga0Ebx4AHCZ@ep-restless-truth-a843l05d-pooler.eastus2.azure.neon.tech/neondb?sslmode=require&channel_binding=require',
  },
});
