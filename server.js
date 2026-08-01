const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Your session cookies (same as before)
const COOKIE_STRING = '__Host-authjs.csrf-token=3d7ffcfbe406686694d1e522c7dca618cd2552e5bc0617c8842024bee0bad7a0%7C7f5271753378909234f3f855a0b4ff2a8629e1c0d5ad1e2617d6a83b85abd7a0; __Secure-authjs.callback-url=https%3A%2F%2Fzatechsolutions.online%2F; __cf_bm=ledUAtSBEVs0Y2w5qRJDhZTuL3Rdrb863dhpNyzlOMY-1785528531.5288565-1.0.1.1-ngmaa.Zm3wncjszPOfEaaSvJmjqnpROoEKK4syJKxDG6k.rHXHLyjBOtQI4Ehb9HawajCIfYZltwOEJQma7aer9i7W7fy0yY2bcQ1LCJVVCo570uR3ORom90V1ktoJc7; __Secure-authjs.session-token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2Q0JDLUhTNTEyIiwia2lkIjoiTmswT2tCZVByUGY2V2pVeDhyQnhCaHM3SnBPencyYzhSM3l3WUpWWXk4RzcxWkRTRy12MnMtT0FwdkdicVo0c1pCRjhackdIT3B6aGwta1MtM3hweEEifQ..bSN7dZTLou7tLhSpnnGq5g.oPMMdv416CCzJgELYbIkFyaOr-Sk4or1unbWIpmqtAcVFkNY5w9-VJ4UI_hykbmVrhBwlB1ggeomL85fQwvLeBTM-qhJxgXlTh0DxZ2To34nCTotHAgc6_m2QTnytBF07BOKVEelliLVIucWB7ZSU4s4wVchGINJ1o7v_n3eGrw1O4hsKf-VVoA9QgR3JcedBqMVmtM9TUFHE1uHD1RIxxPOG-F0epB2gwjmB44in51kc1LAjH7fHZwpfUtupV0UPwsXVi2vFll8CnohoPb6W6IGC6WwdOp3kbtungi5ch7j_PoxmC-bEZ0rGcrxjg3S.ZKDkIUQSO2XZc1Ws7EWuOcclx8Fc_bp1wSKbCFhPEkA';

// In-memory cache (5 minute TTL)
const cache = new Map();
const CACHE_TTL = 300000;

// FAST PARSER - Direct regex extraction
function parseSMSData(html) {
    const smsData = [];
    const jsonMatches = html.match(/\{"_id":"[^"]+","from":"[^"]+","to":"[^"]+","message":"[^"]+","createdAt":"[^"]+"\}/g);
    if (jsonMatches) {
        for (const match of jsonMatches) {
            try {
                const parsed = JSON.parse(match);
                if (parsed._id) smsData.push(parsed);
            } catch (e) {}
        }
    }
    if (smsData.length === 0) {
        const dataMatch = html.match(/data:\[(.*?)\]/s);
        if (dataMatch) {
            try {
                const objects = dataMatch[1].match(/\{[^}]+\}/g);
                if (objects) {
                    for (const obj of objects) {
                        try {
                            const cleanObj = obj.replace(/\\/g, '');
                            const parsed = JSON.parse(cleanObj);
                            if (parsed._id) smsData.push(parsed);
                        } catch (e) {}
                    }
                }
            } catch (e) {}
        }
    }
    let totalResults = smsData.length;
    const totalResultsMatch = html.match(/totalResults:(\d+)/);
    if (totalResultsMatch) totalResults = parseInt(totalResultsMatch[1]);
    let totalPages = 1;
    const totalPagesMatch = html.match(/totalPages:(\d+)/);
    if (totalPagesMatch) totalPages = parseInt(totalPagesMatch[1]);
    return { data: smsData, totalResults, totalPages };
}

// Helper to fetch a single number's data (with caching)
async function fetchNumberData(num, startDate = '', endDate = '') {
    const cacheKey = `${num}_1_${startDate || ''}_${endDate || ''}`;
    if (cache.has(cacheKey) && Date.now() - cache.get(cacheKey).timestamp < CACHE_TTL) {
        return { data: cache.get(cacheKey).data.data.data, error: false };
    }
    try {
        let url = `https://zatechsolutions.online/dashboard?query=${encodeURIComponent(num)}&page=1`;
        if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
        if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;
        url += `&_rsc=${Date.now().toString(36)}`;

        const response = await axios.get(url, {
            headers: {
                'Host': 'zatechsolutions.online',
                'rsc': '1',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*',
                'Cookie': COOKIE_STRING,
                'Accept-Encoding': 'gzip, deflate, br, zstd'
            },
            timeout: 10000
        });

        const parsed = parseSMSData(response.data);
        const data = parsed.data;
        cache.set(cacheKey, {
            timestamp: Date.now(),
            data: { data: { data } }
        });
        return { data, error: false };
    } catch (e) {
        return { data: [], error: true };
    }
}

