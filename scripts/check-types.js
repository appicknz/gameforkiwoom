import { execSync } from "child_process"
import { join } from "path"

const projectDir = "/vercel/share/v0-project"

try {
  const result = execSync(
    `cd ${projectDir} && ./node_modules/.bin/tsc --noEmit 2>&1 || true`,
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 10 }
  )
  console.log(result || "No TypeScript errors found.")
} catch (e) {
  console.log(e.stdout || e.message)
}
