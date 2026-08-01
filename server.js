const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Your session cookies (same as before)
const COOKIE_STRING = '__Host-authjs.csrf-token=3d7ffcfbe406686694d1e522c7dca618cd2552e5bc0617c8842024bee0bad7a0%7C7f5271753378909234f3f855a0b4ff2a8629e1c0d5ad1e2617d6a83b85abd7a0; __Secure-authjs.callback-url=https%3A%2F%2Fzatechsolutions.online%2F; __cf_bm=ledUAtSBEVs0Y2w5qRJDhZTuL3Rdrb863dhpNyzlOMY-1785528531.5288565-1.0.1.1-ngmaa.Zm3wncjszPOfEaaSvJmjqnpROoEKK4syJKxDG6k.rHXHLyjBOtQI4Ehb9HawajCIfYZltwOEJQma7aer9i7W7fy0yY2bcQ1LCJVVCo570uR3ORom90V1ktoJc7; __Secure-authjs.session-token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2Q0JDLUhTNTEyIiwia2lkIjoiTmswT2tCZVByUGY2V2pVeDhyQnhCaHM3SnBPencyYzhSM3l3WUpWWXk4RzcxWkRTRy12MnMtT0FwdkdicVo0c1pCRjhackdIT3B6aGwta1MtM3hweEEifQ..bSN7dZTLou7tLhSpnnGq5g.oPMMdv416CCzJgELYbIkFyaOr-Sk4or1unbWIpmqtAcVFkNY5w9-VJ4UI_hykbmVrhBwlB1ggeomL85fQwvLeBTM-qhJxgXlTh0DxZ2To34nCTotHAgc6_m2QTnytBF07BOKVEelliLVIucWB7ZSU4s4wVchGINJ1o7v_n3eGrw1O4hsKf-VVoA9QgR3JcedBqMVmtM9TUFHE1uHD1RIxxPOG-F0epB2gwjmB44in51kc1LAjH7fHZwpfUtupV0UPwsXVi2vFll8CnohoPb6W6IGC6WwdOp3kbtungi5ch7j_PoxmC-bEZ0rGcrxjg3S.ZKDkIUQSO2XZc1Ws7EWuOcclx8Fc_bp1wSKbCFhPEkA';

// Simple in-memory cache (5 minute TTL)
const cache = new Map();
const CACHE_TTL = 300000;

// FAST PARSER - Direct regex extraction (no Cheerio, no DOM)
function parseSMSData(html) {
    const smsData = [];
    
    // Direct JSON extraction - FASTEST method
    const jsonMatches = html.match(/\{"_id":"[^"]+","from":"[^"]+","to":"[^"]+","message":"[^"]+","createdAt":"[^"]+"\}/g);
    if (jsonMatches) {
        for (const match of jsonMatches) {
            try {
                const parsed = JSON.parse(match);
                if (parsed._id) smsData.push(parsed);
            } catch (e) {}
        }
    }
    
    // If no direct JSON, try the data array pattern
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
    
    // Extract totals
    let totalResults = smsData.length;
    const totalResultsMatch = html.match(/totalResults:(\d+)/);
    if (totalResultsMatch) totalResults = parseInt(totalResultsMatch[1]);
    
    let totalPages = 1;
    const totalPagesMatch = html.match(/totalPages:(\d+)/);
    if (totalPagesMatch) totalPages = parseInt(totalPagesMatch[1]);
    
    return { data: smsData, totalResults, totalPages };
}

// === MAIN ENDPOINT - FAST like WhiteNoise ===
app.get('/api/sms', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { query, page = 1, startDate, endDate } = req.query;
        
        if (!query) {
            return res.status(400).json({ error: 'Query parameter is required' });
        }
        
        // Check cache
        const cacheKey = `${query}_${page}_${startDate || ''}_${endDate || ''}`;
        if (cache.has(cacheKey)) {
            const cached = cache.get(cacheKey);
            if (Date.now() - cached.timestamp < CACHE_TTL) {
                console.log(`[CACHE] ${query} (${Date.now() - startTime}ms)`);
                return res.json(cached.data);
            }
            cache.delete(cacheKey);
        }
        
        console.log(`[FETCH] ${query} page ${page}`);
        
        // Build URL - SAME as WhiteNoise pattern
        let url = `https://zatechsolutions.online/dashboard?query=${encodeURIComponent(query)}&page=${page}`;
        if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
        if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;
        url += `&_rsc=${Date.now().toString(36)}`;
        
        // Fetch - SAME headers as WhiteNoise
        const response = await axios.get(url, {
            headers: {
                'Host': 'zatechsolutions.online',
                'rsc': '1',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Cookie': COOKIE_STRING,
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 10000 // 10 second timeout
        });
        
        // Check if we got a login page
        if (response.data && response.data.length < 5000 && 
            (response.data.includes('Sign In') || response.data.includes('login'))) {
            return res.status(401).json({ 
                error: 'Session expired. Please refresh cookies.',
                data: { data: [], totalResults: 0, totalPages: 1 }
            });
        }
        
        // Parse the data
        const parsed = parseSMSData(response.data);
        
        // Format response - SAME as WhiteNoise
        const result = {
            data: {
                data: parsed.data,
                page: parseInt(page),
                totalPages: parsed.totalPages,
                totalResults: parsed.totalResults,
                limit: 100
            }
        };
        
        // Cache the result
        cache.set(cacheKey, {
            timestamp: Date.now(),
            data: result
        });
        
        console.log(`[DONE] ${query} (${Date.now() - startTime}ms) - ${parsed.data.length} records`);
        
        res.json(result);
        
    } catch (error) {
        console.error(`[ERROR] ${Date.now() - startTime}ms - ${error.message}`);
        res.status(500).json({ 
            error: 'Failed to fetch SMS data',
            details: error.message,
            data: { data: [], totalResults: 0, totalPages: 1 }
        });
    }
});

