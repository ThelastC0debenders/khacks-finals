
// Native fetch is available in Node > 18

async function verifyPhase3() {
    console.log("Verifying Phase 3: Dynamic Causal Analysis...");

    // 1. Test Whitelist Honeypot (expecting High Severity + specific story)
    const whitelistHoneypot = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
    console.log(`\n[1] Testing Whitelist Honeypot: ${whitelistHoneypot}`);

    // Minimal transaction object
    const tx = {
        to: whitelistHoneypot,
        from: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // Random user
        data: "0x",
        value: "0x0"
    };

    try {
        const response = await fetch('http://127.0.0.1:3000/rpc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "sentinel_analyze",
                params: [tx, 31337]
            }),
        });

        const data = await response.json();

        if (data.error) {
            console.error("RPC Error:", data.error);
            return;
        }

        const report = data.result.securityReport;

        if (report.mechanismStory) {
            console.log("✅ Mechanism Story Found!");
            console.log("---------------------------------------------------");
            console.log(`Title:    ${report.mechanismStory.title}`);
            console.log(`Severity: ${report.mechanismStory.severity}`);
            console.log(`Story:    ${report.mechanismStory.story}`);
            console.log("---------------------------------------------------");

            // Validation
            if (report.mechanismStory.severity === 'High') console.log("✅ Severity Check Passed");
            else console.log("❌ Severity Check Failed");

            if (report.mechanismStory.title.includes("Owner Privileges") || report.mechanismStory.story.includes("Owner"))
                console.log("✅ Content Check Passed (Mentions Owner)");
            else console.log("❌ Content Check Failed (Missing Owner context)");

        } else {
            console.log("❌ No Mechanism Story returned.");
        }

    } catch (e) {
        console.error("Verification failed:", e);
    }
}

verifyPhase3();
