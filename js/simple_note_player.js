// File: /midi2text/js/simple_note_player.js (Fixed)

const SimpleNotePlayer = (() => {
    let audioCtx = null;
    let activeOscillators = [];
    let worker = null;
    
    let isPlaying = false;
    let isPaused = false;

    const NOTE_TO_MIDI = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

    function initWorker() {
        if (!worker) {
            worker = new Worker('js/player_worker.js');
            worker.onmessage = handleWorkerMessage;
        }
    }

    function handleWorkerMessage(e) {
        const { type, note, progress } = e.data;
        switch (type) {
            case 'playNote':
                if (window.lastPlaybackCallbacks.onNoteOn) {
                    window.lastPlaybackCallbacks.onNoteOn(note.instrument, note.trackName, note.noteName);
                }
                setTimeout(() => {
                    if (window.lastPlaybackCallbacks.onNoteOff) {
                         window.lastPlaybackCallbacks.onNoteOff(note.instrument, note.trackName, note.noteName);
                    }
                }, note.durationMs);
                
                const startTime = audioCtx.currentTime;
                playNote(note.frequency, startTime, note.durationMs / 1000.0, note.waveform);
                break;
            
            case 'progressUpdate':
                if (window.lastPlaybackCallbacks.onProgressUpdate) {
                    window.lastPlaybackCallbacks.onProgressUpdate(progress);
                }
                break;

            case 'playbackEnded':
                stop(true);
                break;
        }
    }

    function noteToMidi(noteName) {
        const match = noteName.match(/^([A-G]#?)(-?[0-9])$/);
        if (!match) return null;
        const key = match[1];
        const octave = parseInt(match[2], 10);
        return 12 * (octave + 1) + NOTE_TO_MIDI[key];
    }

    function midiToFreq(midi) {
        if (midi === null) return 0;
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    async function ensureAudioContext() {
        if (!audioCtx) {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) { console.error("Web Audio API is not supported in this browser.", e); }
        }
        if (audioCtx.state === 'suspended') { await audioCtx.resume(); }
    }

    function playNote(frequency, startTime, duration, waveform = 'triangle', volume = 0.2) {
        if (!audioCtx || frequency === 0) return;
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.frequency.value = frequency;
        oscillator.type = waveform; 
        gainNode.gain.value = 0;
        const attackTime = 0.01;
        const releaseTime = 0.1;
        const sustainStartTime = startTime + attackTime;
        const releaseStartTime = startTime + duration - releaseTime;
        gainNode.gain.linearRampToValueAtTime(volume, sustainStartTime);
        if (releaseStartTime > sustainStartTime) {
            gainNode.gain.setValueAtTime(volume, releaseStartTime);
            gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
        } else {
            gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
        }
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start(startTime);
        oscillator.stop(startTime + duration + 0.1);
        activeOscillators.push({ oscillator, gainNode });
        oscillator.onended = () => {
            activeOscillators = activeOscillators.filter(o => o.oscillator !== oscillator);
        };
    }

    function silenceAllNotes() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        activeOscillators.forEach(({ gainNode }) => {
            gainNode.gain.cancelScheduledValues(now);
            gainNode.gain.linearRampToValueAtTime(0, now + 0.1);
        });
        activeOscillators = [];
    }
    
    function stop(isNaturalEnd = false) {
        if (worker) {
            worker.postMessage({ command: 'stop' });
        }
        isPlaying = false;
        isPaused = false;
        silenceAllNotes();
        if (isNaturalEnd && window.lastPlaybackCallbacks && typeof window.lastPlaybackCallbacks.onPlaybackEnd === 'function') {
            window.lastPlaybackCallbacks.onPlaybackEnd();
        }
    }

    async function play(tracksData, callbacks, initialActiveTrackIds = new Set()) {
        await ensureAudioContext();
        if (!audioCtx) {
            alert("无法初始化音频播放器。");
            return;
        }
        initWorker();
        stop();
        window.lastPlaybackCallbacks = callbacks;
        
        let rawNotes = [];
        let totalDurationMs = 0;
        
        tracksData.forEach(track => {
            let playheadTimeMs = 0;
            const events = track.notesString.split(' ').filter(s => s);
            events.forEach(event => {
                const parts = event.split('/');
                const durationMs = parseInt(parts[1], 10) || 500;
                const isNote = parts[0] !== '@' && parts[0] !== '0';
                if (isNote) {
                    rawNotes.push({
                        noteName: parts[0],
                        startTimeMs: playheadTimeMs,
                        durationMs: durationMs,
                        frequency: midiToFreq(noteToMidi(parts[0])),
                        waveform: track.instrument.waveform || 'triangle',
                        instrument: track.instrument,
                        trackName: track.trackName,
                        trackId: track.trackId
                    });
                }
                playheadTimeMs += durationMs;
            });
            if (playheadTimeMs > totalDurationMs) {
                totalDurationMs = playheadTimeMs;
            }
        });
        
        const allNotesToPlay = rawNotes.sort((a, b) => a.startTimeMs - b.startTimeMs);
        
        isPlaying = true;
        isPaused = false;

        worker.postMessage({
            command: 'start',
            data: {
                allNotesToPlay,
                initialActiveTrackIds: Array.from(initialActiveTrackIds),
                totalDurationMs
            }
        });
    }

    function pause() {
        if (!isPlaying || isPaused) return;
        isPaused = true;
        silenceAllNotes();
        worker.postMessage({ command: 'pause' });
    }

    function resume() {
        if (!isPlaying || !isPaused) return;
        isPaused = false;
        worker.postMessage({ command: 'resume' });
    }
    
    function seek(targetTimeMs) {
        if (!isPlaying) return;
        silenceAllNotes();
        worker.postMessage({ command: 'seek', data: { targetTimeMs } });
    }

    function updateActiveTracks(newActiveTrackIds) {
        if (worker) {
            worker.postMessage({ command: 'updateActiveTracks', data: { newActiveTrackIds: Array.from(newActiveTrackIds) } });
        }
        if (window.lastPlaybackCallbacks && typeof window.lastPlaybackCallbacks.onMute === 'function') {
            window.lastPlaybackCallbacks.onMute(newActiveTrackIds);
        }
    }

    function updateTrackInstrument(trackId, newInstrument) {
        if (worker) {
            worker.postMessage({ command: 'updateTrackInstrument', data: { trackId, newInstrument } });
        }
    }
    
    function getPlaybackState() {
        return { isPlaying, isPaused };
    }

    return { play, stop, pause, resume, seek, updateActiveTracks, updateTrackInstrument, getPlaybackState };
})();