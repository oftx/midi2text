const SimpleNotePlayer = (() => {
    let audioCtx = null;
    let activeOscillators = [];
    
    let allNotesToPlay = [];
    let currentlyActiveTrackIds = new Set();
    
    let isPlaying = false;
    let isPaused = false;
    let animationFrameId = null;
    let playbackProgressMs = 0;
    let lastTickTimestamp = 0;
    let totalDurationMs = 0;
    let playedNoteCount = 0;
    let totalNoteCount = 0;
    let nextNoteIndex = 0;

    const NOTE_TO_MIDI = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

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

    function tick(timestamp) {
        if (!isPlaying || isPaused) return;

        if (lastTickTimestamp === 0) {
            lastTickTimestamp = timestamp;
        }
        const deltaTime = timestamp - lastTickTimestamp;
        lastTickTimestamp = timestamp;
        playbackProgressMs += deltaTime;

        while (nextNoteIndex < allNotesToPlay.length && allNotesToPlay[nextNoteIndex].startTimeMs <= playbackProgressMs) {
            const note = allNotesToPlay[nextNoteIndex];
            if (currentlyActiveTrackIds.has(note.trackId)) {
                const timeUntilStart = (note.startTimeMs - playbackProgressMs) / 1000;
                const startTime = audioCtx.currentTime + Math.max(0, timeUntilStart);
                playNote(note.frequency, startTime, note.durationMs / 1000.0, note.waveform);
                
                setTimeout(() => {
                    if (currentlyActiveTrackIds.has(note.trackId)) {
                        playedNoteCount++;
                        window.lastPlaybackCallbacks.onNoteOn(note.instrument, note.trackName, note.noteName);
                    }
                }, Math.max(0, timeUntilStart * 1000));

                setTimeout(() => {
                    window.lastPlaybackCallbacks.onNoteOff(note.instrument, note.trackName, note.noteName);
                }, Math.max(0, timeUntilStart * 1000) + note.durationMs);
            }
            nextNoteIndex++;
        }
        
        if (window.lastPlaybackCallbacks.onProgressUpdate) {
            window.lastPlaybackCallbacks.onProgressUpdate({
                currentTimeMs: playbackProgressMs,
                totalTimeMs: totalDurationMs,
                playedNotes: playedNoteCount,
                totalNotes: totalNoteCount
            });
        }
        
        if (playbackProgressMs >= totalDurationMs) {
            setTimeout(() => stop(true), 200);
        } else {
            animationFrameId = requestAnimationFrame(tick);
        }
    }

    function stop(isNaturalEnd = false) {
        if (!audioCtx) return;
        
        isPlaying = false;
        isPaused = false;
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        silenceAllNotes();
        allNotesToPlay = [];
        currentlyActiveTrackIds.clear();
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
        stop();
        window.lastPlaybackCallbacks = callbacks;
        currentlyActiveTrackIds = new Set(initialActiveTrackIds);
        
        let rawNotes = [];
        totalDurationMs = 0;
        
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
        
        allNotesToPlay = rawNotes.sort((a, b) => a.startTimeMs - b.startTimeMs);
        totalNoteCount = allNotesToPlay.length;
        playedNoteCount = 0;
        playbackProgressMs = 0;
        nextNoteIndex = 0;
        lastTickTimestamp = 0;
        isPlaying = true;
        isPaused = false;

        animationFrameId = requestAnimationFrame(tick);
    }

    function pause() {
        if (!isPlaying || isPaused) return;
        isPaused = true;
        lastTickTimestamp = 0;
        silenceAllNotes();
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }

    function resume() {
        if (!isPlaying || !isPaused) return;
        isPaused = false;
        animationFrameId = requestAnimationFrame(tick);
    }
    
    function seek(targetTimeMs) {
        if (!isPlaying) return;
        
        silenceAllNotes();
        playbackProgressMs = Math.max(0, Math.min(targetTimeMs, totalDurationMs));
        
        nextNoteIndex = allNotesToPlay.findIndex(note => note.startTimeMs >= playbackProgressMs);
        if (nextNoteIndex === -1) nextNoteIndex = allNotesToPlay.length;

        playedNoteCount = 0;
        for (let i = 0; i < nextNoteIndex; i++) {
            if (currentlyActiveTrackIds.has(allNotesToPlay[i].trackId)) {
                playedNoteCount++;
            }
        }

        if (window.lastPlaybackCallbacks.onProgressUpdate) {
            window.lastPlaybackCallbacks.onProgressUpdate({
                currentTimeMs: playbackProgressMs,
                totalTimeMs: totalDurationMs,
                playedNotes: playedNoteCount,
                totalNotes: totalNoteCount
            });
        }
    }

    function updateActiveTracks(newActiveTrackIds) {
        currentlyActiveTrackIds = new Set(newActiveTrackIds);
        if (window.lastPlaybackCallbacks && typeof window.lastPlaybackCallbacks.onMute === 'function') {
            window.lastPlaybackCallbacks.onMute(currentlyActiveTrackIds);
        }
    }

    function updateTrackInstrument(trackId, newInstrument) {
        for (let i = 0; i < allNotesToPlay.length; i++) {
            if (allNotesToPlay[i].trackId === trackId) {
                allNotesToPlay[i].instrument = newInstrument;
                allNotesToPlay[i].waveform = newInstrument.waveform;
            }
        }
    }
    
    function getPlaybackState() {
        return { isPlaying, isPaused };
    }

    return { play, stop, pause, resume, seek, updateActiveTracks, updateTrackInstrument, getPlaybackState };
})();