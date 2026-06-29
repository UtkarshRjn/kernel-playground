import type { ExecutionProvider, RunRequest, RunResult } from "@kp/shared";

/**
 * Production ExecutionProvider that calls the Modal HTTP endpoint (services/execution).
 *
 * The orchestrator is agnostic to which provider it holds, so swapping this in for the
 * MockProvider is all it takes to run on real GPUs. The request is sent as-is (the wire
 * format matches packages/shared) and the JSON response is a RunResult.
 */
export class HttpModalProvider implements ExecutionProvider {
  readonly name = "modal-http";

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  async run(request: RunRequest): Promise<RunResult> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/bench`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`execution endpoint ${res.status}: ${detail}`);
    }
    return (await res.json()) as RunResult;
  }

  async cancel(): Promise<void> {
    // TODO(infra): correlate target -> Modal call id and cancel via the function handle.
    return;
  }
}
