// Public front-end config for the Upload form. These values are NOT secret.
// Fill them in after deploying the Worker (see worker/README.md).
window.NIDUS_CONFIG = {
  // The URL that `wrangler deploy` printed, e.g. "https://nidus-tools-submit.<you>.workers.dev"
  WORKER_URL: "",
  // The Cloudflare Turnstile *site* key (public). Leave "" to use Cloudflare's always-pass test key.
  TURNSTILE_SITE_KEY: "",
};
