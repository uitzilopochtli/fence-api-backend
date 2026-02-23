// test-local.js
// Run with:  node --env-file=.env test-local.js [contactId]
//
// Examples:
//   node --env-file=.env test-local.js hsAZzqlAcxscd0xlWZ0e
//   node --env-file=.env test-local.js bad-id
//   node --env-file=.env test-local.js          ← missing ID (error case)

const { handler } = require("./netlify/functions/validate-code");

// Read contactId from command-line arg, or leave blank to test the error case.
const contactId = process.argv[2] ?? "";

const mockEvent = {
  httpMethod: "POST",
  body: JSON.stringify({ contactId }),
  headers: { "content-type": "application/json" },
};

console.log("─".repeat(50));
console.log(`Testing contactId: "${contactId}"`);
console.log(`Current time:      ${new Date().toISOString()}`);
console.log("─".repeat(50));

(async () => {
  try {
    const response = await handler(mockEvent);
    const body     = JSON.parse(response.body);

    console.log(`HTTP Status: ${response.statusCode}`);
    console.log(`Response:   `, JSON.stringify(body, null, 2));

    if (body.valid) {
      console.log("\n✓ ACCESS GRANTED — appointment is active.");
    } else {
      console.log(`\n✗ ACCESS DENIED — ${body.error}`);
    }
  } catch (err) {
    console.error("Unexpected error:", err.message);
    process.exit(1);
  }
})();
