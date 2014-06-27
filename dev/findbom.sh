#!/bin/bash
cd ..
find . -type f -print0 | xargs -0r awk '/^\xEF\xBB\xBF/ {print FILENAME} {nextfile}'
cd -
