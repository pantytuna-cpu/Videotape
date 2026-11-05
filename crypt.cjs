// 렌더 입력·출력 파일 암호화(AES-256-GCM). 워커 저장소가 공개라 릴리스 자산·아티팩트는 암호문만 오간다.
// 형식: "GHR1"(4) + iv(12) + 암호문 + tag(16). 키는 base64 32바이트(로컬 .env.local의 GHA_RENDER_KEY = 저장소 비밀 RENDER_KEY).
// CLI: RENDER_KEY=... node crypt.cjs enc|dec <입력> <출력>
const fs = require('node:fs');
const crypto = require('node:crypto');
const {pipeline} = require('node:stream/promises');

const MAGIC = Buffer.from('GHR1');
const keyOf = b64 => {
  const key = Buffer.from(String(b64 || ''), 'base64');
  if (key.length !== 32) throw new Error('RENDER_KEY must be base64 of 32 bytes');
  return key;
};

async function encryptFile(input, output, keyB64) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyOf(keyB64), iv);
  const out = fs.createWriteStream(output);
  out.write(Buffer.concat([MAGIC, iv]));
  await pipeline(fs.createReadStream(input), cipher, out, {end: false});
  await new Promise((resolve, reject) => out.end(cipher.getAuthTag(), e => (e ? reject(e) : resolve())));
}

async function decryptFile(input, output, keyB64) {
  const size = fs.statSync(input).size;
  if (size < 32) throw new Error(`encrypted file too small: ${input}`);
  const fd = fs.openSync(input, 'r');
  const head = Buffer.alloc(16), tag = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  fs.readSync(fd, tag, 0, 16, size - 16);
  fs.closeSync(fd);
  if (!head.subarray(0, 4).equals(MAGIC)) throw new Error(`not a GHR1 file: ${input}`);
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyOf(keyB64), head.subarray(4, 16));
  decipher.setAuthTag(tag);
  await pipeline(fs.createReadStream(input, {start: 16, end: size - 17}), decipher, fs.createWriteStream(output));
}

module.exports = {encryptFile, decryptFile};

if (require.main === module) {
  const [mode, input, output] = process.argv.slice(2);
  const run = mode === 'enc' ? encryptFile : mode === 'dec' ? decryptFile : null;
  if (!run || !input || !output) {
    console.error('usage: node crypt.cjs enc|dec <in> <out>');
    process.exit(2);
  }
  run(input, output, process.env.RENDER_KEY).catch(e => { console.error(e && e.stack || e); process.exit(1); });
}
