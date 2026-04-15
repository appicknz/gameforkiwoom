#!/bin/bash
cd /vercel/share/v0-project
npx tsc --noEmit 2>&1 | head -100
