# Google Drive Upload — Setup Guide

## Step 1: Create Google Apps Script

1. Go to https://script.google.com
2. Click **New Project**
3. Delete everything in `Code.gs` and paste this code:

```javascript
var FOLDER_ID = '1DRYZ2JFU5UIT71N_0B2z6eZxPJrGAg7X';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var folder = DriveApp.getFolderById(FOLDER_ID);
    var decoded = Utilities.base64Decode(data.data);
    var blob = Utilities.newBlob(decoded, data.mime, data.name);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var id = file.getId();
    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      id: id,
      url: 'https://lh3.googleusercontent.com/d/' + id
    })).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({
      ok: false,
      error: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({status:'ok'}))
    .setMimeType(ContentService.MimeType.JSON);
}
```

4. Click **Save** (name it e.g. "NCCC Upload Proxy")

## Step 2: Deploy as Web App

1. Click **Deploy** → **New deployment**
2. Click the gear icon ⚙️ → **Web app**
3. Set:
   - **Description**: NCCC file upload
   - **Execute as**: **Me** (your Google account)
   - **Who has access**: **Anyone**
4. Click **Deploy**
5. Click **Authorize access** → choose your Google account → Allow
6. **Copy the Web app URL** — it looks like:
   `https://script.google.com/macros/s/AKfycbx.../exec`

## Step 3: Paste URL into website

Open `index.html` and find this line near the top of the script:
```
var GD_SCRIPT = "PASTE_YOUR_SCRIPT_URL_HERE";
```
Replace the placeholder with your actual Web app URL.

## Done!

Now when you upload images or .docx files in the admin panel, 
they will be automatically stored in your Google Drive folder
and served from Google's CDN.

## Notes
- Images are compressed client-side before upload (max 800px, JPEG 60%)
- Each uploaded file appears in your Google Drive folder
- Files are set to "Anyone with the link can view" automatically
- Google Apps Script has a 50MB per-request limit (more than enough for images)
- If you need to update the script, go to script.google.com → Deploy → New deployment
