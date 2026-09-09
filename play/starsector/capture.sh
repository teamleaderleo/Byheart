#!/bin/sh
set -eu
if [ "$#" -ne 2 ] && [ "$#" -ne 4 ]; then
  echo 'usage: capture.sh PREFLIGHT_JAR RUN_DIRECTORY [key|click REVIEWED_NAME]' >&2
  exit 2
fi
task_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
task_jar=$1
task_run=$2
shift 2
mkdir -p "$task_root/runtime"
task_classes=$(mktemp -d "$task_root/runtime/observer.XXXXXX")
trap 'rm -rf "$task_classes"' EXIT HUP INT TERM
# Compilation is also a compatibility gate: the jar must expose the reviewed
# observation-only attachment. Never silently fall back to a focus-click attach.
javac --release 17 -cp "$task_jar" -d "$task_classes" "$task_root/play/starsector/PreflightCapture.java"
export GDK_BACKEND=x11
java -cp "$task_classes:$task_jar" dev.starsector.preflight.cli.PreflightCapture "$task_run" "$@"
