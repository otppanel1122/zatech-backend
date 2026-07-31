const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Your session cookies
const COOKIE_STRING = '__Host-authjs.csrf-token=3d7ffcfbe406686694d1e522c7dca618cd2552e5bc0617c8842024bee0bad7a0%7C7f5271753378909234f3f855a0b4ff2a8629e1c0d5ad1e2617d6a83b85abd7a0; __Secure-authjs.callback-url=https%3A%2F%2Fzatechsolutions.online%2F; __cf_bm=ledUAtSBEVs0Y2w5qRJDhZTuL3Rdrb863dhpNyzlOMY-1785528531.5288565-1.0.1.1-ngmaa.Zm3wncjszPOfEaaSvJmjqnpROoEKK4syJKxDG6k.rHXHLyjBOtQI4Ehb9HawajCIfYZltwOEJQma7aer9i7W7fy0yY2bcQ1LCJVVCo570uR3ORom90V1ktoJc7; __Secure-authjs.session-token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2Q0JDLUhTNTEyIiwia2lkIjoiTmswT2tCZVByUGY2V2pVeDhyQnhCaHM3SnBPencyYzhSM3l3WUpWWXk4RzcxWkRTRy12MnMtT0FwdkdicVo0c1pCRjhackdIT3B6aGwta1MtM3hweEEifQ..bSN7dZTLou7tLhSpnnGq5g.oPMMdv416CCzJgELYbIkFyaOr-Sk4or1unbWIpmqtAcVFkNY5w9-VJ4UI_hykbmVrhBwlB1ggeomL85fQwvLeBTM-qhJxgXlTh0DxZ2To34nCTotHAgc6_m2QTnytBF07BOKVEelliLVIucWB7ZSU4s4wVchGINJ1o7v_n3eGrw1O4hsKf-VVoA9QgR3JcedBqMVmtM9TUFHE1uHD1RIxxPOG-F0epB2gwjmB44in51kc1LAjH7fHZwpfUtupV0UPwsXVi2vFll8CnohoPb6W6IGC6WwdOp3kbtungi5ch7j_PoxmC-bEZ0rGcrxjg3S.ZKDkIUQSO2XZc1Ws7EWuOcclx8Fc_bp1wSKbCFhPEkA';

// Cache for storing responses (5 minute TTL)
const cache = new Map();
const CACHE_TTL = 300000; // 5 minutes

