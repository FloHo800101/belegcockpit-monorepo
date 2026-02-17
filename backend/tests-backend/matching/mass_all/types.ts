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
import type { DocLifecycleCase } from "../mass_doc/types";
import type { TxLifecycleCase } from "../mass_tx/types";

export type DatasetMeta = {
  name?: string;
  tenant_id?: string;
  nowISO?: string;
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

export type MatchingDataset = {
  meta?: DatasetMeta;
  docs: Doc[];
  txs: Tx[];
  configOverride?: Partial<MatchingConfig>;
  cases?: {
    matching?: DatasetCase[];
    doc?: DocLifecycleCase[];
    tx?: TxLifecycleCase[];
  };
};

export type OfflineRunArtifacts = {
  runId: string;
  createdAtISO: string;
  datasetPath: string;
  dataset: MatchingDataset;
  pipeline: PipelineResult & { debug?: PipelineDebug };
  decisions: MatchDecision[];
};

export type OfflineSummary = {
  meta?: DatasetMeta;
  totals: {
    docs: number;
    txs: number;
  };
  stateCounts: Record<MatchState, number>;
  relationCounts: Record<MatchRelationType, number>;
};

export type OfflineReportInput = {
  tenantId: string;
  runId: string;
  createdAtISO: string;
  decisions: MatchDecision[];
  docLifecycle: NonNullable<PipelineResult["docLifecycle"]>;
  txLifecycle: NonNullable<PipelineResult["txLifecycle"]>;
  debug?: PipelineDebug;
  params?: Record<string, unknown>;
  cases?: MatchingDataset["cases"];
};
