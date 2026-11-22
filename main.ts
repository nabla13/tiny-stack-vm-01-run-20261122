// Tiny stack VM for make.fun bounty tiny-stack-vm-01-run-20261122.
// Implements the kit ISA: 32-bit wrapping values, 256-deep data stack,
// 64-deep call stack, 256 words of memory, 1M steps, 64K output, traps 2..11.
// Driver: each dir under MAKEFUN_INPUT_DIR holds program.bin + input.bin;
// writes stdout.bin + exit.txt under MAKEFUN_OUTPUT_DIR.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
function meta(op: number): number {
  switch (op) {
    case 0x00: return 0x000000;
    case 0x01: return 0x010001;
    case 0x02: return 0x010004;
    case 0x03: return 0x000100;
    case 0x04: return 0x020100;
    case 0x05: return 0x020200;
    case 0x06: return 0x030200;
    case 0x07: return 0x030300;
    case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15:
    case 0x16: case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d:
    case 0x1e: case 0x20: case 0x21: case 0x22:
      return 0x010200;
    case 0x17: case 0x1b: return 0x010100;
    case 0x30: return 0x000002;
    case 0x31: case 0x32: return 0x000102;
    case 0x33: return 0x000002;
    case 0x34: return 0x000000;
    case 0x40: return 0x010100;
    case 0x41: return 0x000200;
    case 0x50: case 0x51: return 0x000100;
    case 0x52: return 0x010000;
    case 0x53: return 0x000100;
    default: return -1;
  }
}
function run(prog: Uint8Array, input: Uint8Array): { out: Uint8Array; exit: number } {
  const n = prog.length, D = new Int32Array(256);
  let sp = 0;
  const C = new Int32Array(64);
  let cp = 0;
  const M = new Int32Array(256);
  const O = new Uint8Array(65536);
  let ol = 0, ip = 0, pc = 0, steps = 0;
  const done = (exit: number) => ({ out: O.slice(0, ol), exit });
  for (;;) {
    if (steps === 1000000) return done(10);
    if (pc < 0 || pc >= n) return done(9);
    const op = prog[pc], m = meta(op);
    if (m < 0) return done(5);
    const imm = m & 255, pops = (m >> 8) & 255, push = (m >> 16) & 255;
    if (pc + imm >= n) return done(9);
    steps++;
    const nx = pc + 1 + imm;
    if (sp < pops) return done(2);
    if (sp - pops + push > 256) return done(3);
    pc = nx;
    switch (op) {
      case 0x00: return done(0);
      case 0x01: D[sp++] = (prog[nx - 1] << 24) >> 24; break;
      case 0x02:
        D[sp++] = prog[nx - 4] | (prog[nx - 3] << 8) | (prog[nx - 2] << 16) | (prog[nx - 1] << 24);
        break;
      case 0x03: sp--; break;
      case 0x04: D[sp] = D[sp - 1]; sp++; break;
      case 0x05: { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; }
      case 0x06: D[sp] = D[sp - 2]; sp++; break;
      case 0x07: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
      case 0x17: D[sp - 1] = -D[sp - 1] | 0; break;
      case 0x1b: D[sp - 1] = ~D[sp - 1]; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15:
      case 0x16: case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d:
      case 0x1e: case 0x20: case 0x21: case 0x22: {
        const b = D[sp - 1], a = D[sp - 2];
        let r: number;
        switch (op) {
          case 0x10: r = (a + b) | 0; break;
          case 0x11: r = (a - b) | 0; break;
          case 0x12: r = Math.imul(a, b); break;
          case 0x13:
            if (b === 0) return done(4);
            r = a === -2147483648 && b === -1 ? a : (a / b) | 0;
            break;
          case 0x14:
            if (b === 0) return done(4);
            r = b === -1 ? 0 : (a % b) | 0;
            break;
          case 0x15:
            if (b === 0) return done(4);
            r = Math.floor((a >>> 0) / (b >>> 0)) | 0;
            break;
          case 0x16:
            if (b === 0) return done(4);
            r = ((a >>> 0) % (b >>> 0)) | 0;
            break;
          case 0x18: r = a & b; break;
          case 0x19: r = a | b; break;
          case 0x1a: r = a ^ b; break;
          case 0x1c: r = a << (b & 31); break;
          case 0x1d: r = a >> (b & 31); break;
          case 0x1e: r = (a >>> (b & 31)) | 0; break;
          case 0x20: r = a === b ? 1 : 0; break;
          case 0x21: r = a < b ? 1 : 0; break;
          default: r = a >>> 0 < (b >>> 0) ? 1 : 0; break;
        }
        sp -= 2; D[sp++] = r;
        break;
      }
      case 0x30: case 0x31: case 0x32: {
        const rel = ((prog[nx - 2] | (prog[nx - 1] << 8)) << 16) >> 16;
        let take = true;
        if (op !== 0x30) { const v = D[--sp]; take = op === 0x31 ? v === 0 : v !== 0; }
        if (take) pc = nx + rel;
        break;
      }
      case 0x33:
        if (cp === 64) return done(7);
        C[cp++] = nx;
        pc = prog[nx - 2] | (prog[nx - 1] << 8);
        break;
      case 0x34:
        if (cp === 0) return done(8);
        pc = C[--cp];
        break;
      case 0x40: {
        const addr = D[sp - 1];
        if (addr < 0 || addr >= 256) return done(6);
        D[sp - 1] = M[addr];
        break;
      }
      case 0x41: {
        const addr = D[sp - 1], v = D[sp - 2];
        if (addr < 0 || addr >= 256) return done(6);
        sp -= 2; M[addr] = v;
        break;
      }
      case 0x50: {
        const t = String(D[sp - 1]);
        if (ol + t.length > 65536) return done(11);
        sp--;
        for (let i = 0; i < t.length; i++) O[ol++] = t.charCodeAt(i);
        break;
      }
      case 0x51:
        if (ol + 1 > 65536) return done(11);
        O[ol++] = D[--sp] & 255;
        break;
      case 0x52:
        D[sp++] = ip < input.length ? input[ip++] : -1;
        break;
      default: return done(D[--sp] & 255);
    }
  }
}
const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const prog = readFileSync(join(I, id, 'program.bin'));
  let input: Buffer;
  try { input = readFileSync(join(I, id, 'input.bin')); } catch { input = Buffer.alloc(0); }
  const { out, exit } = run(prog, input);
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), out);
  writeFileSync(join(O, id, 'exit.txt'), `${exit}\n`);
}
