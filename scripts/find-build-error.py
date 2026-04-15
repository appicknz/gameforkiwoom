import subprocess
import sys

result = subprocess.run(
    ["pnpm", "next", "build"],
    cwd="/app",
    capture_output=True,
    text=True,
    timeout=300
)

print("=== STDOUT ===")
print(result.stdout[-8000:] if len(result.stdout) > 8000 else result.stdout)
print("=== STDERR ===")
print(result.stderr[-8000:] if len(result.stderr) > 8000 else result.stderr)
print("=== EXIT CODE:", result.returncode)
