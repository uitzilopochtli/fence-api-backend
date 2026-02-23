// debug-api.js
// Hits GHL directly and prints raw responses — used to diagnose API issues.
// Run with:  node --env-file=.env debug-api.js <contactId>

const contactId  = process.argv[2];
const API_KEY    = process.env.GHL_API_KEY;
const LOCATION_ID = process.env.GHL_LOCATION_ID;

if (!contactId) {
  console.error("Usage: node --env-file=.env debug-api.js <contactId>");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

const now   = new Date();
const start = new Date(now); start.setUTCHours(0, 0, 0, 0);
const end   = new Date(now); end.setUTCHours(23, 59, 59, 999);

async function probe(label, url) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`[${label}]`);
  console.log(`URL: ${url}`);
  try {
    const res  = await fetch(url, { headers });
    const text = await res.text();
    console.log(`Status: ${res.status}`);
    try {
      console.log("Body:", JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      console.log("Body (raw):", text);
    }
  } catch (err) {
    console.log("Network error:", err.message);
  }
}

(async () => {
  // 1. Confirm the contact exists
  await probe(
    "GET contact",
    `https://rest.gohighlevel.com/v1/contacts/${contactId}`
  );

  // 2. Appointments filtered by contactId + date (epoch ms)
  const apptUrl = new URL("https://rest.gohighlevel.com/v1/appointments/");
  apptUrl.searchParams.set("locationId", LOCATION_ID);
  apptUrl.searchParams.set("contactId",  contactId);
  apptUrl.searchParams.set("startDate",  start.getTime().toString());
  apptUrl.searchParams.set("endDate",    end.getTime().toString());
  await probe("GET appointments (contactId filter)", apptUrl.toString());

  // 3. All appointments for the location today (no contactId filter) — fallback
  const allUrl = new URL("https://rest.gohighlevel.com/v1/appointments/");
  allUrl.searchParams.set("locationId", LOCATION_ID);
  allUrl.searchParams.set("startDate",  start.getTime().toString());
  allUrl.searchParams.set("endDate",    end.getTime().toString());
  await probe("GET appointments (all today, no contactId)", allUrl.toString());
})();
