/// <reference path="../../supabase/functions/deno.d.ts" />
// Run with: pnpm test:pdf-embedded-xml

import { extractEmbeddedXmlFromPdf } from "../../supabase/functions/_shared/pdf-embedded-xml.ts";
import { parseXmlString } from "../../supabase/functions/_shared/xml-parser.ts";
import {
  assert,
  buildStoragePath,
  createDocumentRow,
  createSupabaseTestClient,
  getFileName,
  getTestTenantId,
  loadEnvFiles,
  removeFile,
  uploadLocalFile,
} from "./_shared.ts";

const BUCKET = "documents";
const RUNS_TABLE = "document_xml_parse_runs";
const EXTRACTIONS_TABLE = "document_extractions";
const KEEP_FILES = Deno.env.get("SUPABASE_KEEP_TEST_FILES") !== "0";
const PDF_DIR = new URL("../documents-analyzes/pdf-embedded-xml/", import.meta.url);

async function listPdfFiles(): Promise<string[]> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(PDF_DIR)) {
    if (!entry.isFile) continue;
    if (!entry.name.toLowerCase().endsWith(".pdf")) continue;
    names.push(entry.name);
  }
  return names;
}

async function run() {
  await loadEnvFiles();
  const supabase = createSupabaseTestClient();
  const tenantId = await getTestTenantId(supabase);
  const files = await listPdfFiles();
  if (!files.length) {
    throw new Error(`No PDF files found in ${PDF_DIR.pathname}`);
  }

  for (const fileName of files) {
    const fileUrl = new URL(fileName, PDF_DIR);
    const storagePath = buildStoragePath("pdf-embedded-xml", fileName);

    const uploadMeta = await uploadLocalFile(
      supabase,
      BUCKET,
      fileUrl,
      storagePath
    );
    const documentId = await createDocumentRow({
      supabase,
      tenantId,
      storageBucket: BUCKET,
      storagePath,
      originalFilename: fileName,
      mimeType: uploadMeta.contentType,
      fileSize: uploadMeta.size,
    });

    try {
      const result = await extractEmbeddedXmlFromPdf(
        supabase,
        storagePath,
        BUCKET
      );

      assert(result.found, "No embedded XML found in PDF");
      assert(result.xml && result.xml.length > 0, "Embedded XML is empty");

      const parsed = parseXmlString(result.xml, "embedded_xml");
      assert(parsed.invoiceNumber, "Parsed invoice number missing");
      assert(parsed.totalGross && parsed.totalGross > 0, "Parsed total gross");
      const { data: saved, error: saveError } = await (supabase
        .from(RUNS_TABLE) as any)
        .insert({
          storage_path: storagePath,
          source_type: parsed.sourceType,
          parsed_data: parsed,
        })
        .select("id")
        .single();
      if (saveError) {
        throw new Error(
          `Failed to save embedded XML parse result (${fileName}): ${saveError.message}`
        );
      }

      const { error: extractionError } = await (supabase
        .from(EXTRACTIONS_TABLE) as any)
        .upsert({
          document_id: documentId,
          status: "succeeded",
          parsing_path: "embedded_xml",
          model_used: "embedded_xml",
          parse_confidence: 0.95,
          detected_document_type: parsed.documentType ?? "invoice",
          detection_confidence: 1,
          detection_reasons: ["embedded_xml"],
          parsed_data: parsed,
        });
      if (extractionError) {
        throw new Error(
          `Failed to save extraction (${fileName}): ${extractionError.message}`
        );
      }

      console.log("[pdf-embedded-xml] ok", {
        fileName,
        documentId,
        embeddedFile: result.fileName,
        invoiceNumber: parsed.invoiceNumber,
        totalGross: parsed.totalGross,
        runId: saved?.id,
      });
    } finally {
      if (!KEEP_FILES) {
        await removeFile(supabase, BUCKET, storagePath);
      }
    }
  }
}

if (import.meta.main) {
  run().catch((error) => {
    console.error(error);
    Deno.exit(1);
  });
}
