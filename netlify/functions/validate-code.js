// netlify/functions/validate-code.js
// Validates a 4-char access code (last 4 chars of a GHL contact ID)
// by searching today's appointments for the location.
//
// Flow:
//   1. Receive 4-char code (e.g. "3bIr")
//   2. Fetch today's appointments from GHL Appointments API (filtered by locationId)
//   3. Find appointment(s) whose contactId ends with the code
//   4. Exactly 1 match → check time window; 0 or 2+ → error
//   5. Access window: 2 hours BEFORE → 4 hours AFTER appointment start time.

const GHL_API_BASE = "https://rest.gohighlevel.com";

// ----- CORS headers -------------------------------------------------------
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

// ----- Time window config --------------------------------------------------
const WINDOW_BEFORE_MS = 2 * 60 * 60 * 1000;  // 2 hours
const WINDOW_AFTER_MS  = 4 * 60 * 60 * 1000;  // 4 hours

// ----- Helpers -------------------------------------------------------------

function authHeaders() {
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) throw new Error("GHL_API_KEY environment variable is not set.");
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

/**
 * Parse APPOINTMENT_TZ offset string (e.g. "-05:00") into milliseconds.
 * Returns 0 for UTC if missing or invalid.
 */
function parseTzOffsetMs(tzStr) {
  const match = (tzStr || "+00:00").match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) return 0;
  const sign = match[1] === "+" ? 1 : -1;
  return sign * (parseInt(match[2]) * 60 + parseInt(match[3])) * 60 * 1000;
}

/**
 * Fetch today's appointments from the GHL Appointments API.
 * "Today" is determined relative to the APPOINTMENT_TZ environment variable.
 * Returns array of appointment objects.
 */
async function fetchTodaysAppointments() {
  const locationId = process.env.GHL_LOCATION_ID;
  if (!locationId) throw new Error("GHL_LOCATION_ID environment variable is not set.");

  const tzOffsetMs = parseTzOffsetMs(process.env.APPOINTMENT_TZ);

  // Compute today's midnight (00:00:00) in local timezone, expressed as UTC epoch ms.
  // e.g. for UTC-5: local midnight = UTC 05:00
  const nowUtcMs = Date.now();
  const localNow = new Date(nowUtcMs + tzOffsetMs);
  localNow.setUTCHours(0, 0, 0, 0);                       // snap to local midnight
  const startMs = localNow.getTime() - tzOffsetMs;         // convert back to UTC
  const endMs   = startMs + 24 * 60 * 60 * 1000 - 1;      // 23:59:59.999 local

  const url = new URL(`${GHL_API_BASE}/v1/appointments/`);
  url.searchParams.set("locationId", locationId);
  url.searchParams.set("startDate",  startMs.toString());
  url.searchParams.set("endDate",    endMs.toString());

  const response = await fetch(url.toString(), { headers: authHeaders() });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GHL appointments API returned ${response.status}: ${body}`);
  }

  const data = await response.json();
  return data.appointments ?? [];
}

/**
 * Returns true when nowMs is within the access window around the appointment.
 */
function isWithinWindow(appointmentStartMs, nowMs) {
  return (
    nowMs >= appointmentStartMs - WINDOW_BEFORE_MS &&
    nowMs <= appointmentStartMs + WINDOW_AFTER_MS
  );
}

/**
 * Format an epoch-ms timestamp as a human-readable time in the local timezone.
 */
function formatLocalTime(epochMs, tzOffsetMs) {
  const localDate = new Date(epochMs + tzOffsetMs);
  const h = localDate.getUTCHours();
  const m = localDate.getUTCMinutes().toString().padStart(2, "0");
  const period = h >= 12 ? "PM" : "AM";
  const display = h % 12 || 12;
  return `${display}:${m} ${period}`;
}

// ----- Validation logic ----------------------------------------------------

async function validateCode(code) {
  // Format guard: exactly 4 alphanumeric characters (case-sensitive)
  if (!/^[A-Za-z0-9]{4}$/.test(code)) {
    return { valid: false, error: "Invalid code format. Expected 4 alphanumeric characters." };
  }

  const appointments = await fetchTodaysAppointments();

  // Find appointments whose contactId ends with the supplied 4-char code
  const matches = appointments.filter(
    (appt) => typeof appt.contactId === "string" && appt.contactId.endsWith(code)
  );

  if (matches.length === 0) {
    return { valid: false, error: "No appointment found for today with this code." };
  }

  if (matches.length > 1) {
    return {
      valid: false,
      error: "Ambiguous code — multiple appointments match. Please contact us.",
    };
  }

  const appt = matches[0];

  // startTime may be epoch ms (number) or an ISO string
  const startMs =
    typeof appt.startTime === "number"
      ? appt.startTime
      : new Date(appt.startTime).getTime();

  if (isNaN(startMs)) {
    return { valid: false, error: "Could not read appointment start time." };
  }

  const nowMs = Date.now();

  if (isWithinWindow(startMs, nowMs)) {
    return { valid: true };
  }

  const tzOffsetMs = parseTzOffsetMs(process.env.APPOINTMENT_TZ);
  const apptTimeStr = formatLocalTime(startMs, tzOffsetMs);

  return {
    valid: false,
    error:
      `Appointment is at ${apptTimeStr} but you are outside the access ` +
      "window (2 hours before → 4 hours after appointment time).",
  };
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
    code = (body.contactId || body.code || "").trim();
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
      body: JSON.stringify({ valid: false, error: "contactId is required." }),
    };
  }

  try {
    const result = await validateCode(code);
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error("validate-code error:", err.message);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        valid: false,
        error: "Internal server error. Please try again.",
      }),
    };
  }
};
