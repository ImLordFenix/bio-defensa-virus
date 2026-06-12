// storage.js - Wrapper for IndexedDB and LocalStorage persistence
class BioDefensaStorage {
    constructor() {
        this.dbName = 'BioDefensaDB';
        this.dbVersion = 1;
        this.db = null;
        this.initPromise = null;
    }

    init() {
        if (this.initPromise) return this.initPromise;
        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => {
                console.error("IndexedDB error:", event.target.error);
                resolve(false);
            };

            request.onsuccess = async (event) => {
                this.db = event.target.result;
                try {
                    await this.migrateFromLocalStorage();
                } catch (e) {
                    console.error("Migration error:", e);
                }
                resolve(true);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // User Profile & Settings
                if (!db.objectStoreNames.contains('profile')) {
                    db.createObjectStore('profile', { keyPath: 'key' });
                }

                // Global Stats
                if (!db.objectStoreNames.contains('stats')) {
                    db.createObjectStore('stats', { keyPath: 'key' });
                }

                // Match History
                if (!db.objectStoreNames.contains('history')) {
                    db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
                }

                // Achievements
                if (!db.objectStoreNames.contains('achievements')) {
                    db.createObjectStore('achievements', { keyPath: 'id' });
                }
            };
        });
        return this.initPromise;
    }

    async migrateFromLocalStorage() {
        if (!this.db) return;

        // 1. Profile migration
        const localProfile = localStorage.getItem('bd_profile');
        if (localProfile) {
            try {
                const dbProfile = await new Promise((resolve, reject) => {
                    const tx = this.db.transaction('profile', 'readonly');
                    const store = tx.objectStore('profile');
                    const req = store.get('user');
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = (e) => reject(e.target.error);
                });
                if (!dbProfile) {
                    await new Promise((resolve, reject) => {
                        const tx = this.db.transaction('profile', 'readwrite');
                        const store = tx.objectStore('profile');
                        const req = store.put(JSON.parse(localProfile));
                        req.onsuccess = () => resolve(true);
                        req.onerror = (e) => reject(e.target.error);
                    });
                }
            } catch (e) {
                console.error("Profile migration failed:", e);
            }
        }

        // 2. Stats migration
        const localStats = localStorage.getItem('bd_stats');
        if (localStats) {
            try {
                const dbStats = await new Promise((resolve, reject) => {
                    const tx = this.db.transaction('stats', 'readonly');
                    const store = tx.objectStore('stats');
                    const req = store.get('stats_summary');
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = (e) => reject(e.target.error);
                });
                if (!dbStats) {
                    await new Promise((resolve, reject) => {
                        const tx = this.db.transaction('stats', 'readwrite');
                        const store = tx.objectStore('stats');
                        const req = store.put(JSON.parse(localStats));
                        req.onsuccess = () => resolve(true);
                        req.onerror = (e) => reject(e.target.error);
                    });
                }
            } catch (e) {
                console.error("Stats migration failed:", e);
            }
        }

        // 3. History migration
        const localHistory = localStorage.getItem('bd_history');
        if (localHistory) {
            try {
                const dbHistoryCount = await new Promise((resolve, reject) => {
                    const tx = this.db.transaction('history', 'readonly');
                    const store = tx.objectStore('history');
                    const req = store.count();
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = (e) => reject(e.target.error);
                });
                if (dbHistoryCount === 0) {
                    const parsedHistory = JSON.parse(localHistory);
                    const tx = this.db.transaction('history', 'readwrite');
                    const store = tx.objectStore('history');
                    for (const match of parsedHistory) {
                        store.add(match);
                    }
                }
            } catch (e) {
                console.error("History migration failed:", e);
            }
        }

        // 4. Achievements migration
        const localAchievements = localStorage.getItem('bd_achievements');
        if (localAchievements) {
            try {
                const hasDbAchs = await new Promise((resolve) => {
                    const tx = this.db.transaction('achievements', 'readonly');
                    const store = tx.objectStore('achievements');
                    const req = store.getAll();
                    req.onsuccess = () => resolve(req.result && req.result.length > 0);
                    req.onerror = () => resolve(false);
                });
                
                if (!hasDbAchs) {
                    const parsedAchs = JSON.parse(localAchievements);
                    const tx = this.db.transaction('achievements', 'readwrite');
                    const store = tx.objectStore('achievements');
                    for (const ach of parsedAchs) {
                        store.put(ach);
                    }
                }
            } catch (e) {
                console.error("Achievements migration failed:", e);
            }
        }
    }

    // --- Profile & Settings Helpers ---
    async getProfile() {
        await this.init();
        const defaultProfile = {
            key: 'user',
            nickname: 'Científico_' + Math.floor(Math.random() * 9000 + 1000),
            avatar: '👨‍🔬',
            volumeSound: 0.5,
            volumeMusic: 0.3,
            animationsEnabled: true,
            selectedTheme: 'dark'
        };

        if (!this.db) {
            const local = localStorage.getItem('bd_profile');
            return local ? JSON.parse(local) : defaultProfile;
        }

        try {
            const profile = await this.get('profile', 'user');
            if (!profile) {
                await this.set('profile', defaultProfile);
                return defaultProfile;
            }
            return profile;
        } catch (e) {
            return defaultProfile;
        }
    }

    async saveProfile(profile) {
        await this.init();
        if (!this.db) {
            localStorage.setItem('bd_profile', JSON.stringify(profile));
            return;
        }
        await this.set('profile', profile);
    }

    // --- Statistics Helpers ---
    async getStats() {
        await this.init();
        const defaultStats = {
            key: 'stats_summary',
            gamesPlayed: 0,
            gamesWon: 0,
            gamesLost: 0,
            totalPlayTime: 0, // in seconds
            winStreak: 0,
            maxWinStreak: 0,
            cardsPlayed: {},
            organsCompleted: 0
        };

        if (!this.db) {
            const local = localStorage.getItem('bd_stats');
            return local ? JSON.parse(local) : defaultStats;
        }

        try {
            const stats = await this.get('stats', 'stats_summary');
            if (!stats) {
                await this.set('stats', defaultStats);
                return defaultStats;
            }
            return stats;
        } catch (e) {
            return defaultStats;
        }
    }

    async updateStats(won, durationSeconds, cardsUsedList = []) {
        await this.init();
        const stats = await this.getStats();
        stats.gamesPlayed++;
        if (won) {
            stats.gamesWon++;
            stats.winStreak++;
            if (stats.winStreak > stats.maxWinStreak) {
                stats.maxWinStreak = stats.winStreak;
            }
        } else {
            stats.gamesLost++;
            stats.winStreak = 0;
        }
        stats.totalPlayTime += durationSeconds;

        cardsUsedList.forEach(cardType => {
            stats.cardsPlayed[cardType] = (stats.cardsPlayed[cardType] || 0) + 1;
        });

        if (!this.db) {
            localStorage.setItem('bd_stats', JSON.stringify(stats));
        } else {
            await this.set('stats', stats);
        }

        // Check achievements after updating stats
        await this.checkAchievements(stats);
    }

    // --- Match History Helpers ---
    async addMatchToHistory(match) {
        await this.init();
        // match: { date: string, playersCount: number, result: 'victory'|'defeat', duration: number, mode: string }
        if (!this.db) {
            const local = localStorage.getItem('bd_history');
            const history = local ? JSON.parse(local) : [];
            history.unshift(match);
            localStorage.setItem('bd_history', JSON.stringify(history.slice(0, 50))); // Keep last 50
            return;
        }

        return new Promise((resolve) => {
            const tx = this.db.transaction('history', 'readwrite');
            const store = tx.objectStore('history');
            store.add(match);
            tx.oncomplete = () => resolve(true);
        });
    }

    async getMatchHistory() {
        await this.init();
        if (!this.db) {
            const local = localStorage.getItem('bd_history');
            return local ? JSON.parse(local) : [];
        }

        return new Promise((resolve) => {
            const tx = this.db.transaction('history', 'readonly');
            const store = tx.objectStore('history');
            const request = store.getAll();
            request.onsuccess = () => {
                // Sort by ID descending (newest first)
                const list = request.result || [];
                list.reverse();
                resolve(list);
            };
            request.onerror = () => resolve([]);
        });
    }

    // --- Achievement Helpers ---
    async getAchievements() {
        await this.init();
        const defaultAchievements = [
            { id: 'first_win', name: 'Primera Victoria', desc: 'Gana tu primera partida contra bots o jugadores.', unlocked: false, icon: '🏆' },
            { id: 'ten_wins', name: 'Médico Residente', desc: 'Gana 10 partidas.', unlocked: false, icon: '🩺' },
            { id: 'hundred_wins', name: 'Maestro Inmunólogo', desc: 'Gana 100 partidas.', unlocked: false, icon: '🔬' },
            { id: 'perfect_organism', name: 'Organismo Perfecto', desc: 'Gana una partida con todos tus órganos inmunizados o biónicos.', unlocked: false, icon: '🛡️' },
            { id: 'speedrun', name: 'Victoria Relámpago', desc: 'Gana una partida en menos de 3 minutos.', unlocked: false, icon: '⚡' },
            { id: 'saboteur', name: 'Biólogo del Caos', desc: 'Infecta o destruye 15 órganos enemigos en una sola partida.', unlocked: false, icon: '☣️' }
        ];

        if (!this.db) {
            const local = localStorage.getItem('bd_achievements');
            return local ? JSON.parse(local) : defaultAchievements;
        }

        return new Promise((resolve) => {
            const tx = this.db.transaction('achievements', 'readonly');
            const store = tx.objectStore('achievements');
            const request = store.getAll();
            request.onsuccess = async () => {
                const list = request.result || [];
                if (list.length === 0) {
                    // Seed initial achievements
                    const writeTx = this.db.transaction('achievements', 'readwrite');
                    const writeStore = writeTx.objectStore('achievements');
                    for (const ach of defaultAchievements) {
                        writeStore.put(ach);
                    }
                    resolve(defaultAchievements);
                } else {
                    resolve(list);
                }
            };
            request.onerror = () => resolve(defaultAchievements);
        });
    }

    async checkAchievements(stats) {
        await this.init();
        const achievements = await this.getAchievements();
        let changed = false;

        const updateAch = (id) => {
            const ach = achievements.find(a => a.id === id);
            if (ach && !ach.unlocked) {
                ach.unlocked = true;
                ach.unlockDate = new Date().toLocaleDateString();
                changed = true;
                this.triggerAchievementNotification(ach);
            }
        };

        if (stats.gamesWon >= 1) updateAch('first_win');
        if (stats.gamesWon >= 10) updateAch('ten_wins');
        if (stats.gamesWon >= 100) updateAch('hundred_wins');

        if (changed) {
            if (!this.db) {
                localStorage.setItem('bd_achievements', JSON.stringify(achievements));
            } else {
                const tx = this.db.transaction('achievements', 'readwrite');
                const store = tx.objectStore('achievements');
                for (const ach of achievements) {
                    store.put(ach);
                }
            }
        }
    }

    triggerAchievementNotification(ach) {
        const toast = document.createElement('div');
        toast.className = 'achievement-toast';
        toast.innerHTML = `
            <div class="ach-icon">${ach.icon}</div>
            <div class="ach-info">
                <h4>Logro Desbloqueado!</h4>
                <p>${ach.name}</p>
            </div>
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
        }, 4000);
    }

    getVictoryBadge(wins) {
        if (wins >= 50) return { name: 'Plaquita de Diamante 💎', short: '💎 Diamante', emoji: '💎', color: '#00e1ff' };
        if (wins >= 25) return { name: 'Plaquita de Platino 💿', short: '💿 Platino', emoji: '💿', color: '#e5e4e2' };
        if (wins >= 10) return { name: 'Plaquita de Oro 🥇', short: '🥇 Oro', emoji: '🥇', color: '#ffd700' };
        if (wins >= 5) return { name: 'Plaquita de Plata 🥈', short: '🥈 Plata', emoji: '🥈', color: '#c0c0c0' };
        if (wins >= 1) return { name: 'Plaquita de Bronce 🥉', short: '🥉 Bronce', emoji: '🥉', color: '#cd7f32' };
        return null;
    }

    // --- Core IDB Wrappers ---
    get(storeName, key) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    set(storeName, value) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.put(value);
            request.onsuccess = () => resolve(true);
            request.onerror = (e) => reject(e.target.error);
        });
    }
}

const dbInstance = new BioDefensaStorage();
dbInstance.init().then(() => console.log("Bio-Defensa DB initialized"));
