// frontend/app.js

let currentUser = null;
let ws = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

// --- Config: dynamic base URLs (works both locally and on render) ---
const API_BASE_URL = (function () {
    // If running locally (dev), keep localhost:3000; otherwise production host
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:3000';
    }
    // Replace with your actual deployed backend URL if different
    return 'https://carbon-credit-marketplace.onrender.com';
})();

const WS_BASE_URL = (function () {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return `${protocol}//localhost:3000`;
    }
    return `${protocol}//carbon-credit-marketplace.onrender.com`;
})();

// --- Helper: safe JSON parse ---
async function safeJson(response) {
    // If response has no content, return null
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch (err) {
        console.error('Failed to parse JSON response:', err, 'text:', text);
        return null;
    }
}

// WebSocket connection
function connectWebSocket() {
    try {
        ws = new WebSocket(WS_BASE_URL);

        ws.onopen = () => {
            console.log('Connected to WebSocket server');
            reconnectAttempts = 0;
            showConnectionStatus('connected');
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('WebSocket message received:', data.type);

                switch (data.type) {
                    case 'blockchain_update':
                        updateBlockchainDisplay(data.data);
                        break;
                    case 'marketplace_update':
                        updateMarketplaceDisplay(data.data);
                        break;
                    case 'user_balance_update':
                        if (currentUser && currentUser.username === data.data.username) {
                            currentUser.balance = data.data.balance;
                            updateUserBalanceDisplay();
                        }
                        break;
                    default:
                        console.warn('Unknown ws message type:', data.type);
                }
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };

        ws.onclose = (event) => {
            console.log('WebSocket connection closed:', event.code, event.reason);
            showConnectionStatus('disconnected');

            if (reconnectAttempts < maxReconnectAttempts) {
                const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
                console.log(`Attempting to reconnect in ${delay}ms...`);
                setTimeout(connectWebSocket, delay);
                reconnectAttempts++;
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            showConnectionStatus('error');
        };
    } catch (error) {
        console.error('Error creating WebSocket connection:', error);
    }
}

function showConnectionStatus(status) {
    const statusColors = {
        connected: 'green',
        disconnected: 'orange',
        error: 'red'
    };
    console.log(`Connection status: ${status}`);
    // Optionally update UI indicator here (using statusColors[status])
}

// Authentication functions
async function login() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    if (!username || !password) {
        showAlert('Please enter username and password', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            // Try to read JSON error message (if any)
            const errJson = await safeJson(response);
            const msg = errJson && errJson.message ? errJson.message : `HTTP ${response.status}`;
            showAlert('Login failed: ' + msg, 'error');
            return;
        }

        const data = await safeJson(response);
        if (!data) {
            showAlert('Login failed: empty response', 'error');
            return;
        }

        if (data.success) {
            currentUser = data.user;
            showAlert('Login successful!', 'success');
            showDashboard();
            loadUserData();
            loadMarketplace();
            loadBlockchain();
        } else {
            showAlert('Login failed: ' + (data.message || 'Unknown'), 'error');
        }
    } catch (error) {
        showAlert('Error during login: ' + error.message, 'error');
        console.error('Login error:', error);
    }
}

async function register() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const role = document.getElementById('role').value;

    if (!username || !password) {
        showAlert('Please enter username and password', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role })
        });

        if (!response.ok) {
            const errJson = await safeJson(response);
            const msg = errJson && errJson.message ? errJson.message : `HTTP ${response.status}`;
            showAlert('Registration failed: ' + msg, 'error');
            return;
        }

        const data = await safeJson(response);
        if (!data) {
            showAlert('Registration failed: empty response', 'error');
            return;
        }

        if (data.success) {
            showAlert('Registration successful! Please login.', 'success');
            document.getElementById('username').value = '';
            document.getElementById('password').value = '';
        } else {
            showAlert('Registration failed: ' + (data.message || 'Unknown'), 'error');
        }
    } catch (error) {
        showAlert('Error during registration: ' + error.message, 'error');
        console.error('Registration error:', error);
    }
}

function logout() {
    currentUser = null;
    const authSection = document.getElementById('auth-section');
    const dashboard = document.getElementById('dashboard');
    if (authSection) authSection.classList.remove('hidden');
    if (dashboard) dashboard.classList.add('hidden');
    const sellerSection = document.getElementById('seller-section');
    if (sellerSection) sellerSection.classList.add('hidden');
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    showAlert('Logged out successfully', 'success');
}

function showDashboard() {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');

    if (currentUser && currentUser.role === 'seller') {
        document.getElementById('seller-section').classList.remove('hidden');
    } else {
        document.getElementById('seller-section').classList.add('hidden');
    }
}

function updateUserBalanceDisplay() {
    if (currentUser) {
        const el = document.getElementById('user-balance');
        if (el) el.textContent = currentUser.balance;
    }
}

