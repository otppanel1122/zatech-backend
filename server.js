const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// === YOUR EXACT COOKIES AND HEADERS ===
const CONFIG = {
    // Your session cookies from the request
    COOKIE_STRING: '__Host-authjs.csrf-token=3d7ffcfbe406686694d1e522c7dca618cd2552e5bc0617c8842024bee0bad7a0%7C7f5271753378909234f3f855a0b4ff2a8629e1c0d5ad1e2617d6a83b85abd7a0; __Secure-authjs.callback-url=https%3A%2F%2Fzatechsolutions.online%2F; __cf_bm=ledUAtSBEVs0Y2w5qRJDhZTuL3Rdrb863dhpNyzlOMY-1785528531.5288565-1.0.1.1-ngmaa.Zm3wncjszPOfEaaSvJmjqnpROoEKK4syJKxDG6k.rHXHLyjBOtQI4Ehb9HawajCIfYZltwOEJQma7aer9i7W7fy0yY2bcQ1LCJVVCo570uR3ORom90V1ktoJc7; __Secure-authjs.session-token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2Q0JDLUhTNTEyIiwia2lkIjoiTmswT2tCZVByUGY2V2pVeDhyQnhCaHM3SnBPencyYzhSM3l3WUpWWXk4RzcxWkRTRy12MnMtT0FwdkdicVo0c1pCRjhackdIT3B6aGwta1MtM3hweEEifQ..bSN7dZTLou7tLhSpnnGq5g.oPMMdv416CCzJgELYbIkFyaOr-Sk4or1unbWIpmqtAcVFkNY5w9-VJ4UI_hykbmVrhBwlB1ggeomL85fQwvLeBTM-qhJxgXlTh0DxZ2To34nCTotHAgc6_m2QTnytBF07BOKVEelliLVIucWB7ZSU4s4wVchGINJ1o7v_n3eGrw1O4hsKf-VVoA9QgR3JcedBqMVmtM9TUFHE1uHD1RIxxPOG-F0epB2gwjmB44in51kc1LAjH7fHZwpfUtupV0UPwsXVi2vFll8CnohoPb6W6IGC6WwdOp3kbtungi5ch7j_PoxmC-bEZ0rGcrxjg3S.ZKDkIUQSO2XZc1Ws7EWuOcclx8Fc_bp1wSKbCFhPEkA',

    // Headers from your request
    HEADERS: {
        'Host': 'zatechsolutions.online',
        'rsc': '1',
        'sec-ch-ua-platform': '"Windows"',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',
        'sec-ch-ua': '"Not;A=Brand";v="8", "Chromium";v="150", "Microsoft Edge";v="150"',
        'sec-ch-ua-mobile': '?0',
        'Accept': '*/*',
        'sec-fetch-site': 'same-origin',
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-US,en;q=0.9'
    },

    // The next-router-state-tree for the request
    ROUTER_STATE: '%5B%22%22%2C%7B%22children%22%3A%5B%22dashboard%22%2C%7B%22children%22%3A%5B%22__PAGE__%3F%7B%5C%22query%5C%22%3A%5C%22447369520082%5C%22%2C%5C%22page%5C%22%3A%5C%221%5C%22%2C%5C%22startDate%5C%22%3A%5C%222026-07-31T19%3A00%3A00.000Z%5C%22%2C%5C%22endDate%5C%22%3A%5C%222026-08-01T18%3A59%3A59.999Z%5C%22%7D%22%2C%7B%7D%2C%22%2Fdashboard%22%2C%22refetch%22%5D%7D%5D%7D%5D'
};

