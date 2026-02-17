export function isImageExtension(ext?: string) {
  return ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "tif" || ext === "tiff";
}

export function isReceiptLikeLayout(layoutResult: any): boolean {
  const content = (layoutResult?.content ?? "").toString().toLowerCase();
  if (!content) return false;

  const receiptKeywords = [
    "kassenbon",
    "bon",
    "receipt",
    "summe",
    "gesamt",
    "mwst",
    "ust",
    "tax",
    "total",
  ];
  const invoiceKeywords = ["invoice", "rechnung", "invoice number", "rechnungsnummer"];

  const receiptMatch = receiptKeywords.some((kw) => content.includes(kw));
  const invoiceMatch = invoiceKeywords.some((kw) => content.includes(kw));

  if (receiptMatch && !invoiceMatch) return true;
  if (invoiceMatch && !receiptMatch) return false;

  return false;
}

export async function pdfHasTextLayer(
  supabase: any,
  filePath: string,
  bucket = "documents"
): Promise<boolean> {
  const { data, error } = await supabase.storage.from(bucket).download(filePath);
  if (error || !data) {
    return false;
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  const slice = bytes.subarray(0, Math.min(bytes.length, 200000));
  const text = new TextDecoder().decode(slice);
  return /\/Font|\/BaseFont|\nBT\b|\rBT\b/.test(text);
}