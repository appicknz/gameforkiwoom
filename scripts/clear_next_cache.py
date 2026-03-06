import shutil
import os

cache_path = "/vercel/share/v0-project/.next/cache"

if os.path.exists(cache_path):
    shutil.rmtree(cache_path)
    print(f"Deleted: {cache_path}")
else:
    print(f"Not found (already clean): {cache_path}")
