export function htmlResponse(body: string, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "text/html; charset=utf-8");
  responseHeaders.set("cache-control", "no-store");

  return new Response(body, {
    status,
    headers: responseHeaders,
  });
}

export function cssResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/css; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function redirectResponse(location: string, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("location", location);
  responseHeaders.set("cache-control", "no-store");

  return new Response(null, {
    status: 303,
    headers: responseHeaders,
  });
}

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
