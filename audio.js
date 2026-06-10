// audio.js - Synthesized Sound Effects and Creepy Looping Soundtrack for Bio-Defensa

let audioCtx = null;
let bgMusicInterval = null;
let currentNoteIndex = 0;
let isMusicPlaying = false;

// --- Background Music via Local MP3 ---
let bgMusicPlayer = null;

function initBgMusic() {
    if (!bgMusicPlayer) {
        bgMusicPlayer = new Audio('music.mp3');
        bgMusicPlayer.loop = true;
    }
}

function startBackgroundMusic() {
    if (isMusicPlaying) return;
    initBgMusic();
    
    let vol = localStorage.getItem('bd_vol_music') !== null ? parseFloat(localStorage.getItem('bd_vol_music')) : 0.3;
    bgMusicPlayer.volume = vol;
    
    let playPromise = bgMusicPlayer.play();
    if (playPromise !== undefined) {
        playPromise.then(() => {
            isMusicPlaying = true;
        }).catch(e => {
            console.warn("Background music autoplay blocked", e);
            isMusicPlaying = false;
        });
    } else {
        isMusicPlaying = true;
    }
}

function stopBackgroundMusic() {
    isMusicPlaying = false;
    if (bgMusicPlayer) {
        bgMusicPlayer.pause();
    }
}

function playSound(type) {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (!audioCtx) return;

        const volume = localStorage.getItem('bd_vol_sound') !== null ? parseFloat(localStorage.getItem('bd_vol_sound')) : 0.5;
        if (volume === 0 || isNaN(volume)) return;

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(volume * 0.4, audioCtx.currentTime + 0.05);

        if (type === 'play_card') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.15);
        } else if (type === 'cure') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(300, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.3);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.35);
        } else if (type === 'infect') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(250, audioCtx.currentTime);
            osc.frequency.linearRampToValueAtTime(80, audioCtx.currentTime + 0.4);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.45);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.45);
        } else if (type === 'error') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(150, audioCtx.currentTime);
            osc.frequency.setValueAtTime(100, audioCtx.currentTime + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.35);
        } else if (type === 'win') {
            const now = audioCtx.currentTime;
            const freqs = [523.25, 659.25, 783.99, 1046.50];
            freqs.forEach((f, i) => {
                const o = audioCtx.createOscillator();
                const g = audioCtx.createGain();
                o.connect(g);
                g.connect(audioCtx.destination);
                o.type = 'sine';
                o.frequency.setValueAtTime(f, now + i * 0.1);
                g.gain.setValueAtTime(0, now + i * 0.1);
                g.gain.linearRampToValueAtTime(volume * 0.3, now + i * 0.1 + 0.05);
                g.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.3);
                o.start(now + i * 0.1);
                o.stop(now + i * 0.1 + 0.35);
            });
        }
    } catch (e) {
        console.warn("Sound playback failed", e);
    }
}

// Global user interaction listener to bypass browser autoplay blocks
// Uses capturing phase (capture: true) so stopPropagation() from other buttons cannot block this activation.
function unlockAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    initBgMusic();
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    const musicVol = localStorage.getItem('bd_vol_music') !== null ? parseFloat(localStorage.getItem('bd_vol_music')) : 0.3;
    if (musicVol > 0) {
        startBackgroundMusic();
    }
    
    // Clean up all gesture unlock listeners
    window.removeEventListener('click', unlockAudio, { capture: true });
    window.removeEventListener('touchstart', unlockAudio, { capture: true });
    window.removeEventListener('keydown', unlockAudio, { capture: true });
}

window.addEventListener('click', unlockAudio, { capture: true });
window.addEventListener('touchstart', unlockAudio, { capture: true });
window.addEventListener('keydown', unlockAudio, { capture: true });
