import type {
  DiagnosticStage,
  DiagnosticStageId,
  DiagnosticStageStatus,
  RequestDiagnosticDetail,
  RequestDiagnosticSummary
} from "@proxy2localai/shared";

interface RequestOptions {
  id: string;
  method: string;
  targetUrl: string;
  profileId?: string;
  pageUrl?: string;
}

interface StoredRequest {
  summary: RequestDiagnosticSummary;
  stages: DiagnosticStage[];
}

export interface DiagnosticsStore {
  startRequest(options: RequestOptions): void;
  addStage(requestId: string, stage: { id: DiagnosticStageId; status: DiagnosticStageStatus; message?: string; duration?: number }): void;
  finishRequest(requestId: string, result: { status: "ok" | "error"; errorStage?: DiagnosticStageId }): void;
  listRecent(): RequestDiagnosticSummary[];
  getDetail(requestId: string): RequestDiagnosticDetail | null;
}

export function createDiagnosticsStore(options: { limit?: number } = {}): DiagnosticsStore {
  const limit = options.limit ?? 20;
  const requests = new Map<string, StoredRequest>();
  const order: string[] = [];

  function trimToLimit(): void {
    while (order.length > limit) {
      const oldestId = order.shift();
      if (oldestId) {
        requests.delete(oldestId);
      }
    }
  }

  return {
    startRequest(options) {
      const summary: RequestDiagnosticSummary = {
        id: options.id,
        method: options.method,
        targetUrl: options.targetUrl,
        profileId: options.profileId,
        pageUrl: options.pageUrl,
        startedAt: new Date().toISOString(),
        finalStatus: "pending"
      };
      const stored: StoredRequest = { summary, stages: [] };
      requests.set(options.id, stored);
      order.push(options.id);
      trimToLimit();
    },

    addStage(requestId, stageData) {
      const stored = requests.get(requestId);
      if (!stored) return;
      stored.stages.push({
        ...stageData,
        timestamp: new Date().toISOString()
      });
    },

    finishRequest(requestId, result) {
      const stored = requests.get(requestId);
      if (!stored) return;
      stored.summary.finishedAt = new Date().toISOString();
      stored.summary.finalStatus = result.status;
      stored.summary.errorStage = result.errorStage;
      const started = Date.parse(stored.summary.startedAt);
      if (!Number.isNaN(started)) {
        stored.summary.duration = Date.now() - started;
      }
    },

    listRecent() {
      return order.map((id) => requests.get(id)?.summary).filter(Boolean) as RequestDiagnosticSummary[];
    },

    getDetail(requestId) {
      const stored = requests.get(requestId);
      if (!stored) return null;
      return { summary: stored.summary, stages: stored.stages };
    }
  };
}
