// netlify/functions/validate-code.js
// Validates access codes against an auto-rotating weekly code.
// No external API calls — validation is purely local.
//
// The weekly code is WEEK{N} where N is the current ISO week number (1–53).
// It rotates automatically every Monday — no manual updates needed.

// ----- Code list -----------------------------------------------------------

// Returns the ISO week number for today (1–53).
// Weeks start on Monday. Resets at the start of each year.
function getCurrentWeekNumber() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); // Thursday of current week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// Master codes — always valid
const MASTER_CODES = new Set(["ADMIN2024", "DESPLAINES", "MASTER"]);

// ----- CORS headers --------------------------------------------------------
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

// ----- Validation ----------------------------------------------------------

function validateAccessCode(code) {
  if (!code || typeof code !== "string") {
    return { valid: false, error: "Code is required." };
  }

  const normalized = code.trim().toUpperCase();

  const weekCode = `WEEK${getCurrentWeekNumber()}`;
  if (normalized === weekCode || MASTER_CODES.has(normalized)) {
    return { valid: true };
  }

  return { valid: false, error: "Invalid access code." };
}

// ----- Netlify handler -----------------------------------------------------

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ valid: false, error: "Method not allowed." }),
    };
  }

  let code;
  try {
    const body = JSON.parse(event.body || "{}");
    code = (body.code || body.contactId || "").trim();
  } catch {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ valid: false, error: "Invalid JSON body." }),
    };
  }

  if (!code) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ valid: false, error: "code is required." }),
    };
  }

  const result = validateAccessCode(code);
  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify(result),
  };
};
