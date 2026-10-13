// Browsers resolve relative URLs against the page; Node's Request throws on them.
// ky and MSW both build a Request from the input, so resolve it the browser way.
const NodeRequest = globalThis.Request;
globalThis.Request = class extends NodeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(
      typeof input === "string" ? new URL(input, location.href) : input,
      init,
    );
  }
};
