// netlify/functions/validate-code.js
// Validates a GHL contact ID by reading the appointment date/time stored
// directly on the contact record (written by Zapier from Google Calendar):
//   contact.city  → appointment date  e.g. "Feb 21, 2026"
//   contact.state → appointment time  e.g. "11:00AM"
//
// Access window: 2 hours BEFORE → 4 hours AFTER appointment start time.

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
 * Fetch a GHL contact by ID.
 * Returns the contact object, or null if not found.
 */
async function fetchContact(contactId) {
  const url = `${GHL_API_BASE}/v1/contacts/${contactId}`;
  const response = await fetch(url, { headers: authHeaders() });

  if (response.status === 404) return null;

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GHL contacts API returned ${response.status}: ${body}`);
  }

  const data = await response.json();
  return data.contact ?? null;
}

/**
 * Parse the appointment Date from the contact's city + state fields.
 *
 *   contact.city  → "Feb 21, 2026"   (date written by Zapier)
 *   contact.state → "11:00AM"        (time written by Zapier)
 *
 * Timezone: set APPOINTMENT_TZ in your environment to a UTC offset string
 * such as "-05:00" (US Eastern) or "-06:00" (US Central) so Netlify (UTC)
 * interprets the time correctly. Defaults to UTC if not set.
 *
 * Returns a Date, or null if the fields are missing or unparseable.
 */
function parseAppointmentDate(contact) {
  const dateStr = (contact.city  || "").trim();  // "Feb 21, 2026"
  const timeStr = (contact.state || "").trim();  // "11:00AM"

  if (!dateStr || !timeStr) return null;

  // Normalise "11:00AM" → "11:00 AM" for reliable Date() parsing
  const timeNorm = timeStr.replace(/([AaPp][Mm])$/, " $1");

  const tzOffset = (process.env.APPOINTMENT_TZ || "+00:00").trim();
  const combined = `${dateStr} ${timeNorm} GMT${tzOffset}`;

  const parsed = new Date(combined);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Returns true when the appointment date is today (UTC date comparison).
 */
function isToday(appointmentDate) {
  const now = new Date();
  return (
    appointmentDate.getUTCFullYear() === now.getUTCFullYear() &&
    appointmentDate.getUTCMonth()    === now.getUTCMonth()    &&
    appointmentDate.getUTCDate()     === now.getUTCDate()
  );
}

/**
 * Returns true when now is within the access window around the appointment.
 */
function isWithinWindow(appointmentDate, nowMs) {
  const apptMs = appointmentDate.getTime();
  return nowMs >= apptMs - WINDOW_BEFORE_MS && nowMs <= apptMs + WINDOW_AFTER_MS;
}

// ----- Validation logic ----------------------------------------------------

async function validateContactId(contactId) {
  // Basic format guard: GHL contact IDs are alphanumeric, 10–30 chars
  if (!/^[A-Za-z0-9]{10,30}$/.test(contactId)) {
    return { valid: false, error: "Invalid contact ID format." };
  }

  const contact = await fetchContact(contactId);

  if (!contact) {
    return { valid: false, error: "Contact not found." };
  }

  const appointmentDate = parseAppointmentDate(contact);

  if (!appointmentDate) {
    return {
      valid: false,
      error: "No appointment date found on this contact.",
    };
  }

  if (!isToday(appointmentDate)) {
    return {
      valid: false,
      error: `Appointment is on ${contact.city}, not today.`,
    };
  }

  if (isWithinWindow(appointmentDate, Date.now())) {
    return { valid: true };
  }

  return {
    valid: false,
    error:
      `Appointment is at ${contact.state} but you are outside the access ` +
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

  let contactId;
  try {
    const body = JSON.parse(event.body || "{}");
    contactId  = (body.contactId || "").trim();
  } catch {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ valid: false, error: "Invalid JSON body." }),
    };
  }

  if (!contactId) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ valid: false, error: "contactId is required." }),
    };
  }

  try {
    const result = await validateContactId(contactId);
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