// === SINGLE QUERY ENDPOINT (unchanged) ===
app.get('/api/sms', async (req, res) => {
    const startTime = Date.now();
    try {
        const { query, page = 1, startDate, endDate } = req.query;
        if (!query) return res.status(400).json({ error: 'Query parameter is required' });

        const cacheKey = `${query}_${page}_${startDate || ''}_${endDate || ''}`;
        if (cache.has(cacheKey) && Date.now() - cache.get(cacheKey).timestamp < CACHE_TTL) {
            return res.json(cache.get(cacheKey).data);
        }

        let url = `https://zatechsolutions.online/dashboard?query=${encodeURIComponent(query)}&page=${page}`;
        if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
        if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;
        url += `&_rsc=${Date.now().toString(36)}`;

        const response = await axios.get(url, {
            headers: {
                'Host': 'zatechsolutions.online',
                'rsc': '1',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*',
                'Cookie': COOKIE_STRING,
                'Accept-Encoding': 'gzip, deflate, br, zstd'
            },
            timeout: 10000
        });

        if (response.data && response.data.length < 5000 && 
            (response.data.includes('Sign In') || response.data.includes('login'))) {
            return res.status(401).json({ 
                error: 'Session expired. Please refresh cookies.',
                data: { data: [], totalResults: 0, totalPages: 1 }
            });
        }

        const parsed = parseSMSData(response.data);
        const result = {
            data: {
                data: parsed.data,
                page: parseInt(page),
                totalPages: parsed.totalPages,
                totalResults: parsed.totalResults,
                limit: 100
            }
        };

        cache.set(cacheKey, { timestamp: Date.now(), data: result });
        res.json(result);
    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to fetch SMS data',
            details: error.message,
            data: { data: [], totalResults: 0, totalPages: 1 }
        });
    }
});

// === BULK ENDPOINT – POST (fast) ===
app.post('/api/sms/bulk', async (req, res) => {
    const startTime = Date.now();
    try {
        const { numbers, startDate, endDate } = req.body;
        if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
            return res.status(400).json({ error: 'Provide an array of numbers' });
        }
        // Limit to prevent abuse
        if (numbers.length > 5000) {
            return res.status(413).json({ error: 'Too many numbers, max 5000' });
        }

        console.log(`[BULK] Processing ${numbers.length} numbers`);

        // Process in parallel with a sensible concurrency (e.g., 20)
        const concurrency = 20;
        const results = [];
        const batches = [];
        for (let i = 0; i < numbers.length; i += concurrency) {
            batches.push(numbers.slice(i, i + concurrency));
        }

        for (const batch of batches) {
            const batchPromises = batch.map(num => fetchNumberData(num, startDate, endDate));
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
        }

        // Build sender breakdown
        const senderMap = {};
        let totalCount = 0;
        for (const r of results) {
            if (!r.error && r.data.length > 0) {
                totalCount += r.data.length;
                for (const rec of r.data) {
                    const sender = rec.from || 'unknown';
                    senderMap[sender] = (senderMap[sender] || 0) + 1;
                }
            }
        }

        const breakdown = Object.entries(senderMap)
            .sort((a, b) => b[1] - a[1])
            .map(([sender, count]) => ({ sender, count }));

        console.log(`[BULK DONE] ${numbers.length} numbers, ${totalCount} records (${Date.now() - startTime}ms)`);

        res.json({
            success: true,
            totalCount,
            breakdown
        });
    } catch (error) {
        console.error(`[BULK ERROR] ${Date.now() - startTime}ms - ${error.message}`);
        res.status(500).json({ 
            success: false,
            error: 'Failed to process bulk request',
            details: error.message
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        cacheSize: cache.size
    });
});

app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'ZATECH SMS Proxy (Fast)',
        endpoints: {
            health: '/health',
            sms: '/api/sms?query=PHONE_NUMBER&page=1',
            bulk: 'POST /api/sms/bulk (JSON body with { numbers: [], startDate, endDate })'
        }
    });
});

app.listen(PORT, () => {
    console.log(`🚀 ZATECH Proxy running on port ${PORT}`);
    console.log(`📍 Health: http://localhost:${PORT}/health`);
    console.log(`⚡ Cache TTL: ${CACHE_TTL/1000} seconds`);
});
