// backend/server.js

const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const { Blockchain } = require('./blockchain');
const { PBFT } = require('./pbft');
const { Database } = require('./database');

const app = express();

// Use express.json() (built-in) to parse JSON bodies
app.use(express.json());

// CORS: allow your frontend domain(s). Use env var FRONTEND_URL in production.
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://carbon-credit-marketplace.onrender.com';
const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    FRONTEND_URL
];

app.use(cors({
    origin: function (origin, callback) {
        // allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('CORS policy: origin not allowed'));
        }
    },
    methods: ['GET', 'POST'],
    credentials: true
}));

// Initialize components
const blockchain = new Blockchain();
const database = new Database();
const pbft = new PBFT(blockchain);

// Create HTTP server and attach WebSocket server to it
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// Store connected clients
const clients = new Set();

wss.on('connection', (ws) => {
    console.log('Client connected');
    clients.add(ws);

    // send initial blockchain & marketplace
    try {
        ws.send(JSON.stringify({ type: 'blockchain_update', data: blockchain.getChain() }));
        ws.send(JSON.stringify({ type: 'marketplace_update', data: database.getMarketplace() }));
    } catch (err) {
        console.error('Error sending initial data to client:', err);
    }

    ws.on('close', () => {
        console.log('Client disconnected');
        clients.delete(ws);
    });

    ws.on('error', (error) => {
        console.log('WebSocket error:', error);
        clients.delete(ws);
    });
});

function broadcastToClients(data) {
    const msg = JSON.stringify(data);
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(msg);
            } catch (err) {
                console.warn('Failed to send to a client:', err);
            }
        }
    });
}

// Routes

// User registration
app.post('/api/register', (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
        return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const result = database.registerUser(username, password, role);
    if (result.success) {
        res.json({ success: true, message: 'User registered successfully' });
    } else {
        res.status(400).json({ success: false, message: result.message });
    }
});

// User login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    const user = database.authenticateUser(username, password);
    if (user) {
        res.json({
            success: true,
            user: {
                username: user.username,
                role: user.role,
                balance: user.balance
            }
        });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// List carbon credit
app.post('/api/list-credit', async (req, res) => {
    const { username, amount, price } = req.body;

    if (!username || amount == null || price == null) {
        return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const user = database.getUser(username);
    if (!user || user.role !== 'seller') {
        return res.status(400).json({ success: false, message: 'Invalid user or not a seller' });
    }

    try {
        const listing = database.createListing(username, amount, price);

        // Start PBFT consensus for verification
        pbft.startConsensus(listing, (result) => {
            try {
                if (result.success) {
                    const block = blockchain.addBlock({
                        type: 'carbon_credit_listing',
                        listingId: listing.id,
                        seller: username,
                        amount: parseFloat(amount),
                        price: parseFloat(price),
                        timestamp: new Date().toISOString(),
                        status: 'verified'
                    });

                    database.updateUserBalance(username, parseFloat(amount));
                    database.verifyListing(listing.id);

                    broadcastToClients({ type: 'blockchain_update', data: blockchain.getChain() });
                    broadcastToClients({ type: 'marketplace_update', data: database.getMarketplace() });
                    broadcastToClients({ type: 'user_balance_update', data: { username, balance: user.balance } });

                    console.log(`Carbon credit listed and verified: ${listing.id}`);
                } else {
                    console.log(`Carbon credit verification failed: ${listing.id}`);
                    const failedListing = database.listings.get(listing.id);
                    if (failedListing) failedListing.status = 'failed';
                }
            } catch (err) {
                console.error('Error in pbft callback:', err);
            }
        });

        res.json({
            success: true,
            message: 'Carbon credit listed and undergoing verification',
            listingId: listing.id
        });
    } catch (error) {
        console.error('Error listing credit:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Get marketplace listings
app.get('/api/marketplace', (req, res) => {
    res.json(database.getMarketplace());
});

// Buy carbon credit
app.post('/api/buy-credit', (req, res) => {
    const { buyer, listingId } = req.body;

    if (!buyer || !listingId) {
        return res.status(400).json({ success: false, message: 'Buyer and listing ID are required' });
    }

    const result = database.purchaseCredit(buyer, listingId);
    if (result.success) {
        const block = blockchain.addBlock({
            type: 'carbon_credit_purchase',
            listingId: listingId,
            buyer: buyer,
            seller: result.seller,
            amount: result.amount,
            price: result.price,
            timestamp: new Date().toISOString()
        });

        const buyerUser = database.getUser(buyer);
        const sellerUser = database.getUser(result.seller);

        broadcastToClients({ type: 'blockchain_update', data: blockchain.getChain() });
        broadcastToClients({ type: 'marketplace_update', data: database.getMarketplace() });

        if (buyerUser) broadcastToClients({ type: 'user_balance_update', data: { username: buyer, balance: buyerUser.balance } });
        if (sellerUser) broadcastToClients({ type: 'user_balance_update', data: { username: result.seller, balance: sellerUser.balance } });

        res.json({ success: true, message: 'Purchase successful' });
    } else {
        res.status(400).json({ success: false, message: result.message });
    }
});

// Get user balance
app.get('/api/user/:username', (req, res) => {
    const user = database.getUser(req.params.username);
    if (user) {
        res.json({
            username: user.username,
            role: user.role,
            balance: user.balance
        });
    } else {
        res.status(404).json({ message: 'User not found' });
    }
});

// Get blockchain
app.get('/api/blockchain', (req, res) => {
    res.json(blockchain.getChain());
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        blockchainLength: blockchain.getChain().length,
        connectedClients: clients.size
    });
});

// Global error handler (returns JSON)
app.use((err, req, res, next) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
});

// Start the server
const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// export for testing or external uses
module.exports = { app, server, wss };
