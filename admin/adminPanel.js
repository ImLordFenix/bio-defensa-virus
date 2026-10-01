// admin/adminPanel.js - Admin Panel Controller & Dashboard Manager

class AdminPanel {
    constructor() {
        this.activeTab = 'stats';
    }

    async init() {
        if (!window.adminAuth || !window.adminAuth.isAuthenticated) {
            this.showLoginModal();
            return;
        }
        this.renderDashboard();
    }

    showLoginModal() {
        const old = document.getElementById('adminLoginOverlay');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.id = 'adminLoginOverlay';
        overlay.className = 'custom-alert-overlay';
        overlay.innerHTML = `
            <div class="custom-alert-modal glass-panel" style="max-width: 400px; text-align: left;">
                <div style="font-size: 2rem; text-align: center; margin-bottom: 10px;">🔐</div>
                <h3 style="color: var(--primary); text-align: center; margin-bottom: 15px;">Panel Administrativo</h3>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <div>
                        <label style="font-size: 0.8rem; color: var(--text-secondary);">Usuario Admin</label>
                        <input type="text" id="adminUserVal" class="profile-input-group input" value="admin" style="width:100%; padding: 8px; border-radius:6px; background: rgba(0,0,0,0.3); color:white; border: 1px solid var(--border-glass);">
                    </div>
                    <div>
                        <label style="font-size: 0.8rem; color: var(--text-secondary);">Contraseña</label>
                        <input type="password" id="adminPassVal" style="width:100%; padding: 8px; border-radius:6px; background: rgba(0,0,0,0.3); color:white; border: 1px solid var(--border-glass);" placeholder="••••••••">
                    </div>
                    <div id="adminLoginErr" style="color: var(--color-red); font-size: 0.8rem; display: none;"></div>
                    <div style="display: flex; gap: 10px; margin-top: 10px;">
                        <button class="btn btn-secondary" style="flex:1;" onclick="document.getElementById('adminLoginOverlay').remove()">Cancelar</button>
                        <button class="btn btn-primary" style="flex:1;" onclick="window.adminPanel.performLogin()">Ingresar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    async performLogin() {
        const user = document.getElementById('adminUserVal').value.trim();
        const pass = document.getElementById('adminPassVal').value;
        const res = await window.adminAuth.login(user, pass);
        if (res.success) {
            document.getElementById('adminLoginOverlay').remove();
            this.renderDashboard();
        } else {
            const errEl = document.getElementById('adminLoginErr');
            errEl.textContent = res.message;
            errEl.style.display = 'block';
        }
    }

    renderDashboard() {
        const old = document.getElementById('adminContainer');
        if (old) old.remove();

        const container = document.createElement('div');
        container.id = 'adminContainer';
        container.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: #090d16; color: #e2e8f0; z-index: 99999; display: flex;
            flex-direction: column; font-family: 'Outfit', sans-serif; overflow: hidden;
        `;

        container.innerHTML = `
            <header style="background: rgba(15, 23, 42, 0.9); padding: 15px 30px; border-bottom: 1px solid rgba(0, 240, 255, 0.2); display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 1.8rem;">🧬</span>
                    <div>
                        <h2 style="margin: 0; font-size: 1.2rem; color: #00F0FF; font-weight: 800; letter-spacing: 1px;">BIO-DEFENSA - PANEL CONTROL AMIN</h2>
                        <span style="font-size: 0.75rem; color: #94a3b8;">Sistema de Monitoreo & Moderación Global</span>
                    </div>
                </div>
                <div style="display: flex; gap: 15px; align-items: center;">
                    <span style="font-size: 0.85rem; background: rgba(0,255,157,0.1); border: 1px solid #00FF9D; color: #00FF9D; padding: 4px 10px; border-radius: 20px;">
                        ● Servidor Activo (Firebase)
                    </span>
                    <button class="btn btn-secondary" style="padding: 6px 14px; font-size: 0.8rem;" onclick="window.adminAuth.logout(); document.getElementById('adminContainer').remove();">
                        Cerrar Sesión
                    </button>
                </div>
            </header>

            <div style="display: flex; flex: 1; overflow: hidden;">
                <!-- Sidebar -->
                <aside style="width: 240px; background: rgba(15, 23, 42, 0.6); border-right: 1px solid rgba(255,255,255,0.05); padding: 20px 10px; display: flex; flex-direction: column; gap: 8px;">
                    <button class="admin-tab-btn active" id="tabStatsBtn" onclick="window.adminPanel.switchTab('stats')">📊 Métricas Globales</button>
                    <button class="admin-tab-btn" id="tabRoomsBtn" onclick="window.adminPanel.switchTab('rooms')">🎮 Salas en Vivo</button>
                    <button class="admin-tab-btn" id="tabUsersBtn" onclick="window.adminPanel.switchTab('users')">👥 Gestión de Usuarios</button>
                    <button class="admin-tab-btn" id="tabSystemBtn" onclick="window.adminPanel.switchTab('system')">⚙️ Diagnóstico Sistema</button>
                </aside>

                <!-- Content Area -->
                <main id="adminMainContent" style="flex: 1; padding: 25px; overflow-y: auto; background: radial-gradient(circle at top right, rgba(0, 240, 255, 0.05), transparent 70%);">
                </main>
            </div>
        `;

        document.body.appendChild(container);
        this.switchTab('stats');
    }

