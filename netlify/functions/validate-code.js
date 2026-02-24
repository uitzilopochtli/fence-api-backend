// netlify/functions/validate-code.js
// Validates access codes against a static weekly code list.
// No external API calls — validation is purely local.
//
// To update the weekly code: change CURRENT_WEEK_CODE below and redeploy.

// ----- Code list -----------------------------------------------------------

// Update this each week (e.g. WEEK1, WEEK2, … WEEK52)
const CURRENT_WEEK_CODE = "WEEK8";

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

  if (normalized === CURRENT_WEEK_CODE || MASTER_CODES.has(normalized)) {
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
