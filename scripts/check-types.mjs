import { execSync } from "child_process"
import { existsSync } from "fs"

const cwd = "/vercel/share/v0-project"

try {
  const result = execSync("npx tsc --noEmit 2>&1 || true", { cwd, encoding: "utf8", maxBuffer: 1024 * 1024 * 10 })
  console.log(result)
} catch (e) {
  console.log(e.stdout)
  console.log(e.stderr)
}
