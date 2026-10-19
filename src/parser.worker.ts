import { parseDataset } from "./model";
self.onmessage = (event: MessageEvent<string>) => {
  try {
    self.postMessage({ ok: true, dataset: parseDataset(event.data) });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to read file.",
    });
  }
};