async function loadUserData() {
    if (!currentUser) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/user/${encodeURIComponent(currentUser.username)}`);
        if (!response.ok) {
            console.warn('Failed to load user data:', response.status);
            return;
        }
        const userData = await safeJson(response);
        if (userData) {
            document.getElementById('user-name').textContent = userData.username;
            document.getElementById('user-role').textContent = userData.role;
            document.getElementById('user-balance').textContent = userData.balance;
            currentUser.balance = userData.balance;
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

// Seller functions
async function listCredits() {
    if (!currentUser || currentUser.role !== 'seller') {
        showAlert('Only sellers can list carbon credits', 'error');
        return;
    }

    const amount = parseFloat(document.getElementById('credit-amount').value);
    const price = parseFloat(document.getElementById('credit-price').value);

    if (!amount || amount < 1) {
        showAlert('Please enter a valid credit amount (minimum 1)', 'error');
        return;
    }

    if (!price || price < 0.01) {
        showAlert('Please enter a valid price (minimum $0.01)', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/list-credit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUser.username,
                amount,
                price
            })
        });

        if (!response.ok) {
            const errJson = await safeJson(response);
            const msg = errJson && errJson.message ? errJson.message : `HTTP ${response.status}`;
            showAlert('Failed to list credits: ' + msg, 'error');
            return;
        }
        const data = await safeJson(response);
        if (data && data.success) {
            showAlert('Carbon credits listed successfully! Waiting for verification...', 'success');
            document.getElementById('credit-amount').value = '';
            document.getElementById('credit-price').value = '';
            setTimeout(loadUserData, 1000);
        } else {
            showAlert('Failed to list credits: ' + (data && data.message ? data.message : 'Unknown'), 'error');
        }
    } catch (error) {
        showAlert('Error listing credits: ' + error.message, 'error');
        console.error('Error listing credits:', error);
    }
}

// Marketplace functions
async function loadMarketplace() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/marketplace`);
        if (!response.ok) {
            showAlert('Error loading marketplace', 'error');
            return;
        }
        const listings = await safeJson(response);
        updateMarketplaceDisplay(listings || []);
    } catch (error) {
        console.error('Error loading marketplace:', error);
        showAlert('Error loading marketplace', 'error');
    }
}

function updateMarketplaceDisplay(listings) {
    const container = document.getElementById('marketplace-listings');
    if (!container) return;

    if (!listings || listings.length === 0) {
        container.innerHTML = '<div class="no-listings">No carbon credits available for purchase at the moment.</div>';
        return;
    }

    container.innerHTML = listings.map(listing => `
        <div class="listing-card">
            <h4>${listing.amount} Carbon Credits</h4>
            <p><strong>Seller:</strong> ${listing.seller}</p>
            <p><strong>Price:</strong> $${parseFloat(listing.price).toFixed(2)} per credit</p>
            <p><strong>Total Value:</strong> $${(listing.amount * listing.price).toFixed(2)}</p>
            <p><strong>Listed:</strong> ${new Date(listing.createdAt).toLocaleDateString()}</p>
            ${currentUser && currentUser.role === 'buyer' ? 
                `<button class="buy-btn" onclick="buyCredits('${listing.id}')">Buy Credits</button>` : 
                ''}
        </div>
    `).join('');
}

async function buyCredits(listingId) {
    if (!currentUser) {
        showAlert('Please login to purchase credits', 'error');
        return;
    }

    if (currentUser.role !== 'buyer') {
        showAlert('Only buyers can purchase carbon credits', 'error');
        return;
    }

    if (!confirm('Are you sure you want to purchase these carbon credits?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/buy-credit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                buyer: currentUser.username,
                listingId
            })
        });

        if (!response.ok) {
            const errJson = await safeJson(response);
            const msg = errJson && errJson.message ? errJson.message : `HTTP ${response.status}`;
            showAlert('Purchase failed: ' + msg, 'error');
            return;
        }

        const data = await safeJson(response);
        if (data && data.success) {
            showAlert('Purchase successful! Your balance has been updated.', 'success');
            setTimeout(() => {
                loadUserData();
                loadMarketplace();
            }, 1000);
        } else {
            showAlert('Purchase failed: ' + (data && data.message ? data.message : 'Unknown'), 'error');
        }
    } catch (error) {
        showAlert('Error purchasing credits: ' + error.message, 'error');
        console.error('Error purchasing credits:', error);
    }
}

// Blockchain functions
async function loadBlockchain() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/blockchain`);
        if (!response.ok) {
            console.warn('Failed to load blockchain:', response.status);
            return;
        }
        const blockchain = await safeJson(response);
        updateBlockchainDisplay(blockchain || []);
    } catch (error) {
        console.error('Error loading blockchain:', error);
    }
}

function updateBlockchainDisplay(chain) {
    const container = document.getElementById('blockchain-info');
    if (!container) return;

    if (!chain || chain.length === 0) {
        container.innerHTML = '<div class="no-blocks">No blocks in the blockchain yet.</div>';
        return;
    }

    const reversedChain = [...chain].reverse();

    container.innerHTML = reversedChain.map((block, idx) => `
        <div class="block">
            <div class="block-header">Block #${chain.indexOf(block)} | ${block.data?.type || 'Transaction'}</div>
            <div><strong>Hash:</strong> ${String(block.hash || '').substring(0, 20)}...</div>
            <div><strong>Previous Hash:</strong> ${String(block.previousHash || '').substring(0, 20)}...</div>
            <div><strong>Timestamp:</strong> ${new Date(block.timestamp).toLocaleString()}</div>
            <div><strong>Data:</strong> <pre>${JSON.stringify(block.data, null, 2)}</pre></div>
            <div><strong>Nonce:</strong> ${block.nonce}</div>
        </div>
    `).join('');
}

// Utility functions
function showAlert(message, type) {
    const existingAlerts = document.querySelectorAll('.alert');
    existingAlerts.forEach(alert => alert.remove());

    const alert = document.createElement('div');
    alert.className = `alert ${type}`;
    alert.textContent = message;

    document.body.prepend(alert);

    setTimeout(() => {
        if (alert.parentNode) alert.parentNode.removeChild(alert);
    }, 5000);
}

// Initialize app when page loads
window.onload = function () {
    connectWebSocket();

    const pw = document.getElementById('password');
    if (pw) {
        pw.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                login();
            }
        });
    }

    // Optionally call loadMarketplace() here to show listings for anonymous users
    loadMarketplace();
};
