"""py-job.yml 한 part: jobs/<index>.json의 명령을 작업 폴더에서 실행하고 outputs(glob)를 tar로 묶어 암호화한다.

job = {"cwd": "work", "cmd": ["python", "code/x.py", ...], "env": {...}, "outputs": ["work/out/**"]}
경로의 {JOB}는 풀린 입력 폴더, {BLENDER}는 블렌더 실행 파일로 바뀐다. 명령이 실패해도 만들어진 outputs는 돌려주고 종료 코드를 그대로 낸다.
"""
import glob
import json
import os
import subprocess
import sys
import tarfile
import time

job_dir = os.path.join(os.environ["RUNNER_TEMP"], "job")
out_dir = os.path.join(os.environ["RUNNER_TEMP"], "out")
part = json.loads(os.environ["PART"])
spec = json.load(open(os.path.join(job_dir, "jobs", f"{part['index']}.json"), encoding="utf-8"))
sub = lambda s: s.replace("{JOB}", job_dir).replace("{BLENDER}", os.environ.get("BLENDER", "blender"))  # noqa: E731
env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8", **{k: sub(v) for k, v in spec.get("env", {}).items()}}
cwd = os.path.join(job_dir, spec.get("cwd", "."))
t0 = time.time()
code = subprocess.call([sub(c) for c in spec["cmd"]], cwd=cwd, env=env)
print(f"exit {code} in {time.time() - t0:.0f}s", flush=True)
os.makedirs(out_dir, exist_ok=True)
files = sorted({f for pat in spec.get("outputs", []) for f in glob.glob(os.path.join(job_dir, pat), recursive=True) if os.path.isfile(f)})
plain = os.path.join(os.environ["RUNNER_TEMP"], f"part-{part['index']}.tar")
with tarfile.open(plain, "w") as tf:
    for f in files:
        tf.add(f, arcname=os.path.relpath(f, job_dir))
print(f"{len(files)} output file(s)", flush=True)
r = subprocess.call(["node", os.path.join(os.environ["GITHUB_WORKSPACE"], "crypt.cjs"), "enc", plain, os.path.join(out_dir, f"part-{part['index']:04d}.tar.enc")])
sys.exit(code or r)
