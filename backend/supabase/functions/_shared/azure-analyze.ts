type SupabaseDownloadResult = {
  data: Blob | null;
  error: { message?: string } | null;
};

type SupabaseStorageBucket = {
  download: (path: string) => Promise<SupabaseDownloadResult>;
};

type SupabaseStorage = {
  from: (bucket: string) => SupabaseStorageBucket;
};

type SupabaseClientLike = {
  storage: SupabaseStorage;
};

export async function analyzeWithAzure(
  supabaseClient: SupabaseClientLike,
  filePath: string,
  modelId: "prebuilt-invoice" | "prebuilt-receipt" | "prebuilt-layout",
  bucket = "documents"
): Promise<unknown> {
  const endpoint = Deno.env.get("AZURE_DOCINT_ENDPOINT");
  const apiKey = Deno.env.get("AZURE_DOCINT_KEY");

  if (!endpoint || !apiKey) {
    console.warn("[azure-analyze] missing endpoint or key");
    return null;
  }

  const { data, error } = await supabaseClient.storage
    .from(bucket)
    .download(filePath);

  if (error || !data) {
    console.warn("[azure-analyze] download failed", {
      filePath,
      bucket,
      error: error?.message ?? "unknown",
    });
    return null;
  }

  const bytes = await data.arrayBuffer();
  const fileName = filePath.split("/").pop()?.toLowerCase() || "";
  const contentType = fileName.endsWith(".pdf")
    ? "application/pdf"
    : fileName.endsWith(".png")
      ? "image/png"
      : fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")
        ? "image/jpeg"
        : "application/octet-stream";

  const baseEndpoint = endpoint.replace(/\/+$/, "");
  const analyzeUrl =
    `${baseEndpoint}/documentintelligence/documentModels/${modelId}:analyze?api-version=2024-11-30`;

  const analyzeResponse = await fetch(analyzeUrl, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": apiKey,
      "Content-Type": contentType,
    },
    body: bytes,
  });

  if (!analyzeResponse.ok) {
    console.warn("[azure-analyze] analyze request failed", {
      status: analyzeResponse.status,
      statusText: analyzeResponse.statusText,
      modelId,
    });
    return null;
  }

  const operationLocation = analyzeResponse.headers.get("Operation-Location");
  if (!operationLocation) {
    console.warn("[azure-analyze] missing operation location", { modelId });
    return null;
  }

  for (let i = 0; i < 30; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const resultResponse = await fetch(operationLocation, {
      headers: { "Ocp-Apim-Subscription-Key": apiKey },
    });

    if (!resultResponse.ok) {
      console.warn("[azure-analyze] result poll failed", {
        status: resultResponse.status,
        statusText: resultResponse.statusText,
        attempt: i + 1,
        modelId,
      });
      continue;
    }

    const result = await resultResponse.json();
    if (result.status === "succeeded") {
      return result.analyzeResult;
    }
    if (result.status === "failed") {
      console.warn("[azure-analyze] analysis failed", {
        modelId,
        error: result.error ?? null,
      });
      return null;
    }
  }

  console.warn("[azure-analyze] analysis timed out", { modelId });
  return null;
}
