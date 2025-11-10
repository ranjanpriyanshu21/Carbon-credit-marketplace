const { v4: uuidv4 } = require('uuid');

class Database {
    constructor() {
        this.users = new Map();
        this.listings = new Map();
        this.transactions = new Map();
        
        // Initialize some test data
        this.initializeTestData();
    }

    initializeTestData() {
        // Add some test users
        this.users.set('seller1', {
            username: 'seller1',
            password: 'password123',
            role: 'seller',
            balance: 0
        });

        this.users.set('buyer1', {
            username: 'buyer1',
            password: 'password123',
            role: 'buyer',
            balance: 0
        });
    }

    registerUser(username, password, role) {
        if (this.users.has(username)) {
            return { success: false, message: 'Username already exists' };
        }

        if (!['buyer', 'seller'].includes(role)) {
            return { success: false, message: 'Invalid role' };
        }

        this.users.set(username, {
            username,
            password, // In production, hash this password
            role,
            balance: 0
        });

        return { success: true, message: 'User registered successfully' };
    }

    authenticateUser(username, password) {
        const user = this.users.get(username);
        if (user && user.password === password) {
            return user;
        }
        return null;
    }

    getUser(username) {
        return this.users.get(username);
    }

    updateUserBalance(username, amount) {
        const user = this.users.get(username);
        if (user) {
            user.balance += amount;
            return true;
        }
        return false;
    }

    createListing(seller, amount, price) {
        const listing = {
            id: uuidv4(),
            seller,
            amount: parseFloat(amount),
            price: parseFloat(price),
            status: 'pending',
            createdAt: new Date().toISOString()
        };

        this.listings.set(listing.id, listing);
        return listing;
    }

    getMarketplace() {
        return Array.from(this.listings.values())
            .filter(listing => listing.status === 'verified')
            .map(listing => ({
                id: listing.id,
                seller: listing.seller,
                amount: listing.amount,
                price: listing.price,
                createdAt: listing.createdAt
            }));
    }

    purchaseCredit(buyer, listingId) {
        const listing = this.listings.get(listingId);
        if (!listing) {
            return { success: false, message: 'Listing not found' };
        }

        if (listing.status !== 'verified') {
            return { success: false, message: 'Listing not available for purchase' };
        }

        const buyerUser = this.users.get(buyer);
        if (!buyerUser) {
            return { success: false, message: 'Buyer not found' };
        }

        // Update balances
        this.updateUserBalance(listing.seller, -listing.amount);
        this.updateUserBalance(buyer, listing.amount);

        // Remove listing
        this.listings.delete(listingId);

        return {
            success: true,
            seller: listing.seller,
            amount: listing.amount,
            price: listing.price
        };
    }

    verifyListing(listingId) {
        const listing = this.listings.get(listingId);
        if (listing) {
            listing.status = 'verified';
            return true;
        }
        return false;
    }
}

module.exports = { Database };