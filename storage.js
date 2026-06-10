// storage.js - Wrapper for IndexedDB and LocalStorage persistence
class BioDefensaStorage {
    constructor() {
        this.dbName = 'BioDefensaDB';
        this.dbVersion = 1;
        this.db = null;
    }

    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => {
                console.error("IndexedDB error:", event.target.error);
                // Fallback to memory/localStorage if IndexedDB fails
                resolve(false);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
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
    }

    // --- Profile & Settings Helpers ---
    async getProfile() {
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
        if (!this.db) {
            localStorage.setItem('bd_profile', JSON.stringify(profile));
            return;
        }
        await this.set('profile', profile);
    }

    // --- Statistics Helpers ---
    async getStats() {
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
