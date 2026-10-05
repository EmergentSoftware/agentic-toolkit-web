# agentic-toolkit-web (retired)

The Agentic Tool Kit web app has moved to <https://ashy-wave-0d3ec6210.3.azurestaticapps.net/>. Its source is `apps/web` in the Azure DevOps monorepo `Emergent.AgenticToolkit`.

This repo now deploys only a redirect to GitHub Pages. `site/redirect.js` maps the old app's hash links (`#/assets/…`, `#/bundles/…`, `#/contribute`) to the new app's URLs. `site/auth-redirect.html` sends the old sign-in bridge to the new app's home page. The repo will be archived and GitHub Pages turned off after the redirect period. The old app is in this repo's history before the redirect commit.
