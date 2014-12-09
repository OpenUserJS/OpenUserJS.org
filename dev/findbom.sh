#!/bin/bash
cd ..
echo "Searching for possible UTF-16 BE BOMs..."
find . -type f -not \( -path "./node_modules/*" \) -not \( -path "./fakeS3/*" \) -print0 | xargs -0r awk '/^\xFE\xFF/ {print FILENAME} {nextfile}'
echo "Searching for possible UTF-16 LE BOMs..."
find . -type f -not \( -path "./node_modules/*" \) -not \( -path "./fakeS3/*" \) -print0 | xargs -0r awk '/^\xFF\xFE/ {print FILENAME} {nextfile}'
echo "Searching for possible UTF-8 BOMs..."
find . -type f -not \( -path "./node_modules/*" \) -not \( -path "./fakeS3/*" \) -print0 | xargs -0r awk '/^\xEF\xBB\xBF/ {print FILENAME} {nextfile}'
cd - > /dev/null
