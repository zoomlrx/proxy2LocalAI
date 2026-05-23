export type DiagnosticStageId =
  | "request_received"
  | "profile_matched"
  | "cors_preflight"
  | "provider_spawn"
  | "provider_first_output"
  | "provider_done"
  | "response_mapped"
  | "response_done"
  | "client_aborted"
  | "provider_no_output"
  | "provider_error"
  | "provider_timeout";

export type DiagnosticStageStatus = "ok" | "error" | "warning" | "skipped";

export interface DiagnosticStage {
  id: DiagnosticStageId;
  status: DiagnosticStageStatus;
  timestamp: string;
  message?: string;
  duration?: number;
}

export interface RequestDiagnosticSummary {
  id: string;
  method: string;
  targetUrl: string;
  profileId?: string;
  pageUrl?: string;
  startedAt: string;
  finishedAt?: string;
  finalStatus: "ok" | "error" | "pending";
  errorStage?: DiagnosticStageId;
  duration?: number;
}

export interface RequestDiagnosticDetail {
  summary: RequestDiagnosticSummary;
  stages: DiagnosticStage[];
}

export interface DiagnosticExport {
  summary: RequestDiagnosticSummary;
  stages: DiagnosticStage[];
  exportedAt: string;
  redacted: boolean;
}
