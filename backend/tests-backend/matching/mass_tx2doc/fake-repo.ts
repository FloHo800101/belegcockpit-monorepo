import type {
  MatchDecision,
  MatchRepository,
  Tx,
  TxHistoryOptions,
} from "../../../src/matching-engine";
import type { FakeRepoResults } from "./types";

export class FakeRepo implements MatchRepository {
  private finalDecisions: MatchDecision[] = [];
  private suggestions: MatchDecision[] = [];
  private audited: MatchDecision[] = [];

  async applyMatches(decisions: MatchDecision[]): Promise<void> {
    this.finalDecisions.push(...decisions);
  }

  async saveSuggestions(decisions: MatchDecision[]): Promise<void> {
    this.suggestions.push(...decisions);
  }

  async audit(decisions: MatchDecision[]): Promise<void> {
    this.audited.push(...decisions);
  }

  async loadTxHistory(_tenantId: string, _opts: TxHistoryOptions): Promise<Tx[]> {
    return [];
  }

  getResults(): FakeRepoResults {
    return {
      finalDecisions: [...this.finalDecisions],
      suggestions: [...this.suggestions],
      audited: [...this.audited],
    };
  }

  reset(): void {
    this.finalDecisions = [];
    this.suggestions = [];
    this.audited = [];
  }
}
