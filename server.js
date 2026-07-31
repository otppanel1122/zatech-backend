const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Proxy endpoint for ZATECH SMS
app.get('/api/sms', async (req, res) => {
    try {
        const { query, page, startDate, endDate } = req.query;
        
        // Build the URL for zatechsolutions.online
        let url = `https://zatechsolutions.online/dashboard?query=${encodeURIComponent(query)}&page=${page || 1}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&_rsc=1qeg6`;
        
        console.log('Fetching:', url);
        
        const response = await axios.get(url, {
            headers: {
                'host': 'zatechsolutions.online',
                'rsc': '1',
                'sec-ch-ua-platform': '"Windows"',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',
                'sec-ch-ua': '"Not;A=Brand";v="8", "Chromium";v="150", "Microsoft Edge";v="150"',
                'sec-ch-ua-mobile': '?0',
                'accept': '*/*',
                'sec-fetch-site': 'same-origin',
                'sec-fetch-mode': 'cors',
                'sec-fetch-dest': 'empty',
                'referer': `https://zatechsolutions.online/dashboard?query=${encodeURIComponent(query)}&page=${page || 1}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
                'accept-encoding': 'gzip, deflate, br, zstd',
                'accept-language': 'en-US,en;q=0.9'
            },
            timeout: 30000
        });
        
        // Parse the RSC response to extract data
        const text = response.data;
        let extractedData = [];
        let totalResults = 0;
        let totalPages = 1;
        
        // Try to extract data from the RSC response
        // Look for JSON objects with _id, from, to, message, createdAt
        const jsonMatches = text.match(/\{"_id":"[^"]+","from":"[^"]+","to":"[^"]+","message":"[^"]+","createdAt":"[^"]+"\}/g);
        if (jsonMatches) {
            for (const match of jsonMatches) {
                try {
                    const obj = JSON.parse(match);
                    extractedData.push(obj);
                } catch (e) {}
            }
        }
        
        // Try to find totalResults
        const totalResultsMatch = text.match(/totalResults:(\d+)/);
        if (totalResultsMatch) {
            totalResults = parseInt(totalResultsMatch[1]);
        }
        
        const totalPagesMatch = text.match(/totalPages:(\d+)/);
        if (totalPagesMatch) {
            totalPages = parseInt(totalPagesMatch[1]);
        }
        
        // If we still have no data, try the API endpoint
        if (extractedData.length === 0) {
            try {
                const apiUrl = `https://zatechsolutions.online/api/sms?query=${encodeURIComponent(query)}&page=${page || 1}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
                const apiResp = await axios.get(apiUrl, {
                    headers: {
                        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0'
                    },
                    timeout: 10000
                });
                if (apiResp.data && apiResp.data.data && apiResp.data.data.data) {
                    extractedData = apiResp.data.data.data;
                    totalResults = apiResp.data.data.totalResults || extractedData.length;
                    totalPages = apiResp.data.data.totalPages || 1;
                }
            } catch (e) {
                console.log('API endpoint fallback failed:', e.message);
            }
        }
        
        // Format response to match what the frontend expects
        res.json({
            data: {
                data: extractedData,
                page: parseInt(page) || 1,
                totalPages: totalPages,
                totalResults: totalResults || extractedData.length,
                limit: 100
            }
        });
        
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch SMS data', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
