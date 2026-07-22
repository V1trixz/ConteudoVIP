import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { execSync } from "child_process";
import "dotenv/config";

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const db = drizzle(process.env.DATABASE_URL);
  
  try {
    // Primeiro, geramos o SQL
    execSync("pnpm drizzle-kit generate", { stdio: "inherit" });
    
    // Depois aplicamos as migrações
    console.log("Applying migrations...");
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Migrations applied successfully!");
  } catch (err) {
    if (err.message && err.message.includes("already exists")) {
      console.log("Tabelas já existem, pulando a migração (isso é normal se você já rodou antes).");
    } else {
      console.error("Erro na migração:", err);
      process.exit(1);
    }
  }
}

run();
