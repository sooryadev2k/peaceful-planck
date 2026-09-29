/**
 * Campus Clubs Portal — Google Apps Script Web App
 * ===================================================
 * Receives club data from the website and writes it to this Google Sheet.
 *
 * SETUP INSTRUCTIONS (one-time):
 *  1. Open https://script.google.com
 *  2. Click "New project"
 *  3. Delete the default code and paste ALL of this file's content
 *  4. Replace SHEET_ID below with your Google Sheet's ID
 *     (the long string in the Sheet URL between /d/ and /edit)
 *  5. Click Deploy → New deployment → Web app
 *     - Execute as: Me
 *     - Who has access: Anyone
 *  6. Click Deploy → copy the Web App URL
 *  7. Paste that URL into app.js as the value of SHEETS_WEBHOOK_URL
 *
 * SHEET COLUMNS (auto-created on first run):
 *  A: Club ID | B: Club Name | C: Club Head | D: Mission | E: About Club
 *  F: Joining Procedure | G: Contact | H: Logo URL | I: Achievements
 *  J: Last Synced | K: Status
 */

// ── CONFIG ── Replace with your Google Sheet's ID ──────────────────────────
var SHEET_ID   = 'YOUR_GOOGLE_SHEET_ID_HERE';
var SHEET_NAME = 'Clubs';
// ───────────────────────────────────────────────────────────────────────────

// Column order
var COLUMNS = [
  'Club ID',
  'Club Name',
  'Club Head',
  'Mission',
  'About Club',
  'Joining Procedure',
  'Contact',
  'Logo URL',
  'Achievements',
  'Last Synced',
  'Status'
];

/**
 * Handle POST requests from the website.
 * The body is a JSON string with { action, club } shape.
 */
function doPost(e) {
  try {
    var body   = e.postData.contents;
    var data   = JSON.parse(body);
    var action = data.action;
    var club   = data.club || {};

    var ss    = SpreadsheetApp.openById(SHEET_ID);
    var sheet = getOrCreateSheet(ss);

    if (action === 'add') {
      handleAdd(sheet, club);
    } else if (action === 'update') {
      handleUpdate(sheet, club);
    } else if (action === 'delete') {
      handleDelete(sheet, club.id);
    }

    return jsonResponse({ status: 'ok', action: action });

  } catch (err) {
    Logger.log('doPost error: ' + err.toString());
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

/**
 * Also handle GET requests (useful for testing in browser).
 */
function doGet(e) {
  return jsonResponse({ status: 'ok', message: 'Campus Clubs Portal — Sheets API is running.' });
}

// ── Handlers ────────────────────────────────────────────────────────────────

function handleAdd(sheet, club) {
  // Check if a row with this ID already exists (avoid duplicates on retry)
  var existingRow = findRowById(sheet, club.id);
  if (existingRow > 0) {
    handleUpdate(sheet, club);   // treat as update instead
    return;
  }
  sheet.appendRow(clubToRow(club, 'Active'));
  formatLastRow(sheet);
}

function handleUpdate(sheet, club) {
  var row = findRowById(sheet, club.id);
  if (row > 0) {
    var range = sheet.getRange(row, 1, 1, COLUMNS.length);
    range.setValues([clubToRow(club, 'Active')]);
    formatRow(sheet, row);
  } else {
    // Club not in sheet yet — add it
    handleAdd(sheet, club);
  }
}

function handleDelete(sheet, clubId) {
  var row = findRowById(sheet, clubId);
  if (row > 0) {
    // Mark as deleted (keep the row for audit trail)
    sheet.getRange(row, COLUMNS.length).setValue('Deleted');
    sheet.getRange(row, 1, 1, COLUMNS.length)
         .setBackground('#f4c7c3');   // light red background
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a club object into a row array matching COLUMNS order.
 */
function clubToRow(club, status) {
  return [
    club.id               || '',
    club.name             || '',
    club.clubHead         || '',
    club.mission          || '',
    club.aboutClub        || '',
    club.joiningProcedure || '',
    club.contact          || '',
    club.logoUrl          || '',
    club.achievementCount || 0,
    club.syncedAt         || new Date().toISOString(),
    status                || 'Active'
  ];
}

/**
 * Find the row number (1-indexed) of a club by its ID. Returns -1 if not found.
 */
function findRowById(sheet, clubId) {
  if (!clubId) return -1;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {   // skip header row (i=0)
    if (String(data[i][0]) === String(clubId)) {
      return i + 1;   // convert to 1-indexed row number
    }
  }
  return -1;
}

/**
 * Get existing sheet or create it with header row + formatting.
 */
function getOrCreateSheet(ss) {
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    setupHeaderRow(sheet);
  }
  // If the sheet exists but has no data, add the header
  if (sheet.getLastRow() === 0) {
    setupHeaderRow(sheet);
  }
  return sheet;
}

function setupHeaderRow(sheet) {
  sheet.appendRow(COLUMNS);

  // Style the header row
  var header = sheet.getRange(1, 1, 1, COLUMNS.length);
  header.setBackground('#8B1A1A');           // Maroon (matching the website)
  header.setFontColor('#ffffff');
  header.setFontWeight('bold');
  header.setFontSize(11);
  header.setHorizontalAlignment('center');

  // Freeze header row
  sheet.setFrozenRows(1);

  // Set column widths
  sheet.setColumnWidth(1, 200);   // ID
  sheet.setColumnWidth(2, 200);   // Name
  sheet.setColumnWidth(3, 180);   // Club Head
  sheet.setColumnWidth(4, 300);   // Mission
  sheet.setColumnWidth(5, 300);   // About Club
  sheet.setColumnWidth(6, 250);   // Joining Procedure
  sheet.setColumnWidth(7, 220);   // Contact
  sheet.setColumnWidth(8, 300);   // Logo URL
  sheet.setColumnWidth(9, 100);   // Achievements
  sheet.setColumnWidth(10, 180);  // Last Synced
  sheet.setColumnWidth(11, 90);   // Status
}

function formatLastRow(sheet) {
  var lastRow = sheet.getLastRow();
  formatRow(sheet, lastRow);
}

function formatRow(sheet, row) {
  var range = sheet.getRange(row, 1, 1, COLUMNS.length);
  range.setBackground(row % 2 === 0 ? '#fdf8f3' : '#ffffff');
  range.setFontColor('#1a1a2e');
  range.setVerticalAlignment('middle');
  sheet.setRowHeight(row, 40);

  // Highlight Status cell
  var statusCell = sheet.getRange(row, COLUMNS.length);
  var status     = statusCell.getValue();
  if (status === 'Active') {
    statusCell.setBackground('#d4edda').setFontColor('#155724');
  } else if (status === 'Deleted') {
    statusCell.setBackground('#f4c7c3').setFontColor('#721c24');
  }
}

/**
 * Return a JSON ContentService response.
 */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
