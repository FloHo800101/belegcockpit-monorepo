import type {
  MatchingConfig,
  PipelineDebug,
  PipelineResult,
  Tx,
  TxLifecycleResult,
} from "../../../src/matching-engine";
import type { FakeRepoResults } from "../mass_tx2doc/types";

export type DatasetMeta = {
  name?: string;
  tenant_id?: string;
  nowISO?: string;
};

export type TxLifecycleCase = {
  id: string;
  description?: string;
  tx_id: string;
  expected_kind: TxLifecycleResult["kind"];
  expected_severity: TxLifecycleResult["severity"];
  expected_next_action: TxLifecycleResult["nextAction"];
  expected_explanation_codes?: string[];
  expected_rematch_anchor?: string;
};

export type TxLifecycleDataset = {
  meta?: DatasetMeta;
  docs?: [];
  txs: Tx[];
  configOverride?: Partial<MatchingConfig>;
  cases?: TxLifecycleCase[];
};

export type OfflineRunArtifacts = {
  runId: string;
  createdAtISO: string;
  datasetPath: string;
  dataset: TxLifecycleDataset;
  pipeline: PipelineResult & { debug?: PipelineDebug };
  repo: FakeRepoResults;
};

export type OfflineReportInput = {
  tenantId: string;
  runId: string;
  createdAtISO: string;
  txLifecycle: TxLifecycleResult[];
  debug?: PipelineDebug;
  params?: Record<string, unknown>;
  cases?: TxLifecycleCase[];
};

export type OfflineSummary = {
  meta?: DatasetMeta;
  totals: {
    txs: number;
  };
  kindCounts: Record<TxLifecycleResult["kind"], number>;
  severityCounts: Record<TxLifecycleResult["severity"], number>;
};