// === BULK ENDPOINT - FAST parallel processing ===
app.get('/api/sms/bulk', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { numbers, startDate, endDate } = req.query;
        
        if (!numbers) {
            return res.status(400).json({ error: 'Numbers parameter is required' });
        }
        
        const numberList = numbers.split(',').filter(n => n.trim());
        if (numberList.length === 0) {
            return res.status(400).json({ error: 'No valid numbers provided' });
        }
        
        console.log(`[BULK] Processing ${numberList.length} numbers`);
        
        // Process in parallel with concurrency limit
        const concurrency = 300;
        const results = [];
        const batches = [];
        
        for (let i = 0; i < numberList.length; i += concurrency) {
            batches.push(numberList.slice(i, i + concurrency));
        }
        
        for (const batch of batches) {
            const batchPromises = batch.map(async (num) => {
                const cacheKey = `${num}_1_${startDate || ''}_${endDate || ''}`;
                
                // Check cache
                if (cache.has(cacheKey)) {
                    const cached = cache.get(cacheKey);
                    if (Date.now() - cached.timestamp < CACHE_TTL) {
                        return { num, data: cached.data.data.data, error: false };
                    }
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
                    
                    // Cache the result
                    cache.set(cacheKey, {
                        timestamp: Date.now(),
                        data: { data: { data: data, totalResults: parsed.totalResults, totalPages: parsed.totalPages } }
                    });
                    
                    return { num, data, error: false };
                } catch (e) {
                    return { num, data: [], error: true };
                }
            });
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
        }
        
        // Build sender breakdown
        const senderMap = {};
        let totalCount = 0;
        const allRecords = [];
        
        for (const result of results) {
            if (!result.error && result.data.length > 0) {
                totalCount += result.data.length;
                allRecords.push(...result.data);
                for (const rec of result.data) {
                    const sender = rec.from || 'unknown';
                    senderMap[sender] = (senderMap[sender] || 0) + 1;
                }
            }
        }
        
        const sortedBreakdown = Object.entries(senderMap)
            .sort((a, b) => b[1] - a[1])
            .map(([sender, count]) => ({ sender, count }));
        
        console.log(`[BULK DONE] ${numberList.length} numbers, ${totalCount} records (${Date.now() - startTime}ms)`);
        
        res.json({
            success: true,
            totalCount,
            breakdown: sortedBreakdown,
            records: allRecords
        });
        
    } catch (error) {
        console.error(`[BULK ERROR] ${Date.now() - startTime}ms - ${error.message}`);
        res.status(500).json({ 
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

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'ZATECH SMS Proxy (Fast - WhiteNoise Pattern)',
        endpoints: {
            health: '/health',
            sms: '/api/sms?query=PHONE_NUMBER&page=1',
            bulk: '/api/sms/bulk?numbers=NUM1,NUM2'
        }
    });
});

app.listen(PORT, () => {
    console.log(`🚀 ZATECH Proxy running on port ${PORT}`);
    console.log(`📍 Health: http://localhost:${PORT}/health`);
    console.log(`⚡ Cache TTL: ${CACHE_TTL/1000} seconds`);
});
