# View state lives in the URL; share previews render on the server

Every view's full state lives in its URL, so any view can be pasted into a discussion. Every URL's HTML carries its own title, description, Open Graph and Twitter tags and a 1200×630 PNG preview card, all rendered on the server (`next/og`). Text messages, Slack, Reddit and social sites unfurl links with crawlers that do not run JavaScript, so tags or images added on the client would be invisible to them. If a route's card fails to render, the page falls back to the default card.

Consequence: no view state may be held only in client memory or storage.
