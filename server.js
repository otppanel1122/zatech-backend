const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Configuration - You need to update these with your actual credentials
const CONFIG = {
    // These are the cookies from your browser session
    // You can get these by:
    // 1. Logging into zatechsolutions.online in your browser
    // 2. Opening Dev Tools (F12) -> Application -> Cookies
    // 3. Copy the cookie values here
    COOKIES: {
        '__Secure-authjs.session-token': 'YOUR_SESSION_TOKEN_HERE',
        '__Secure-authjs.callback-url': 'https%3A%2F%2Fzatechsolutions.online%2F',
        '__Host-authjs.csrf-token': 'YOUR_CSRF_TOKEN_HERE',
        '__cf_bm': 'YOUR_CF_BM_TOKEN_HERE'
    },
    // Alternatively, you can use a single cookie string
    COOKIE_STRING: '__Secure-authjs.session-token=YOUR_SESSION_TOKEN_HERE; __Secure-authjs.callback-url=https%3A%2F%2Fzatechsolutions.online%2F; __Host-authjs.csrf-token=YOUR_CSRF_TOKEN_HERE; __cf_bm=YOUR_CF_BM_TOKEN_HERE'
};

// Try to authenticate and get fresh cookies
async function getAuthenticatedCookies() {
    try {
        console.log('Attempting to get fresh cookies...');
        // First, try to get the login page to extract CSRF token
        const loginPage = await axios.get('https://zatechsolutions.online/login', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'
            }
        });
        
        // Extract CSRF token from the page if needed
        const $ = cheerio.load(loginPage.data);
        const csrfToken = $('input[name="csrfToken"]').val() || '';
        
        // If we have a valid session token in config, use it
        if (CONFIG.COOKIES['__Secure-authjs.session-token'] && 
            CONFIG.COOKIES['__Secure-authjs.session-token'] !== 'YOUR_SESSION_TOKEN_HERE') {
            console.log('Using provided session token');
            return CONFIG.COOKIES;
        }
        
        // Otherwise, try to login with credentials (if you have them)
        // This is a placeholder - you need to implement actual login
        console.log('No valid session token found. Please update CONFIG with your cookies.');
        return CONFIG.COOKIES;
        
    } catch (error) {
        console.error('Error getting cookies:', error.message);
        return CONFIG.COOKIES;
    }
}

// Extract SMS data from HTML response
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
    
    // If no data found in scripts, try to find JSON objects directly in HTML
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
        
        console.log(`Fetching SMS for: ${query}, page: ${page || 1}`);
        
        // Build the URL
        let url = `https://zatechsolutions.online/dashboard?query=${encodeURIComponent(query)}&page=${page || 1}`;
        if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
        if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;
        url += `&_rsc=${Math.random().toString(36).substring(2, 7)}`;
        
        console.log('Fetching URL:', url);
        
        // Get cookies
        const cookies = await getAuthenticatedCookies();
        
        // Build cookie string
        let cookieString = CONFIG.COOKIE_STRING;
        if (cookies) {
            cookieString = Object.entries(cookies)
                .map(([key, value]) => `${key}=${value}`)
                .join('; ');
        }
        
        // Make the request with cookies
        const response = await axios.get(url, {
            headers: {
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
                'Referer': `https://zatechsolutions.online/dashboard?query=${encodeURIComponent(query)}&page=${page || 1}`,
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cookie': cookieString
            },
            timeout: 30000,
            maxRedirects: 5
        });
        
        // Check if we got the login page (redirected)
        if (response.data.includes('Sign In') || response.data.includes('login')) {
            console.log('Received login page - session may be expired');
            return res.status(401).json({ 
                error: 'Authentication required. Please update your session cookies.',
                data: { data: [], totalResults: 0, totalPages: 1 }
            });
        }
        
        // Extract SMS data from HTML
        const extractedData = extractSMSData(response.data);
        
        // Format response to match frontend expectations
        res.json({
            data: {
                data: extractedData.data,
                page: parseInt(page) || 1,
                totalPages: extractedData.totalPages,
                totalResults: extractedData.totalResults,
                limit: 100
            }
        });
        
    } catch (error) {
        console.error('Error:', error.message);
        
        // Handle different error types
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data?.substring(0, 200));
            
            // If we got a 401 or 403, it's an auth issue
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

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log('IMPORTANT: Update CONFIG with your cookies to authenticate');
});
