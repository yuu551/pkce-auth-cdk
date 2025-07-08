// PKCE Authentication Implementation
class PKCEAuth {
    constructor(config) {
        this.config = config;
        this.codeVerifier = null;
        this.tokens = null;
        this.debugSteps = [];
    }

    // Base64 URL エンコード
    base64URLEncode(buffer) {
        return btoa(String.fromCharCode.apply(null, new Uint8Array(buffer)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    // ランダム文字列生成（Code Verifier用）
    generateRandomString() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return this.base64URLEncode(array);
    }

    // SHA256ハッシュ生成（Code Challenge用）
    async generateCodeChallenge(codeVerifier) {
        const encoder = new TextEncoder();
        const data = encoder.encode(codeVerifier);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return this.base64URLEncode(digest);
    }

    // 認証URLの生成
    async getAuthURL() {
        this.codeVerifier = this.generateRandomString();
        const codeChallenge = await this.generateCodeChallenge(this.codeVerifier);
        
        // Code Verifierをセッションストレージに保存
        sessionStorage.setItem('pkce_code_verifier', this.codeVerifier);
        
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.config.clientId,
            redirect_uri: this.config.redirectUri,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            scope: 'openid profile email'
        });
        
        this.addDebugStep('認証URL生成', { codeChallenge, params: params.toString() });
        
        return `${this.config.cognitoDomain}/oauth2/authorize?${params}`;
    }

