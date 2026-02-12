# NCCC Uzbekistan Website

Static website with:
- internet-based content for the National Climate Change Center
- latest climate and atmosphere-related decisions/news section
- admin-only publication module for Word/text + images + print

## Data location
- Main content file: `assets/data/site-content.json`
- Runtime source: `index.html` fetches this JSON and renders:
  - center overview
  - decisions timeline
  - news cards
  - source links

## Admin module
- Login: `uzncc`
- Password: `bunyodkor7a`
- Features:
  - upload `.docx` (or `.txt`) content
  - attach multiple images
  - save publication to browser localStorage
  - print publication (admin only)

Notes:
- `.doc` files are not directly parsed in browser; convert to `.docx`.
- This is a static demo. For production, move authentication and publication storage to backend.
