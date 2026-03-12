# NCCC Uzbekistan Portal

Static public portal for the National Climate Change Center of Uzbekistan.

## Stack

- `index.html` as the deployment entry point
- `assets/css/styles.css` for the design system and responsive layout
- `assets/js/app.js` for multilingual rendering, filters, search, theme and live widgets
- `assets/data/site-content.json` for portal content
- `assets/data/ui.json` for interface translations and NDC labels

## Features

- Uzbek, Russian and English interface switching without reload
- Light and dark theme
- Public sections for about, activities, documents, news, analytics, media and contacts
- Live integrations for Tashkent air quality, weather and World Bank indicators
- Client-side search across key portal content
- Static deployment files: `404.html`, `robots.txt`, `sitemap.xml`, `site.webmanifest`, `sw.js`

## Notes

- This repository now represents the public-facing portal foundation.
- The previous browser-side demo admin flow is removed from the main site because it was not production-safe.
- CMS, authentication, protected uploads and contact-form backend should be delivered in a separate backend phase.
