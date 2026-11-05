// GitHub Actions 러너 한 대가 Remotion 작업 목록 하나를 렌더한다(remotion-job.yml, 범용).
// 입력 tar: bundle/(public/ 포함) + jobs/<part.index>.json = {items: [{id, inputProps, out, options}]}
//   options는 renderMedia 옵션 그대로(codec·crf·frameRange·muted·imageFormat·jpegQuality·x264Preset·sampleRate 등).
// 결과: OUT_DIR/<out>.enc (암호화). 항목마다 최대 3번 시도하고, 끝내 실패하면 종료 코드 1.
// env: PART(JSON {index}), JOB_DIR, OUT_DIR, RENDER_KEY
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {renderMedia, selectComposition} = require('@remotion/renderer');
const {encryptFile} = require('./crypt.cjs');

(async () => {
  const part = JSON.parse(process.env.PART);
  const jobDir = path.resolve(process.env.JOB_DIR), outDir = path.resolve(process.env.OUT_DIR);
  const serveUrl = path.join(jobDir, 'bundle');
  const job = JSON.parse(fs.readFileSync(path.join(jobDir, 'jobs', `${part.index}.json`), 'utf8'));
  fs.mkdirSync(outDir, {recursive: true});
  const chromiumOptions = {gl: 'swangle'};
  let failed = 0;
  for (const item of job.items) {
    const plain = path.join(os.tmpdir(), item.out), t0 = Date.now();
    for (let attempt = 1; ; attempt++) {
      try {
        const composition = await selectComposition({serveUrl, id: item.id, inputProps: item.inputProps, chromiumOptions});
        await renderMedia({concurrency: os.cpus().length, logLevel: 'error', offthreadVideoCacheSizeInBytes: 1024 * 1024 * 1024, ...item.options,
          composition, serveUrl, inputProps: item.inputProps, chromiumOptions, outputLocation: plain});
        break;
      } catch (e) {
        if (attempt >= 3) { failed++; console.log(`FAIL ${item.out} ${e && e.message}`); break; }
        console.log(`retry ${item.out} ${String(e && e.message).slice(0, 160)}`);
      }
    }
    if (fs.existsSync(plain)) {
      await encryptFile(plain, path.join(outDir, `${item.out}.enc`), process.env.RENDER_KEY);
      console.log(`DONE ${item.out} ${fs.statSync(plain).size} bytes ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      fs.rmSync(plain, {force: true});
    }
  }
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
