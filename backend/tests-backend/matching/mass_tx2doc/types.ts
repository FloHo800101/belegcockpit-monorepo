import type {
  Doc,
  MatchDecision,
  MatchRelationType,
  MatchState,
  MatchingConfig,
  PipelineDebug,
  PipelineResult,
  Tx,
} from "../../../src/matching-engine";

export type DatasetMeta = {
  name?: string;
  tenant_id?: string;
  nowISO?: string;
};

export type MatchingDataset = {
  meta?: DatasetMeta;
  docs: Doc[];
  txs: Tx[];
  configOverride?: Partial<MatchingConfig>;
  cases?: DatasetCase[];
};

export type FakeRepoResults = {
  finalDecisions: MatchDecision[];
  suggestions: MatchDecision[];
  audited: MatchDecision[];
};

export type OfflineRunArtifacts = {
  runId: string;
  createdAtISO: string;
  datasetPath: string;
  dataset: MatchingDataset;
  pipeline: PipelineResult & { debug?: PipelineDebug };
  repo: FakeRepoResults;
};

export type OfflineReportInput = {
  tenantId: string;
  runId: string;
  createdAtISO: string;
  decisions: MatchDecision[];
  debug?: PipelineDebug;
  params?: Record<string, unknown>;
  cases?: DatasetCase[];
  txs?: Tx[];
};

export type OfflineSummary = {
  meta?: DatasetMeta;
  totals: {
    docs: number;
    txs: number;
  };
  stateCounts: Record<MatchState, number>;
  relationCounts: Record<MatchRelationType, number>;
  topReasonCodes: Array<{ code: string; count: number }>;
};

export type DatasetCase = {
  id: string;
  description?: string;
  expected_state: string;
  expected_relation_type: MatchRelationType | "none";
  doc_ids: string[];
  tx_ids: string[];
  must_reason_codes?: string[];
};
