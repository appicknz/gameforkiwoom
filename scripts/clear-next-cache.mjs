import { rmSync, existsSync } from "fs"
import { join } from "path"

const cacheDir = join(process.cwd(), ".next", "cache")

if (existsSync(cacheDir)) {
  rmSync(cacheDir, { recursive: true, force: true })
  console.log("✓ .next/cache cleared successfully")
} else {
  console.log("✓ .next/cache does not exist, nothing to clear")
}
