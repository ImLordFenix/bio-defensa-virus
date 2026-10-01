// analytics/leaderboard.js - Real Leaderboards and Honor Roll Manager

class LeaderboardManager {
    constructor() {
        this.filter = 'GLOBAL'; // GLOBAL, AMIGOS, SALA, PERSONAL
        this.metric = 'VICTORIAS'; // VICTORIAS, NIVELES, PARTIDAS
    }

    async getLeaderboardData(filter = 'GLOBAL', metric = 'VICTORIAS') {
        this.filter = filter;
        this.metric = metric;

        let data = [];
        if (typeof firebase !== 'undefined' && firebase.database) {
            try {
                const snap = await firebase.database().ref('leaderboards').once('value');
                if (snap.exists()) {
                    const obj = snap.val();
                    data = Object.values(obj);
                }
            } catch (e) {
                console.error("Leaderboard fetch error:", e);
            }
        }

        // Include current local player if not in database yet
        const profile = window.currentProfile;
        const stats = (typeof dbInstance !== 'undefined') ? await dbInstance.getStats() : null;
        if (profile && stats) {
            const myPeerId = sessionStorage.getItem('bd_peer_id');
            const exists = data.some(item => item.nickname === profile.nickname || item.peerId === myPeerId);
            if (!exists) {
                data.push({
                    peerId: myPeerId,
                    nickname: profile.nickname || 'Investigador',
                    avatar: profile.avatar || '👨‍⚕️',
                    wins: stats.gamesWon || 0,
                    games: stats.gamesPlayed || 0,
                    level: profile.level || 1,
                    xp: profile.xp || 0
                });
            }
        }

        // Filter AMIGOS
        if (filter === 'AMIGOS' && window.friendsManager) {
            const myFriends = window.friendsManager.friendsList || [];
            const friendNames = new Set(myFriends.map(f => f.nickname));
            if (profile) friendNames.add(profile.nickname);
            data = data.filter(item => friendNames.has(item.nickname));
        } else if (filter === 'PERSONAL' && profile) {
            data = data.filter(item => item.nickname === profile.nickname);
        }

        // Sort according to metric
        if (metric === 'VICTORIAS') data.sort((a, b) => (b.wins || 0) - (a.wins || 0));
        else if (metric === 'NIVELES' || metric === 'XP') data.sort((a, b) => (b.level || 0) - (a.level || 0));
        else if (metric === 'PARTIDAS') data.sort((a, b) => (b.games || 0) - (a.games || 0));

        return data;
    }

    async submitScore(profile, stats) {
        if (!profile || typeof firebase === 'undefined' || !firebase.database) return;
        let peerId = sessionStorage.getItem('bd_peer_id');
        if (!peerId) {
            peerId = Math.random().toString(36).substring(2, 15);
            sessionStorage.setItem('bd_peer_id', peerId);
        }

        const badgeObj = (typeof dbInstance !== 'undefined') ? dbInstance.getVictoryBadge(stats.gamesWon || 0) : null;
        const badgeName = badgeObj ? badgeObj.name : 'Investigador';

        await firebase.database().ref(`leaderboards/${peerId}`).set({
            peerId: peerId,
            nickname: profile.nickname || 'Investigador',
            avatar: profile.avatar || '👨‍⚕️',
            wins: stats.gamesWon || 0,
            games: stats.gamesPlayed || 0,
            level: profile.level || 1,
            xp: profile.xp || 0,
            badge: badgeName,
            lastUpdated: firebase.database.ServerValue.TIMESTAMP
        });
    }
}

window.leaderboardManager = new LeaderboardManager();
