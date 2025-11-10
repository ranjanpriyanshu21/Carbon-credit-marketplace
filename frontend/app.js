let currentUser = null;
let ws = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

// WebSocket connection
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:3000`;
    
    try {
        ws = new WebSocket(wsUrl);
        
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
    // You can add a status indicator to your UI if needed
    const statusColors = {
        connected: 'green',
        disconnected: 'orange',
        error: 'red'
    };
    console.log(`Connection status: ${status}`);
}

// Authentication functions
async function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    if (!username || !password) {
        showAlert('Please enter username and password', 'error');
        return;
    }
    
    try {
        const response = await fetch('http://localhost:3000/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.user;
            showAlert('Login successful!', 'success');
            showDashboard();
            loadUserData();
            loadMarketplace();
            loadBlockchain();
        } else {
            showAlert('Login failed: ' + data.message, 'error');
        }
    } catch (error) {
        showAlert('Error during login: ' + error.message, 'error');
        console.error('Login error:', error);
    }
}

async function register() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const role = document.getElementById('role').value;
    
    if (!username || !password) {
        showAlert('Please enter username and password', 'error');
        return;
    }
    
    try {
        const response = await fetch('http://localhost:3000/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password, role })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert('Registration successful! Please login.', 'success');
            // Clear form
            document.getElementById('username').value = '';
            document.getElementById('password').value = '';
        } else {
            showAlert('Registration failed: ' + data.message, 'error');
        }
    } catch (error) {
        showAlert('Error during registration: ' + error.message, 'error');
        console.error('Registration error:', error);
    }
}

function logout() {
    currentUser = null;
    document.getElementById('auth-section').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('seller-section').classList.add('hidden');
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    showAlert('Logged out successfully', 'success');
}

function showDashboard() {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    
    if (currentUser.role === 'seller') {
        document.getElementById('seller-section').classList.remove('hidden');
    } else {
        document.getElementById('seller-section').classList.add('hidden');
    }
}

function updateUserBalanceDisplay() {
    if (currentUser) {
        document.getElementById('user-balance').textContent = currentUser.balance;
    }
}

async function loadUserData() {
    if (!currentUser) return;
    
    try {
        const response = await fetch(`http://localhost:3000/api/user/${currentUser.username}`);
        if (response.ok) {
            const userData = await response.json();
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
    
    const amount = document.getElementById('credit-amount').value;
    const price = document.getElementById('credit-price').value;
    
    if (!amount || amount < 1) {
        showAlert('Please enter a valid credit amount (minimum 1)', 'error');
        return;
    }
    
    if (!price || price < 0.01) {
        showAlert('Please enter a valid price (minimum $0.01)', 'error');
        return;
    }
    
    try {
        const response = await fetch('http://localhost:3000/api/list-credit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                username: currentUser.username, 
                amount: parseFloat(amount), 
                price: parseFloat(price) 
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert('Carbon credits listed successfully! Waiting for verification...', 'success');
            document.getElementById('credit-amount').value = '';
            document.getElementById('credit-price').value = '';
            
            // Refresh user data after a short delay
            setTimeout(loadUserData, 1000);
        } else {
            showAlert('Failed to list credits: ' + data.message, 'error');
        }
    } catch (error) {
        showAlert('Error listing credits: ' + error.message, 'error');
        console.error('Error listing credits:', error);
    }
}

// Marketplace functions
async function loadMarketplace() {
    try {
        const response = await fetch('http://localhost:3000/api/marketplace');
        const listings = await response.json();
        updateMarketplaceDisplay(listings);
    } catch (error) {
        console.error('Error loading marketplace:', error);
        showAlert('Error loading marketplace', 'error');
    }
}

function updateMarketplaceDisplay(listings) {
    const container = document.getElementById('marketplace-listings');
    
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
        const response = await fetch('http://localhost:3000/api/buy-credit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                buyer: currentUser.username, 
                listingId: listingId 
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert('Purchase successful! Your balance has been updated.', 'success');
            // Refresh user data and marketplace
            setTimeout(() => {
                loadUserData();
                loadMarketplace();
            }, 1000);
        } else {
            showAlert('Purchase failed: ' + data.message, 'error');
        }
    } catch (error) {
        showAlert('Error purchasing credits: ' + error.message, 'error');
        console.error('Error purchasing credits:', error);
    }
}

// Blockchain functions
async function loadBlockchain() {
    try {
        const response = await fetch('http://localhost:3000/api/blockchain');
        const blockchain = await response.json();
        updateBlockchainDisplay(blockchain);
    } catch (error) {
        console.error('Error loading blockchain:', error);
    }
}

function updateBlockchainDisplay(chain) {
    const container = document.getElementById('blockchain-info');
    
    if (!chain || chain.length === 0) {
        container.innerHTML = '<div class="no-blocks">No blocks in the blockchain yet.</div>';
        return;
    }
    
    // Display blocks in reverse order (newest first)
    const reversedChain = [...chain].reverse();
    
    container.innerHTML = reversedChain.map(block => `
        <div class="block">
            <div class="block-header">Block #${chain.indexOf(block)} | ${block.data.type || 'Transaction'}</div>
            <div><strong>Hash:</strong> ${block.hash.substring(0, 20)}...</div>
            <div><strong>Previous Hash:</strong> ${block.previousHash.substring(0, 20)}...</div>
            <div><strong>Timestamp:</strong> ${new Date(block.timestamp).toLocaleString()}</div>
            <div><strong>Data:</strong> ${JSON.stringify(block.data, null, 2)}</div>
            <div><strong>Nonce:</strong> ${block.nonce}</div>
        </div>
    `).join('');
}

// Utility functions
function showAlert(message, type) {
    // Remove existing alerts
    const existingAlerts = document.querySelectorAll('.alert');
    existingAlerts.forEach(alert => alert.remove());
    
    const alert = document.createElement('div');
    alert.className = `alert ${type}`;
    alert.textContent = message;
    
    document.body.prepend(alert);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (alert.parentNode) {
            alert.parentNode.removeChild(alert);
        }
    }, 5000);
}

// Initialize app when page loads
window.onload = function() {
    connectWebSocket();
    
    // Add event listeners for Enter key in login form
    document.getElementById('password').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            login();
        }
    });
};