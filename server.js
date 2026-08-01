const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Disable Node.js default timeout (2 minutes)
const server = app.listen(PORT, () => {
    console.log(`🚀 ZATECH Proxy running on port ${PORT}`);
    console.log(`📍 Health: http://localhost:${PORT}/health`);
    console.log(`⚡ Cache TTL: ${CACHE_TTL/1000} seconds`);
});
server.timeout = 0; // No timeout

// ... (your existing COOKIE_STRING, cache, parseSMSData, fetchNumberData)

// === STREAMING BULK ENDPOINT – real-time updates ===
app.post('/api/sms/bulk-stream', async (req, res) => {
    try {
        let { numbers, startDate, endDate } = req.body;
        if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
            return res.status(400).json({ error: 'Provide an array of numbers' });
        }

        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        console.log(`[STREAM] Processing ${numbers.length} numbers`);

        const concurrency = 50;
        const batches = [];
        for (let i = 0; i < numbers.length; i += concurrency) {
            batches.push(numbers.slice(i, i + concurrency));
        }

        let totalCount = 0;
        const senderMap = {};
        const senderDestinations = {}; // sender -> { destination: count }

        let processed = 0;

        for (const batch of batches) {
            const batchPromises = batch.map(num => fetchNumberData(num, startDate, endDate));
            const batchResults = await Promise.all(batchPromises);

            for (const r of batchResults) {
                if (!r.error && r.data.length > 0) {
                    totalCount += r.data.length;
                    for (const rec of r.data) {
                        const sender = rec.from || 'unknown';
                        const dest = rec.to || 'unknown';
                        senderMap[sender] = (senderMap[sender] || 0) + 1;
                        if (!senderDestinations[sender]) senderDestinations[sender] = {};
                        senderDestinations[sender][dest] = (senderDestinations[sender][dest] || 0) + 1;
                    }
                }
            }

            processed += batch.length;
            const progress = Math.min(100, Math.round((processed / numbers.length) * 100));

            const breakdown = Object.entries(senderMap)
                .sort((a, b) => b[1] - a[1])
                .map(([sender, count]) => ({ sender, count }));

            // Send incremental update (without destinations to keep payload light)
            const payload = JSON.stringify({ totalCount, breakdown, progress, done: false });
            res.write(payload + '\n');
            if (res.flush) res.flush();
        }

        // Final payload includes the full destination map
        const finalBreakdown = Object.entries(senderMap)
            .sort((a, b) => b[1] - a[1])
            .map(([sender, count]) => ({ sender, count }));

        const finalPayload = JSON.stringify({
            totalCount,
            breakdown: finalBreakdown,
            progress: 100,
            done: true,
            senderDestinations // This is the full map
        });
        res.write(finalPayload + '\n');
        res.end();

        console.log(`[STREAM DONE] ${numbers.length} numbers, ${totalCount} records`);
    } catch (error) {
        console.error('[STREAM ERROR]', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        } else {
            res.write(JSON.stringify({ error: error.message, done: true }) + '\n');
            res.end();
        }
    }
});

// ... (rest of endpoints unchanged)
