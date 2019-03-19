#!/bin/bash
cd ..
echo "Searching for possible non-UTF-8 compatible..."
find . -type f ! \( -path "./.git/*" -o -path "./node_modules/*" -o -path "./S3rver/*" -o -path "./dev/cache/*" \) -exec file --mime {} \; | grep -v 'utf-8\|binary\|ascii'
echo "Searching for possible UTF-8 BOMs..."
find . -type f ! \( -path "./.git/*" -o -path "./node_modules/*" -o -path "./S3rver/*" -o -path "./dev/cache/*" \) -print0 | xargs -0r awk '/^\xEF\xBB\xBF/ {print FILENAME} {nextfile}'
cd - > /dev/null