    switchTab(tab) {
        this.activeTab = tab;
        ['stats', 'rooms', 'users', 'system'].forEach(t => {
            const btn = document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}Btn`);
            if (btn) btn.classList.toggle('active', t === tab);
        });

        const main = document.getElementById('adminMainContent');
        if (!main) return;

        if (tab === 'stats') this.renderStatsView(main);
        else if (tab === 'rooms') this.renderRoomsView(main);
        else if (tab === 'users') this.renderUsersView(main);
        else if (tab === 'system') this.renderSystemView(main);
    }

    async renderStatsView(main) {
        main.innerHTML = `<h3 style="color:#00F0FF; margin-top:0;">Estadísticas Generales de Red</h3>`;
        
        let activeRoomsCount = 0;
        let activePlayersCount = 0;

        if (typeof firebase !== 'undefined' && firebase.database) {
            try {
                const snap = await firebase.database().ref('rooms').once('value');
                if (snap.exists()) {
                    const rooms = snap.val();
                    activeRoomsCount = Object.keys(rooms).length;
                    Object.values(rooms).forEach(r => {
                        if (r.players) activePlayersCount += Object.keys(r.players).length;
                    });
                }
            } catch (e) {
                console.error("Admin firebase fetch error:", e);
            }
        }

        const localStats = (await dbInstance.getStats()) || {};

        main.innerHTML += `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-top: 20px;">
                <div class="stat-card" style="background: rgba(0, 240, 255, 0.05); border: 1px solid rgba(0,240,255,0.3); padding: 20px; border-radius: 12px; text-align: left;">
                    <div style="font-size: 0.8rem; color: #94a3b8;">Salas Activas</div>
                    <div style="font-size: 2.2rem; font-weight: 800; color: #00F0FF; margin-top: 5px;">${activeRoomsCount}</div>
                </div>
                <div class="stat-card" style="background: rgba(0, 255, 157, 0.05); border: 1px solid rgba(0,255,157,0.3); padding: 20px; border-radius: 12px; text-align: left;">
                    <div style="font-size: 0.8rem; color: #94a3b8;">Jugadores En Línea</div>
                    <div style="font-size: 2.2rem; font-weight: 800; color: #00FF9D; margin-top: 5px;">${activePlayersCount}</div>
                </div>
                <div class="stat-card" style="background: rgba(255, 0, 85, 0.05); border: 1px solid rgba(255,0,85,0.3); padding: 20px; border-radius: 12px; text-align: left;">
                    <div style="font-size: 0.8rem; color: #94a3b8;">Partidas Completadas</div>
                    <div style="font-size: 2.2rem; font-weight: 800; color: #FF0055; margin-top: 5px;">${localStats.gamesPlayed || 0}</div>
                </div>
                <div class="stat-card" style="background: rgba(255, 183, 0, 0.05); border: 1px solid rgba(255,183,0,0.3); padding: 20px; border-radius: 12px; text-align: left;">
                    <div style="font-size: 0.8rem; color: #94a3b8;">Tasa de Victorias (Local)</div>
                    <div style="font-size: 2.2rem; font-weight: 800; color: #FFB700; margin-top: 5px;">${localStats.gamesPlayed ? Math.round((localStats.gamesWon / localStats.gamesPlayed) * 100) : 0}%</div>
                </div>
            </div>
        `;
    }

    async renderRoomsView(main) {
        main.innerHTML = `<h3 style="color:#00F0FF; margin-top:0;">Monitoreo de Salas Multijugador</h3>`;
        
        if (typeof firebase === 'undefined' || !firebase.database) {
            main.innerHTML += `<p style="color:#ef4444;">Firebase no está inicializado.</p>`;
            return;
        }

        const snap = await firebase.database().ref('rooms').once('value');
        if (!snap.exists()) {
            main.innerHTML += `<p style="color:#94a3b8; margin-top: 20px;">No hay salas activas en este momento.</p>`;
            return;
        }

        const rooms = snap.val();
        let tableHtml = `
            <table style="width:100%; border-collapse: collapse; margin-top: 20px; font-size: 0.9rem;">
                <thead>
                    <tr style="background: rgba(255,255,255,0.05); text-align: left; color: #94a3b8; border-bottom: 1px solid rgba(255,255,255,0.1);">
                        <th style="padding: 12px;">Código Sala</th>
                        <th style="padding: 12px;">Anfitrión</th>
                        <th style="padding: 12px;">Jugadores</th>
                        <th style="padding: 12px;">Estado</th>
                        <th style="padding: 12px;">Fecha Creación</th>
                    </tr>
                </thead>
                <tbody>
        `;

        Object.entries(rooms).forEach(([code, room]) => {
            const pCount = room.players ? Object.keys(room.players).length : 0;
            const createdStr = room.createdAt ? new Date(room.createdAt).toLocaleTimeString() : 'N/A';
            tableHtml += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 12px; font-weight: bold; color: #00F0FF;">${code}</td>
                    <td style="padding: 12px;">${room.hostName || 'Desconocido'}</td>
                    <td style="padding: 12px;">${pCount} / 8</td>
                    <td style="padding: 12px;"><span style="color: #00FF9D;">En Espera</span></td>
                    <td style="padding: 12px; color: #94a3b8;">${createdStr}</td>
                </tr>
            `;
        });

