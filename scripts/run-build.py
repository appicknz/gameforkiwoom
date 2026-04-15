import subprocess, os, shutil

# pnpm 경로 탐색
pnpm = shutil.which("pnpm") or shutil.which("npx")
print(f"pnpm: {pnpm}")

# package.json이 있는 디렉토리 탐색
candidates = ["/app", "/vercel/path0", "/vercel/share/v0-project", os.getcwd()]
project_root = None
for root in candidates:
    if os.path.exists(os.path.join(root, "package.json")):
        project_root = root
        break

print(f"Project root: {project_root}")
if not project_root or not pnpm:
    print("ERROR: cannot find project or pnpm")
    raise SystemExit(1)

# npx 사용 시
if "npx" in (pnpm or ""):
    cmd = [pnpm, "next", "build"]
else:
    cmd = [pnpm, "next", "build"]

result = subprocess.run(
    cmd,
    cwd=project_root,
    capture_output=True,
    text=True,
    timeout=300
)

output = result.stdout + "\n" + result.stderr
print(output[-10000:] if len(output) > 10000 else output)
print("EXIT CODE:", result.returncode)
