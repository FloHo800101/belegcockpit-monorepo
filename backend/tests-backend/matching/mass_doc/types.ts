import type {
  Doc,
  Tx,
  DocLifecycleResult,
  MatchingConfig,
  PipelineDebug,
  PipelineResult,
} from "../../../src/matching-engine";
import type { FakeRepoResults } from "../mass_tx2doc/types";

export type DatasetMeta = {
  name?: string;
  tenant_id?: string;
  nowISO?: string;
};

export type DocLifecycleCase = {
  id: string;
  description?: string;
  doc_id: string;
  expected_kind: DocLifecycleResult["kind"];
  expected_severity: DocLifecycleResult["severity"];
  expected_next_action: DocLifecycleResult["nextAction"];
  expected_explanation_codes?: string[];
  expected_rematch_anchor?: string;
};

export type DocLifecycleDataset = {
  meta?: DatasetMeta;
  docs: Doc[];
  txs?: Tx[];
  configOverride?: Partial<MatchingConfig>;
  cases?: DocLifecycleCase[];
};

export type OfflineRunArtifacts = {
  runId: string;
  createdAtISO: string;
  datasetPath: string;
  dataset: DocLifecycleDataset;
  pipeline: PipelineResult & { debug?: PipelineDebug };
  repo: FakeRepoResults;
};

export type OfflineReportInput = {
  tenantId: string;
  runId: string;
  createdAtISO: string;
  docLifecycle: DocLifecycleResult[];
  debug?: PipelineDebug;
  params?: Record<string, unknown>;
  cases?: DocLifecycleCase[];
};

export type OfflineSummary = {
  meta?: DatasetMeta;
  totals: {
    docs: number;
  };
  kindCounts: Record<DocLifecycleResult["kind"], number>;
  severityCounts: Record<DocLifecycleResult["severity"], number>;
};