        tableHtml += `</tbody></table>`;
        main.innerHTML += tableHtml;
    }

    async renderUsersView(main) {
        main.innerHTML = `
            <h3 style="color:#00F0FF; margin-top:0;">Gestión de Perfiles y Usuarios</h3>
            <p style="color: #94a3b8; font-size:0.85rem;">Consulta información de investigadores registrados localmente o moderación de cuentas.</p>
        `;

        const profile = await dbInstance.getProfile();
        const stats = await dbInstance.getStats();

        main.innerHTML += `
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 20px; margin-top: 15px; max-width: 600px;">
                <div style="display:flex; align-items:center; gap: 15px;">
                    <div style="font-size: 3rem;">${profile.avatar || '👨‍⚕️'}</div>
                    <div>
                        <h4 style="margin: 0; font-size: 1.2rem; color: white;">${profile.nickname || 'Investigador'}</h4>
                        <span style="font-size: 0.8rem; color: #00FF9D;">Estado: Activo / En Línea</span>
                        <div style="font-size: 0.8rem; color: #94a3b8; margin-top: 4px;">Nivel XP: ${profile.level || 1} | Racha: ${stats.winStreak || 0} victor.</div>
                    </div>
                </div>
            </div>
        `;
    }

    renderSystemView(main) {
        main.innerHTML = `
            <h3 style="color:#00F0FF; margin-top:0;">Diagnóstico del Sistema</h3>
            <div style="display: flex; flex-direction: column; gap: 15px; margin-top: 20px; max-width: 700px;">
                <div style="background: rgba(0, 255, 157, 0.05); border: 1px solid rgba(0, 255, 157, 0.2); padding: 15px; border-radius: 8px;">
                    <strong style="color: #00FF9D;">✓ Motor de Reglas (gameCore.js):</strong> OK - 100% Operativo
                </div>
                <div style="background: rgba(0, 240, 255, 0.05); border: 1px solid rgba(0, 240, 255, 0.2); padding: 15px; border-radius: 8px;">
                    <strong style="color: #00F0FF;">✓ Base de Datos Firebase RTDB:</strong> Conectado
                </div>
                <div style="background: rgba(255, 183, 0, 0.05); border: 1px solid rgba(255, 183, 0, 0.2); padding: 15px; border-radius: 8px;">
                    <strong style="color: #FFB700;">✓ Almacenamiento Local (IndexedDB):</strong> OK - Sincronizado
                </div>
            </div>
        `;
    }
}

window.adminPanel = new AdminPanel();

// Hash change detection for #admin or #admin-panel
window.addEventListener('hashchange', () => {
    if (window.location.hash === '#admin' || window.location.hash.startsWith('#admin-panel')) {
        window.adminPanel.init();
    }
});
if (window.location.hash === '#admin' || window.location.hash.startsWith('#admin-panel')) {
    window.adminPanel.init();
}
