import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFStream,
  PDFHexString,
  PDFString,
  decodePDFRawStream,
  PDFRawStream,
} from "https://esm.sh/pdf-lib@1.17.1";

export async function extractEmbeddedXmlFromPdf(
  supabaseClient: any,
  filePath: string,
  bucket = "documents"
): Promise<{ found: boolean; xml?: string; fileName?: string }> {
  try {
    const { data, error } = await supabaseClient.storage
      .from(bucket)
      .download(filePath);

    if (error || !data) {
      return { found: false };
    }

    const pdfBytes = await data.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfBytes);

    if (!pdfDoc.catalog.has(PDFName.of("Names"))) {
      return { found: false };
    }

    const Names = pdfDoc.catalog.lookup(PDFName.of("Names"), PDFDict);
    if (!Names.has(PDFName.of("EmbeddedFiles"))) {
      return { found: false };
    }

    const EmbeddedFiles = Names.lookup(PDFName.of("EmbeddedFiles"), PDFDict);
    if (!EmbeddedFiles.has(PDFName.of("Names"))) {
      return { found: false };
    }

    const EFNames = EmbeddedFiles.lookup(PDFName.of("Names"), PDFArray);

    for (let idx = 0; idx < EFNames.size(); idx += 2) {
      const fileNameObj = EFNames.lookup(idx);
      let embeddedName = "";

      if (fileNameObj instanceof PDFHexString) {
        embeddedName = fileNameObj.decodeText();
      } else if (fileNameObj instanceof PDFString) {
        embeddedName = fileNameObj.decodeText();
      }

      const lowerName = embeddedName.toLowerCase();

      if (
        lowerName.endsWith(".xml") &&
        (lowerName.includes("factur") ||
          lowerName.includes("zugferd") ||
          lowerName.includes("xrechnung"))
      ) {
        try {
          const fileSpec = EFNames.lookup(idx + 1, PDFDict);
          const stream = fileSpec
            .lookup(PDFName.of("EF"), PDFDict)
            .lookup(PDFName.of("F"), PDFStream) as PDFRawStream;

          const xmlBytes = decodePDFRawStream(stream).decode();
          const xmlString = new TextDecoder().decode(xmlBytes);

          return { found: true, xml: xmlString, fileName: embeddedName };
        } catch {
          // Continue scanning other embedded files.
        }
      }
    }

    return { found: false };
  } catch {
    return { found: false };
  }
}