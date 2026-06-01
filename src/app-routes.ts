export const exampleRoutes = [
  { path: "/", purpose: "Anonymous attendee question queue or word cloud" },
  { path: "/present", purpose: "Read-only attendee queue or word cloud for presenting" },
  { path: "/mc", purpose: "Passcode-protected MC question picker" },
  { path: "/moderate", purpose: "Passcode-protected moderation queue" },
  { path: "/screen", purpose: "Audience display for the active question" },
  { path: "/words/screen", purpose: "Audience display for the approved word cloud" },
  { path: "/api/health", purpose: "JSON health endpoint for tooling and smoke tests" },
];
