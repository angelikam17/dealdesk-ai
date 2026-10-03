// Browser-side PDF text extraction with pdf.js. Loaded lazily so the
// ~1 MB library only downloads when someone actually uploads a PDF.

export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export function validatePdfFile(file) {
  if (!file) return 'Choose a PDF file.';
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf) return 'Only PDF files are supported.';
  if (file.size > MAX_PDF_BYTES) return `This file is ${(file.size / 1048576).toFixed(1)} MB. The limit is 10 MB.`;
  return null;
}

/** Join pdf.js text items into lines, respecting end-of-line markers. */
export function textFromItems(items) {
  let out = '';
  for (const item of items) {
    if (!('str' in item)) continue;
    out += item.str;
    out += item.hasEOL ? '\n' : item.str ? ' ' : '';
  }
  return out;
}

export async function extractPdfText(file) {
  const [pdfjs, { default: workerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  try {
    const pdf = await task.promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(textFromItems(content.items));
    }
    return pages.join('\n');
  } finally {
    await task.destroy(); // frees the worker; PDFDocumentProxy.destroy() no longer exists in pdf.js v6
  }
}
