// File: /midi2text/js/simple_note_player.js (Fixed)

const SimpleNotePlayer = (() => {
    let audioCtx = null;
    let activeOscillators = [];
    let uiUpdateTimers = [];

    let schedulerIntervalId = null;
    let allNotesToPlay = [];
    let nextNoteIndex = 0;
    let playbackStartTime = 0;

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
    
    function scheduler() {
        const scheduleAheadTime = 100.0;
        const now = audioCtx.currentTime;
        const lookaheadTime = now + (scheduleAheadTime / 1000.0);

        while (nextNoteIndex < allNotesToPlay.length) {
            const note = allNotesToPlay[nextNoteIndex];
            const noteAudioTime = playbackStartTime + (note.startTimeMs / 1000.0);
            
            if (noteAudioTime < lookaheadTime) {
                playNote(note.frequency, noteAudioTime, note.durationMs / 1000.0, note.waveform);
                
                const uiCallbackTime = note.startTimeMs - ((now - playbackStartTime) * 1000);
                // MODIFIED: Pass the full note.instrument object in the callback
                const noteOnTimer = setTimeout(() => note.callbacks.onNoteOn(note.instrument, note.trackName, note.noteName), uiCallbackTime);
                const noteOffTimer = setTimeout(() => note.callbacks.onNoteOff(note.instrument, note.trackName, note.noteName), uiCallbackTime + note.durationMs);
                uiUpdateTimers.push(noteOnTimer, noteOffTimer);
                
                nextNoteIndex++;
            } else {
                break;
            }
        }

        if (nextNoteIndex >= allNotesToPlay.length) {
            if (schedulerIntervalId) {
                clearInterval(schedulerIntervalId);
                schedulerIntervalId = null;
            }
        }
    }

    function stop(isNaturalEnd = false) {
        if (!audioCtx) return;
        
        if (schedulerIntervalId) {
            clearInterval(schedulerIntervalId);
            schedulerIntervalId = null;
        }

        const now = audioCtx.currentTime;
        activeOscillators.forEach(({ gainNode }) => {
            gainNode.gain.cancelScheduledValues(now);
            gainNode.gain.linearRampToValueAtTime(0, now + 0.1);
        });
        
        uiUpdateTimers.forEach(timerId => clearTimeout(timerId));
        
        activeOscillators = [];
        uiUpdateTimers = [];
        allNotesToPlay = [];
        nextNoteIndex = 0;

        if (isNaturalEnd && window.lastPlaybackCallbacks && typeof window.lastPlaybackCallbacks.onPlaybackEnd === 'function') {
            window.lastPlaybackCallbacks.onPlaybackEnd();
        }
    }
    
    async function play(tracksData, callbacks) {
        await ensureAudioContext();
        if (!audioCtx) {
            alert("无法初始化音频播放器。您的浏览器可能不支持 Web Audio API。");
            return;
        }
        stop();
        window.lastPlaybackCallbacks = callbacks;

        let rawNotes = [];
        let maxDuration = 0;

        tracksData.forEach(track => {
            const { instrument, trackName, notesString } = track;
            let playheadTimeMs = 0;
            const events = notesString.split(' ').filter(s => s);

            events.forEach(event => {
                const parts = event.split('/');
                const durationMs = parseInt(parts[1], 10) || 500;
                const isNote = parts[0] !== '@' && parts[0] !== '0';

                if (isNote) {
                    const noteName = parts[0];
                    rawNotes.push({
                        noteName: noteName,
                        startTimeMs: playheadTimeMs,
                        durationMs: durationMs,
                        frequency: midiToFreq(noteToMidi(noteName)),
                        waveform: instrument.waveform || 'triangle',
                        // MODIFIED: Pass the full instrument object
                        instrument: instrument,
                        trackName: trackName,
                        callbacks: callbacks
                    });
                }
                playheadTimeMs += durationMs;
            });
             if (playheadTimeMs > maxDuration) { maxDuration = playheadTimeMs; }
        });
        
        allNotesToPlay = rawNotes.sort((a, b) => a.startTimeMs - b.startTimeMs);
        
        nextNoteIndex = 0;
        playbackStartTime = audioCtx.currentTime;
        schedulerIntervalId = setInterval(scheduler, 50);

        const playbackEndTimer = setTimeout(() => {
            stop(true);
        }, maxDuration + 200);
        
        uiUpdateTimers.push(playbackEndTimer);
    }

    return { play, stop };
})();