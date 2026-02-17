import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "node:path";
import { listFiles, uploadDocument } from "../src/documents/uploader";

// Operational script: always targets LIVE Supabase via dedicated env vars.
// Keep test and live permanently separated by using different var names/files.
dotenv.config({ path: ".env.live.local" });
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_LIVE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_LIVE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_LIVE_URL or SUPABASE_LIVE_SERVICE_ROLE_KEY in env."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Usage:
  // pnpm upload:documents -- <tenantId> <fileOrFolderPath> [uploadedByUserId] [--recursive]
  //
  // Example (upload all files from analyze fixtures folder):
  // pnpm upload:documents -- <tenantId> "tests-backend/documents-analyzes/azure-analyze" --recursive
  const args = process.argv.slice(2);
  const recursive = args.includes("--recursive");
  const positional = args.filter((a) => a !== "--recursive");
  const [tenantId, targetPath, uploadedBy] = positional;

  if (!tenantId || !targetPath) {
    console.log(
      "Usage: pnpm upload:documents -- <tenantId> <fileOrFolderPath> [uploadedByUserId] [--recursive]"
    );
    process.exit(1);
  }

  const files = listFiles(targetPath, recursive);
  console.log(`Uploading ${files.length} document(s) for tenant ${tenantId}...`);

  let ok = 0;
  for (const f of files) {
    try {
      const res = await uploadDocument({
        supabase,
        tenantId,
        filePath: f,
        uploadedBy: uploadedBy ?? null,
      });
      ok++;
      console.log(`[OK] ${path.basename(f)} -> ${res.documentId}`);
    } catch (e: any) {
      console.log(`[FAIL] ${path.basename(f)} -> ${e?.message ?? String(e)}`);
    }
  }

  console.log(`Done. OK=${ok}, Failed=${files.length - ok}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
