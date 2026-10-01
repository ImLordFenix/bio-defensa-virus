// admin/adminAuth.js - Secure authentication for Admin Panel

class AdminAuth {
    constructor() {
        // Pre-computed SHA-256 hash for default admin key "BioDefensaAdmin2026!"
        // Hash: 7e754a10ffc06fcfd5ce56b3e83b48154e2dd013a7c667bc9ddf0a514d0263ee
        this.expectedHash = "7e754a10ffc06fcfd5ce56b3e83b48154e2dd013a7c667bc9ddf0a514d0263ee";
        this.isAuthenticated = false;
        this.adminToken = sessionStorage.getItem('bd_admin_token') || null;
        if (this.adminToken === this.expectedHash) {
            this.isAuthenticated = true;
        }
    }

    async hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async login(username, password) {
        if (!username || !password) return { success: false, message: "Campos incompletos." };
        
        const computedHash = await this.hashPassword(password);
        if (username.toLowerCase() === "admin" && computedHash === this.expectedHash) {
            this.isAuthenticated = true;
            this.adminToken = computedHash;
            sessionStorage.setItem('bd_admin_token', computedHash);
            return { success: true };
        } else {
            return { success: false, message: "Credenciales administrativas incorrectas." };
        }
    }

    logout() {
        this.isAuthenticated = false;
        this.adminToken = null;
        sessionStorage.removeItem('bd_admin_token');
    }
}

window.adminAuth = new AdminAuth();
