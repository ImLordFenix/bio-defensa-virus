// admin/adminAuth.js - Secure authentication for Admin Panel

class AdminAuth {
    constructor() {
        // Pre-computed SHA-256 hash for admin key "BioDefensaAdmin2026!"
        // Hash: b8c9718f331b85ee71548b714de150f4bb56aad936109f2f3800abc7b35380c5
        this.expectedHash = "b8c9718f331b85ee71548b714de150f4bb56aad936109f2f3800abc7b35380c5";
        this.isAuthenticated = false;
        this.adminToken = sessionStorage.getItem('bd_admin_token') || null;
        if (this.adminToken === this.expectedHash) {
            this.isAuthenticated = true;
        }
    }

    async hashPassword(password) {
        if (!window.crypto || !window.crypto.subtle) {
            // Fallback for unsecure HTTP contexts where crypto.subtle is disabled by browser security policies
            return password === "BioDefensaAdmin2026!" ? this.expectedHash : "invalid";
        }
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async login(username, password) {
        const cleanUser = (username || "").trim().toLowerCase();
        const cleanPass = (password || "").trim();

        if (!cleanUser || !cleanPass) return { success: false, message: "Campos incompletos." };
        
        // Direct matching or hashed matching fallback
        const isDirectMatch = (cleanUser === "admin" && cleanPass === "BioDefensaAdmin2026!");
        const computedHash = await this.hashPassword(cleanPass);
        const isHashMatch = (cleanUser === "admin" && computedHash === this.expectedHash);

        if (isDirectMatch || isHashMatch) {
            this.isAuthenticated = true;
            this.adminToken = this.expectedHash;
            sessionStorage.setItem('bd_admin_token', this.expectedHash);
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
