import { execSync } from "child_process"

try {
  const output = execSync("cd /vercel/share/v0-project && pnpm next build 2>&1", {
    timeout: 120000,
    encoding: "utf8",
  })
  console.log(output)
} catch (e) {
  console.log(e.stdout || "")
  console.log(e.stderr || "")
  console.log(String(e.message).slice(0, 3000))
}
