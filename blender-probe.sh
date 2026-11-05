#!/usr/bin/env bash
# blender-probe.yml 한 구간: cut.blend의 start~end 프레임을 소프트웨어 GPU로 렌더하고 시간·GL 정보를 기록한다.
set -u
read -r INDEX BACKEND START END < <(node -e 'const p=JSON.parse(process.env.PART);console.log(p.index,p.backend,p.start,p.end)')
OUT="$RUNNER_TEMP/out" FR="$RUNNER_TEMP/frames-$INDEX"
mkdir -p "$OUT" "$FR"
export LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe LP_NUM_THREADS="$(nproc)"
T0=$(date +%s.%N)
xvfb-run -a -s "-screen 0 1920x1080x24" ~/blender/blender -b "$RUNNER_TEMP/job/cut.blend" --gpu-backend "$BACKEND" \
  -o "$FR/f_####" -s "$START" -e "$END" -a > "$FR/blender.log" 2>&1
CODE=$?
T1=$(date +%s.%N)
N=$(ls "$FR"/f_*.png 2>/dev/null | wc -l)
SECS=$(echo "$T1 - $T0" | bc)
{
  echo "{\"index\":$INDEX,\"backend\":\"$BACKEND\",\"start\":$START,\"end\":$END,\"exit\":$CODE,\"frames\":$N,\"seconds\":$SECS,\"nproc\":$(nproc)}"
} > "$FR/result.json"
grep -iE "renderer|vendor|llvmpipe|lavapipe|vulkan|opengl|error|fra:" "$FR/blender.log" | head -40
cat "$FR/result.json"
tar -cf "$RUNNER_TEMP/probe-$INDEX.tar" -C "$FR" .
node crypt.cjs enc "$RUNNER_TEMP/probe-$INDEX.tar" "$OUT/probe-$(printf %04d "$INDEX").tar.enc"
exit $CODE