// Extract SMS data from HTML
function extractSMSData(html) {
    const $ = cheerio.load(html);
    const smsData = [];
    let totalResults = 0;
    let totalPages = 1;
    
    // Try to find JSON data in script tags
    const scripts = $('script').toArray();
    for (const script of scripts) {
        const content = $(script).html() || '';
        
        // Look for the data array
        const dataMatch = content.match(/data:\[(.*?)\]/s);
        if (dataMatch) {
            try {
                const objects = dataMatch[1].match(/\{[^}]+\}/g);
                if (objects) {
                    for (const obj of objects) {
                        try {
                            const cleanObj = obj.replace(/\\/g, '');
                            const parsed = JSON.parse(cleanObj);
                            if (parsed._id) {
                                smsData.push(parsed);
                            }
                        } catch (e) {}
                    }
                }
            } catch (e) {}
        }
        
        // Look for totalResults
        const totalResultsMatch = content.match(/totalResults:(\d+)/);
        if (totalResultsMatch) {
            totalResults = parseInt(totalResultsMatch[1]);
        }
        
        const totalPagesMatch = content.match(/totalPages:(\d+)/);
        if (totalPagesMatch) {
            totalPages = parseInt(totalPagesMatch[1]);
        }
    }
    
    // If no data found, try direct JSON matches
    if (smsData.length === 0) {
        const jsonMatches = html.match(/\{"_id":"[^"]+","from":"[^"]+","to":"[^"]+","message":"[^"]+","createdAt":"[^"]+"\}/g);
        if (jsonMatches) {
            for (const match of jsonMatches) {
                try {
                    const parsed = JSON.parse(match);
                    smsData.push(parsed);
                } catch (e) {}
            }
        }
    }
    
    // If still no data, try to find the data in the HTML structure
    if (smsData.length === 0) {
        // Look for table rows or list items containing SMS data
        const rows = $('tr').toArray();
        for (const row of rows) {
            const cells = $(row).find('td').toArray();
            if (cells.length >= 3) {
                const text = $(cells[0]).text().trim();
                // Check if it looks like an SMS record
                if (text && (text.includes('OTP') || text.includes('code') || text.includes('verification'))) {
                    // Try to extract from the HTML
                    const htmlContent = $(row).html() || '';
                    const match = htmlContent.match(/\{"_id":"[^"]+"[^}]*\}/);
                    if (match) {
                        try {
                            const parsed = JSON.parse(match[0]);
                            smsData.push(parsed);
                        } catch (e) {}
                    }
                }
            }
        }
    }
    
    return {
        data: smsData,
        totalResults: totalResults || smsData.length,
        totalPages: totalPages || Math.ceil((totalResults || smsData.length) / 100) || 1
    };
}

// Main API endpoint
app.get('/api/sms', async (req, res) => {
    try {
        const { query, page, startDate, endDate } = req.query;
        
        if (!query) {
            return res.status(400).json({ error: 'Query parameter is required' });
        }
        
        console.log(`[${new Date().toISOString()}] Fetching SMS for: ${query}, page: ${page || 1}`);
        
        // Build the URL with the exact parameters
        let url = `https://zatechsolutions.online/dashboard?query=${encodeURIComponent(query)}&page=${page || 1}`;
        if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
        if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;
        url += `&_rsc=${Math.random().toString(36).substring(2, 7)}`;
        
        console.log('Fetching URL:', url);
        
        // Build the request with your exact headers
        const headers = {
            ...CONFIG.HEADERS,
            'Cookie': CONFIG.COOKIE_STRING,
            'next-router-state-tree': CONFIG.ROUTER_STATE,
            'Referer': `https://zatechsolutions.online/dashboard?query=${encodeURIComponent(query)}&page=${page || 1}`
        };
        
        // Make the request
        const response = await axios.get(url, {
            headers: headers,
            timeout: 30000,
            maxRedirects: 5,
            validateStatus: function (status) {
                return status < 500; // Accept all status codes less than 500
            }
        });
        
        console.log(`[${new Date().toISOString()}] Response status: ${response.status}`);
        
        // Check if we got the login page
        if (response.data && (response.data.includes('Sign In') || response.data.includes('login') || response.data.includes('ZAT – Reliable solutions'))) {
            console.log('Received login page - session may be expired');
            return res.status(401).json({ 
                error: 'Authentication failed. Session expired. Please refresh cookies.',
                data: { data: [], totalResults: 0, totalPages: 1 }
            });
        }
        
        // Check if we got a valid response
        if (response.status === 200 && response.data) {
            // Extract SMS data from HTML
            const extractedData = extractSMSData(response.data);
            
            console.log(`Found ${extractedData.data.length} records, total: ${extractedData.totalResults}`);
            
            // Format response
            res.json({
                data: {
                    data: extractedData.data,
                    page: parseInt(page) || 1,
                    totalPages: extractedData.totalPages,
                    totalResults: extractedData.totalResults,
                    limit: 100
                }
            });
        } else {
            // Handle non-200 responses
            console.error('Unexpected status:', response.status);
            res.status(response.status).json({ 
                error: `Unexpected response: ${response.status}`,
                data: { data: [], totalResults: 0, totalPages: 1 }
            });
        }
        
    } catch (error) {
        console.error('Error:', error.message);
        
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data preview:', error.response.data?.substring(0, 200));
            
            if (error.response.status === 401 || error.response.status === 403) {
                return res.status(401).json({ 
                    error: 'Authentication failed. Please update your session cookies.',
                    data: { data: [], totalResults: 0, totalPages: 1 }
                });
            }
        }
        
        res.status(500).json({ 
            error: 'Failed to fetch SMS data', 
            details: error.message,
            data: { data: [], totalResults: 0, totalPages: 1 }
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        endpoints: {
            health: '/health',
            sms: '/api/sms?query=PHONE_NUMBER&page=1'
        }
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'ZATECH SMS Proxy Server is running',
        endpoints: {
            health: '/health',
            sms: '/api/sms?query=PHONE_NUMBER&page=1'
        }
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
    console.log(`📍 SMS API: http://localhost:${PORT}/api/sms?query=447369520082&page=1`);
    console.log(`📌 Cookies loaded: ${CONFIG.COOKIE_STRING ? '✅ Yes' : '❌ No'}`);
});
