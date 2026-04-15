import subprocess, sys

result = subprocess.run(
    ["pnpm", "next", "build"],
    cwd="/vercel/share/v0-project",
    capture_output=True,
    text=True,
    timeout=300
)

output = result.stdout + "\n" + result.stderr
print(output[-8000:] if len(output) > 8000 else output)
print("EXIT CODE:", result.returncode)