    // 認証コードからトークンを取得
    async getTokens(authCode) {
        const codeVerifier = sessionStorage.getItem('pkce_code_verifier');
        if (!codeVerifier) {
            throw new Error('Code verifier not found');
        }
        
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: this.config.clientId,
            code: authCode,
            redirect_uri: this.config.redirectUri,
            code_verifier: codeVerifier
        });
        
        this.addDebugStep('トークン取得リクエスト', { authCode: authCode.substring(0, 10) + '...' });
        
        const response = await fetch(`${this.config.cognitoDomain}/oauth2/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Token request failed: ${error}`);
        }
        
        const tokens = await response.json();
        this.tokens = tokens;
        
        // トークンをローカルストレージに保存
        localStorage.setItem('id_token', tokens.id_token);
        localStorage.setItem('access_token', tokens.access_token);
        if (tokens.refresh_token) {
            localStorage.setItem('refresh_token', tokens.refresh_token);
        }
        
        // Code Verifierをクリア
        sessionStorage.removeItem('pkce_code_verifier');
        
        this.addDebugStep('トークン取得成功', { 
            tokenTypes: Object.keys(tokens),
            expiresIn: tokens.expires_in 
        });
        
        return tokens;
    }

    // トークンのリフレッシュ
    async refreshTokens() {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) {
            throw new Error('No refresh token available');
        }
        
        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: this.config.clientId,
            refresh_token: refreshToken
        });
        
        const response = await fetch(`${this.config.cognitoDomain}/oauth2/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params
        });
        
        if (!response.ok) {
            throw new Error('Token refresh failed');
        }
        
        const tokens = await response.json();
        
        // 新しいトークンを保存
        localStorage.setItem('id_token', tokens.id_token);
        localStorage.setItem('access_token', tokens.access_token);
        
        this.addDebugStep('トークンリフレッシュ成功', { expiresIn: tokens.expires_in });
        
        return tokens;
    }

    // ユーザー情報の取得
    async getUserInfo() {
        const accessToken = localStorage.getItem('access_token');
        if (!accessToken) {
            throw new Error('No access token available');
        }
        
        const response = await fetch(`${this.config.cognitoDomain}/oauth2/userInfo`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to get user info');
        }
        
        return response.json();
    }

    // ログアウト
    logout() {
        localStorage.removeItem('id_token');
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        
        const params = new URLSearchParams({
            client_id: this.config.clientId,
            logout_uri: this.config.logoutUri
        });
        
        window.location.href = `${this.config.cognitoDomain}/logout?${params}`;
    }

    // デバッグ情報追加
    addDebugStep(step, details) {
        this.debugSteps.push({
            timestamp: new Date().toISOString(),
            step,
            details
        });
    }

    // トークンのデコード
    decodeToken(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) {
            return null;
        }
    }
}

// API Client
class APIClient {
    constructor(apiEndpoint) {
        this.apiEndpoint = apiEndpoint;
    }

    async sendCommand(command) {
        const accessToken = localStorage.getItem('access_token');
        if (!accessToken) {
            throw new Error('No access token available');
        }

        const response = await fetch(`${this.apiEndpoint}/command`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(command)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`API request failed: ${error}`);
        }

        return response.json();
    }
}

// アプリケーション初期化
document.addEventListener('DOMContentLoaded', async () => {
    // 設定（デプロイ時に実際の値に変更してください）
    const config = {
        clientId: 'YOUR_COGNITO_CLIENT_ID',
        cognitoDomain: 'https://YOUR_COGNITO_DOMAIN.auth.REGION.amazoncognito.com',
        redirectUri: window.location.origin + '/callback',
        logoutUri: window.location.origin,
        apiEndpoint: 'https://YOUR_API_GATEWAY_ID.execute-api.REGION.amazonaws.com/prod/'
    };

    const auth = new PKCEAuth(config);
    const api = new APIClient(config.apiEndpoint);

    // UI要素
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    const loginSection = document.getElementById('login-section');
    const appSection = document.getElementById('app-section');
    const errorSection = document.getElementById('error-section');
    const userEmail = document.getElementById('user-email');
    const loginButton = document.getElementById('login-button');
    const logoutButton = document.getElementById('logout-button');
    const plcForm = document.getElementById('plc-form');
    const responseSection = document.getElementById('response-section');
    const responseContent = document.getElementById('response-content');
    const errorMessage = document.getElementById('error-message');
    const retryButton = document.getElementById('retry-button');
    
    // デバッグ要素
    const toggleDebugButton = document.getElementById('toggle-debug');
    const debugInfo = document.getElementById('debug-info');
    const authFlowSteps = document.getElementById('auth-flow-steps');
    const configInfo = document.getElementById('config-info');
    const tokenInfo = document.getElementById('token-info');

    // デバッグ情報の表示
    function updateDebugInfo() {
        // 認証フロー
        authFlowSteps.innerHTML = auth.debugSteps.map(step => 
            `<li>${step.timestamp}: ${step.step}<br><small>${JSON.stringify(step.details)}</small></li>`
        ).join('');
        
        // 設定情報
        configInfo.textContent = JSON.stringify(config, null, 2);
        
        // トークン情報
        const idToken = localStorage.getItem('id_token');
        const accessToken = localStorage.getItem('access_token');
        
        const tokenData = {
            hasIdToken: !!idToken,
            hasAccessToken: !!accessToken,
            idTokenClaims: idToken ? auth.decodeToken(idToken) : null,
            accessTokenClaims: accessToken ? auth.decodeToken(accessToken) : null
        };
        
        tokenInfo.textContent = JSON.stringify(tokenData, null, 2);
    }

    // 認証状態の確認
    async function checkAuthStatus() {
        try {
            const accessToken = localStorage.getItem('access_token');
            if (!accessToken) {
                showLoginRequired();
                return;
            }

            // ユーザー情報を取得してトークンの有効性を確認
            const userInfo = await auth.getUserInfo();
            showAuthenticated(userInfo);
        } catch (error) {
            console.error('Auth check failed:', error);
            // トークンが無効な場合はリフレッシュを試みる
            try {
                await auth.refreshTokens();
                const userInfo = await auth.getUserInfo();
                showAuthenticated(userInfo);
            } catch (refreshError) {
                console.error('Token refresh failed:', refreshError);
                showLoginRequired();
            }
        }
    }

    // ログインが必要な状態の表示
    function showLoginRequired() {
        statusIndicator.className = 'status-indicator status-unauthenticated';
        statusText.textContent = '未認証';
        loginSection.style.display = 'block';
        appSection.style.display = 'none';
        errorSection.style.display = 'none';
        updateDebugInfo();
    }

    // 認証済み状態の表示
    function showAuthenticated(userInfo) {
        statusIndicator.className = 'status-indicator status-authenticated';
        statusText.textContent = '認証済み';
        loginSection.style.display = 'none';
        appSection.style.display = 'block';
        errorSection.style.display = 'none';
        userEmail.textContent = userInfo.email || 'Unknown';
        updateDebugInfo();
    }

    // エラー表示
    function showError(message) {
        errorSection.style.display = 'block';
        errorMessage.textContent = message;
        loginSection.style.display = 'none';
        appSection.style.display = 'none';
    }

    // コールバック処理
    async function handleCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const authCode = urlParams.get('code');
        
        if (authCode) {
            try {
                statusText.textContent = '認証処理中...';
                await auth.getTokens(authCode);
                // コールバックURLからクエリパラメータを削除
                window.history.replaceState({}, document.title, window.location.pathname);
                await checkAuthStatus();
            } catch (error) {
                console.error('Token exchange failed:', error);
                showError('認証に失敗しました: ' + error.message);
            }
        }
    }

    // イベントリスナー
    loginButton.addEventListener('click', async () => {
        const authURL = await auth.getAuthURL();
        window.location.href = authURL;
    });

    logoutButton.addEventListener('click', () => {
        auth.logout();
    });

    plcForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(plcForm);
        const command = {
            command: formData.get('command'),
            area: formData.get('area'),
            address: formData.get('address'),
            value: formData.get('value')
        };

        try {
            responseSection.style.display = 'none';
            const result = await api.sendCommand(command);
            responseContent.textContent = JSON.stringify(result, null, 2);
            responseSection.style.display = 'block';
        } catch (error) {
            alert('コマンド送信に失敗しました: ' + error.message);
        }
    });

    retryButton.addEventListener('click', () => {
        window.location.reload();
    });

    toggleDebugButton.addEventListener('click', () => {
        debugInfo.style.display = debugInfo.style.display === 'none' ? 'block' : 'none';
        updateDebugInfo();
    });

    // 初期化
    await handleCallback();
    if (!window.location.search.includes('code=')) {
        await checkAuthStatus();
    }
});