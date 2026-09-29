/**
 * Generates large synthetic PDFs for the inspection benchmarks. They are never committed.
 * Run with: bun scripts/generate-pdf-fixtures.ts [dir]   (default .cache/fixtures)
 *
 *   pages-1k / pages-10k / pages-100k   empty pages under a balanced page tree (fan-out 100)
 *   scan-100p-150mb                     100 pages, each with a 1.5 MB image stream (size dominates)
 *   truncated-100k                      pages-100k cut in half: forces MuPDF's repair scan
 */
/// <reference types="node" />
import { createHash } from 'node:crypto';
import {
  closeSync,
  copyFileSync,
  mkdirSync,
  openSync,
  statSync,
  truncateSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';

const FANOUT = 100;
const CATALOG = 1;
const ROOT = 2;

class PdfWriter {
  private fd: number;
  private offset = 0;
  private offsets = new Map<number, number>();

  constructor(path: string) {
    this.fd = openSync(path, 'w');
    this.raw('%PDF-1.7\n');
  }

  private raw(data: string | Buffer) {
    const buf = typeof data === 'string' ? Buffer.from(data, 'latin1') : data;
    writeSync(this.fd, buf);
    this.offset += buf.length;
  }

  object(num: number, body: string) {
    this.offsets.set(num, this.offset);
    this.raw(`${num} 0 obj\n${body}\nendobj\n`);
  }

  stream(num: number, dict: string, data: Buffer) {
    this.offsets.set(num, this.offset);
    this.raw(`${num} 0 obj\n<<${dict}/Length ${data.length}>>\nstream\n`);
    this.raw(data);
    this.raw('\nendstream\nendobj\n');
  }

  finish(size: number) {
    const xrefAt = this.offset;
    let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
    for (let i = 1; i < size; i++) {
      xref += `${String(this.offsets.get(i) ?? 0).padStart(10, '0')} 00000 n \n`;
    }
    this.raw(
      `${xref}trailer\n<</Size ${size}/Root ${CATALOG} 0 R>>\nstartxref\n${xrefAt}\n%%EOF\n`,
    );
    closeSync(this.fd);
  }
}

type TreeNode = { num: number; kids: number[]; count: number; parent: number };

/** Object numbers for a balanced page tree. The topmost node is always object 2. */
function planTree(pageCount: number) {
  let next = ROOT + 1;
  const pages = Array.from({ length: pageCount }, () => next++);

  const nodes: TreeNode[] = [];
  const build = (kidNums: number[], counts: number[]): TreeNode[] => {
    const groups = Math.ceil(kidNums.length / FANOUT);
    const level: TreeNode[] = [];
    for (let g = 0; g < groups; g++) {
      const kids = kidNums.slice(g * FANOUT, (g + 1) * FANOUT);
      const count = counts.slice(g * FANOUT, (g + 1) * FANOUT).reduce((a, b) => a + b, 0);
      level.push({ num: groups === 1 ? ROOT : next++, kids, count, parent: 0 });
    }
    return level;
  };

  let level = build(
    pages,
    pages.map(() => 1),
  );
  nodes.push(...level);
  while (level.length > 1) {
    level = build(
      level.map((n) => n.num),
      level.map((n) => n.count),
    );
    nodes.push(...level);
  }
  const parentOf = new Map<number, number>();
  for (const node of nodes) for (const kid of node.kids) parentOf.set(kid, node.num);
  for (const node of nodes) node.parent = parentOf.get(node.num) ?? 0;

  return { pages, nodes, parentOf, next };
}

function writeTree(
  w: PdfWriter,
  plan: ReturnType<typeof planTree>,
  pageBody: (parent: number, index: number) => string,
) {
  for (const [i, num] of plan.pages.entries()) {
    w.object(num, pageBody(plan.parentOf.get(num) as number, i));
  }
  for (const node of plan.nodes) {
    const kids = node.kids.map((k) => `${k} 0 R`).join(' ');
    const parent = node.num === ROOT ? '' : `/Parent ${node.parent} 0 R`;
    w.object(node.num, `<</Type/Pages${parent}/Kids[${kids}]/Count ${node.count}>>`);
  }
}

function emptyPages(path: string, pageCount: number) {
  const w = new PdfWriter(path);
  const plan = planTree(pageCount);
  w.object(CATALOG, `<</Type/Catalog/Pages ${ROOT} 0 R>>`);
  writeTree(w, plan, (parent) => `<</Type/Page/Parent ${parent} 0 R/MediaBox[0 0 612 792]>>`);
  w.finish(plan.next);
}

/** Reproducible pseudo-random bytes (SHA-256 in counter mode), so fixture fingerprints are stable. */
function deterministicBytes(seed: number, length: number): Buffer {
  const out = Buffer.alloc(length);
  for (let offset = 0, counter = 0; offset < length; counter++) {
    const block = createHash('sha256').update(`muse-fixture-${seed}-${counter}`).digest();
    block.copy(out, offset, 0, Math.min(block.length, length - offset));
    offset += block.length;
  }
  return out;
}

function scan(path: string, pageCount: number, bytesPerImage: number) {
  const w = new PdfWriter(path);
  const plan = planTree(pageCount);
  const firstImage = plan.next;
  w.object(CATALOG, `<</Type/Catalog/Pages ${ROOT} 0 R>>`);
  writeTree(
    w,
    plan,
    (parent, i) =>
      `<</Type/Page/Parent ${parent} 0 R/MediaBox[0 0 612 792]/Resources<</XObject<</Im0 ${firstImage + i} 0 R>>>>>>`,
  );
  for (let i = 0; i < pageCount; i++) {
    // Inspection never decodes images; pseudo-random bytes stand in for scanned image data.
    w.stream(
      firstImage + i,
      '/Type/XObject/Subtype/Image/Width 1700/Height 2200/ColorSpace/DeviceGray/BitsPerComponent 8/Filter/DCTDecode',
      deterministicBytes(i, bytesPerImage),
    );
  }
  w.finish(firstImage + pageCount);
}

const dir = process.argv[2] ?? '.cache/fixtures';
mkdirSync(dir, { recursive: true });

emptyPages(join(dir, 'pages-1k.pdf'), 1_000);
emptyPages(join(dir, 'pages-10k.pdf'), 10_000);
emptyPages(join(dir, 'pages-100k.pdf'), 100_000);
scan(join(dir, 'scan-100p-150mb.pdf'), 100, 1_500_000);

const truncated = join(dir, 'truncated-100k.pdf');
copyFileSync(join(dir, 'pages-100k.pdf'), truncated);
truncateSync(truncated, Math.floor(statSync(truncated).size / 2));

for (const name of ['pages-1k', 'pages-10k', 'pages-100k', 'scan-100p-150mb', 'truncated-100k']) {
  console.log(`${name}.pdf ${statSync(join(dir, `${name}.pdf`)).size} bytes`);
}
