import { onRequest, onRequestPost } from "../functions/api/accounting/extract.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/accounting/extract") {
      if (request.method === "POST") {
        return onRequestPost({ request, env, ctx });
      }
      return onRequest({ request, env, ctx });
    }

    // Vite-built website assets are served by the Workers static-assets binding.
    return env.ASSETS.fetch(request);
  },
};