// Extract SMS data from HTML - OPTIMIZED
function extractSMSData(html) {
    const smsData = [];
    let totalResults = 0;
    let totalPages = 1;
    
    // OPTIMIZED: Look for JSON objects directly without cheerio
    const jsonMatches = html.match(/\{"_id":"[^"]+","from":"[^"]+","to":"[^"]+","message":"[^"]+","createdAt":"[^"]+"\}/g);
    if (jsonMatches) {
        for (const match of jsonMatches) {
            try {
                const parsed = JSON.parse(match);
                if (parsed._id) smsData.push(parsed);
            } catch (e) {}
        }
    }
    
    // If no data found, try alternative patterns
    if (smsData.length === 0) {
        const altMatch = html.match(/data:\[(.*?)\]/s);
        if (altMatch) {
            try {
                const objects = altMatch[1].match(/\{[^}]+\}/g);
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
    
    // Extract totalResults and totalPages
    const totalResultsMatch = html.match(/totalResults:(\d+)/);
    if (totalResultsMatch) totalResults = parseInt(totalResultsMatch[1]);
    
    const totalPagesMatch = html.match(/totalPages:(\d+)/);
    if (totalPagesMatch) totalPages = parseInt(totalPagesMatch[1]);
    
    return {
        data: smsData,
        totalResults: totalResults || smsData.length,
        totalPages: totalPages || Math.ceil((totalResults || smsData.length) / 100) || 1
    };
}

// Main API endpoint - OPTIMIZED with caching and timeout
app.get('/api/sms', async (req, res) => {
    try {
        const { query, page, startDate, endDate } = req.query;
        
        if (!query) {
            return res.status(400).json({ error: 'Query parameter is required' });
        }
        
        // Generate cache key
        const cacheKey = `${query}_${page || 1}_${startDate || ''}_${endDate || ''}`;
        
        // Check cache
        if (cache.has(cacheKey)) {
            const cached = cache.get(cacheKey);
            if (Date.now() - cached.timestamp < CACHE_TTL) {
                console.log(`[CACHE HIT] ${query} page ${page || 1}`);
                return res.json(cached.data);
            } else {
                cache.delete(cacheKey);
            }
        }
        
        console.log(`[FETCH] ${query} page ${page || 1}`);
        
        // Build the URL
        let url = `https://zatechsolutions.online/dashboard?query=${encodeURIComponent(query)}&page=${page || 1}`;
        if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
        if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;
        url += `&_rsc=${Date.now().toString(36)}`;
        
        // Make the request with shorter timeout
        const response = await axios.get(url, {
            headers: {
                'Host': 'zatechsolutions.online',
                'rsc': '1',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',
                'Accept': '*/*',
                'sec-fetch-site': 'same-origin',
                'sec-fetch-mode': 'cors',
                'sec-fetch-dest': 'empty',
                'Cookie': COOKIE_STRING,
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 15000, // 15 second timeout
            maxRedirects: 3
        });
        
        // Check for login page (fast check)
        if (response.data && response.data.length < 1000 && 
            (response.data.includes('Sign In') || response.data.includes('login'))) {
            return res.status(401).json({ 
                error: 'Authentication failed. Session expired.',
                data: { data: [], totalResults: 0, totalPages: 1 }
            });
        }
        
        // Extract data
        const extractedData = extractSMSData(response.data);
        
        // Format response
        const result = {
            data: {
                data: extractedData.data,
                page: parseInt(page) || 1,
                totalPages: extractedData.totalPages,
                totalResults: extractedData.totalResults,
                limit: 100
            }
        };
        
        // Store in cache
        cache.set(cacheKey, {
            timestamp: Date.now(),
            data: result
        });
        
        res.json(result);
        
    } catch (error) {
        console.error('Error:', error.message);
        
        if (error.code === 'ECONNABORTED') {
            res.status(504).json({ 
                error: 'Request timeout. Please try again.',
                data: { data: [], totalResults: 0, totalPages: 1 }
            });
        } else {
            res.status(500).json({ 
                error: 'Failed to fetch SMS data', 
                details: error.message,
                data: { data: [], totalResults: 0, totalPages: 1 }
            });
        }
    }
});

// Bulk endpoint - OPTIMIZED with parallel requests and caching
app.get('/api/sms/bulk', async (req, res) => {
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
        
        // Process numbers in parallel with concurrency limit
        const concurrency = 3;
        const results = [];
        const batches = [];
        
        for (let i = 0; i < numberList.length; i += concurrency) {
            batches.push(numberList.slice(i, i + concurrency));
        }
        
        for (const batch of batches) {
            const batchPromises = batch.map(async (num) => {
                const cacheKey = `${num}_1_${startDate || ''}_${endDate || ''}`;
                
                // Check cache first
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
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
                            'Accept': '*/*',
                            'Cookie': COOKIE_STRING,
                            'Accept-Encoding': 'gzip, deflate, br, zstd'
                        },
                        timeout: 15000,
                        maxRedirects: 3
                    });
                    
                    const extracted = extractSMSData(response.data);
                    const data = extracted.data;
                    
                    // Cache the result
                    cache.set(cacheKey, {
                        timestamp: Date.now(),
                        data: { data: { data: data, totalResults: extracted.totalResults, totalPages: extracted.totalPages } }
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
        
        // Sort breakdown
        const sortedBreakdown = Object.entries(senderMap)
            .sort((a, b) => b[1] - a[1])
            .map(([sender, count]) => ({ sender, count }));
        
        res.json({
            success: true,
            totalCount,
            breakdown: sortedBreakdown,
            records: allRecords
        });
        
    } catch (error) {
        console.error('Bulk error:', error.message);
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
        message: 'ZATECH SMS Proxy Server (Optimized)',
        endpoints: {
            health: '/health',
            sms: '/api/sms?query=PHONE_NUMBER&page=1',
            bulk: '/api/sms/bulk?numbers=NUM1,NUM2&startDate=...&endDate=...'
        }
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Health: http://localhost:${PORT}/health`);
    console.log(`📦 Cache TTL: ${CACHE_TTL/1000} seconds`);
});
