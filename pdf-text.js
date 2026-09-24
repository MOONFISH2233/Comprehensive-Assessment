/**
 * 浏览器内从 PDF 抽文本。
 *
 * pdf.js 有 1.3MB（主库 300KB + worker 1MB），所以**按需加载**：
 * 只有用户真的点了「上传 PDF」才 import，学生走答题流程永远不下载它。
 *
 * 抽出来的文本是「碎片」形式（每个 text item 一小块），直接拼会串行。
 * 这里按坐标重排成行，能显著提高后续解析的准确度 ——
 * 表格被压扁本来就是解析失败的头号原因。
 */

/** @returns {Promise<string>} 抽取的纯文本，按行组织 */
export async function extractPdfText(file, onProgress) {
  const pdfjs = await import('./pdfjs.min.js');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdfjs.worker.min.js', import.meta.url).href;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pages = [];

  try {
    for (let i = 1; i <= doc.numPages; i++) {
      onProgress?.(i, doc.numPages);
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(reflow(content.items, page.getViewport({ scale: 1 })));
    }
  } finally {
    doc.destroy();
  }
  return pages.join('\n');
}

/**
 * 把碎片按坐标重排成行。
 * pdf.js 给的 items 顺序是 PDF 内容流的顺序，表格里常常是「一列一列」出来的，
 * 所以按 y 分行、按 x 排序能得到接近人眼读到的顺序。
 */
function reflow(items, viewport) {
  const frags = items
    .filter(it => it.str && it.str.trim())
    .map(it => ({
      str: it.str,
      x: it.transform[4],
      y: viewport.height - it.transform[5],   // PDF 原点在左下，翻过来跟屏幕一致
      w: it.width ?? 0
    }));
  if (!frags.length) return '';

  frags.sort((a, b) => a.y - b.y || a.x - b.x);

  const lines = [];
  let line = [];
  let lastY = null;

  for (const f of frags) {
    // 同一行的判定：纵向偏差小于半个字高
    if (lastY === null || Math.abs(f.y - lastY) <= 3) {
      line.push(f);
      lastY = lastY === null ? f.y : (lastY + f.y) / 2;
    } else {
      lines.push(joinLine(line));
      line = [f];
      lastY = f.y;
    }
  }
  if (line.length) lines.push(joinLine(line));

  return lines.filter(Boolean).join('\n');
}

function joinLine(frags) {
  frags.sort((a, b) => a.x - b.x);
  let out = '';
  let prevEnd = null;
  for (const f of frags) {
    if (prevEnd !== null && f.x - prevEnd > 6) out += ' ';   // 中间有明显空隙才补空格
    out += f.str;
    prevEnd = f.x + f.w;
  }
  return out.replace(/\s+/g, ' ').trim();
}
