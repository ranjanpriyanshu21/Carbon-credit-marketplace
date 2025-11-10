const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const { Blockchain } = require('./blockchain');
const { PBFT } = require('./pbft');
const { Database } = require('./database');

const app = express();
// const port = 3000;

app.use(cors());
app.use(bodyParser.json());

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
    
    // Send initial blockchain data
    ws.send(JSON.stringify({
        type: 'blockchain_update',
        data: blockchain.getChain()
    }));

    // Send initial marketplace data
    ws.send(JSON.stringify({
        type: 'marketplace_update',
        data: database.getMarketplace()
    }));

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
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
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
    
    if (!username || !amount || !price) {
        return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    
    // Verify user exists and is seller
    const user = database.getUser(username);
    if (!user || user.role !== 'seller') {
        return res.status(400).json({ success: false, message: 'Invalid user or not a seller' });
    }

    try {
        // Create listing
        const listing = database.createListing(username, amount, price);
        
        // Start PBFT consensus for verification
        pbft.startConsensus(listing, (result) => {
            if (result.success) {
                // Add to blockchain
                const block = blockchain.addBlock({
                    type: 'carbon_credit_listing',
                    listingId: listing.id,
                    seller: username,
                    amount: parseFloat(amount),
                    price: parseFloat(price),
                    timestamp: new Date().toISOString(),
                    status: 'verified'
                });

                // Update seller's balance
                database.updateUserBalance(username, parseFloat(amount));
                
                // Verify the listing in database
                database.verifyListing(listing.id);

                broadcastToClients({
                    type: 'blockchain_update',
                    data: blockchain.getChain()
                });

                broadcastToClients({
                    type: 'marketplace_update',
                    data: database.getMarketplace()
                });

                broadcastToClients({
                    type: 'user_balance_update',
                    data: { username, balance: user.balance }
                });

                console.log(`Carbon credit listed and verified: ${listing.id}`);
            } else {
                console.log(`Carbon credit verification failed: ${listing.id}`);
                // Mark listing as failed
                const failedListing = database.listings.get(listing.id);
                if (failedListing) {
                    failedListing.status = 'failed';
                }
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
        // Add transaction to blockchain
        const block = blockchain.addBlock({
            type: 'carbon_credit_purchase',
            listingId: listingId,
            buyer: buyer,
            seller: result.seller,
            amount: result.amount,
            price: result.price,
            timestamp: new Date().toISOString()
        });

        // Update user balances for real-time updates
        const buyerUser = database.getUser(buyer);
        const sellerUser = database.getUser(result.seller);

        broadcastToClients({
            type: 'blockchain_update',
            data: blockchain.getChain()
        });

        broadcastToClients({
            type: 'marketplace_update',
            data: database.getMarketplace()
        });

        broadcastToClients({
            type: 'user_balance_update',
            data: { username: buyer, balance: buyerUser.balance }
        });

        broadcastToClients({
            type: 'user_balance_update',
            data: { username: result.seller, balance: sellerUser.balance }
        });

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

// Start the server
const port = process.env.PORT || 3000;

server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});


module.exports = { app, server, wss };