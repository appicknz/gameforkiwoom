import { execSync } from "child_process"
import { readFileSync } from "fs"

try {
  const result = execSync(
    "cd /vercel/share/v0-project && npx next build 2>&1 | tail -100",
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 10, timeout: 300000 }
  )
  console.log(result)
} catch (e) {
  console.log("STDOUT:", e.stdout?.slice(-5000))
  console.log("STDERR:", e.stderr?.slice(-5000))
}
