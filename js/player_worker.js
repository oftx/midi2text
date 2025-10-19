// File: /midi2text/js/player_worker.js (Fixed)

let allNotesToPlay = [];
let currentlyActiveTrackIds = new Set();

let isPlaying = false;
let isPaused = false;
let tickIntervalId = null;
let playbackProgressMs = 0;
let totalDurationMs = 0;
let playedNoteCount = 0;
let totalNoteCount = 0;
let nextNoteIndex = 0;

const TICK_INTERVAL = 25;

const NOTE_TO_MIDI = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

function midiToFreq(midi, transposeOffset = 0) {
    if (midi === null) return 0;
    return 440 * Math.pow(2, ((midi + transposeOffset) - 69) / 12);
}

function tick() {
    if (!isPlaying || isPaused) return;

    playbackProgressMs += TICK_INTERVAL;

    while (nextNoteIndex < allNotesToPlay.length && allNotesToPlay[nextNoteIndex].startTimeMs <= playbackProgressMs) {
        const note = allNotesToPlay[nextNoteIndex];
        if (currentlyActiveTrackIds.has(note.trackId)) {
            postMessage({
                type: 'playNote',
                note: note
            });
            playedNoteCount++;
        }
        nextNoteIndex++;
    }

    postMessage({
        type: 'progressUpdate',
        progress: {
            currentTimeMs: playbackProgressMs,
            totalTimeMs: totalDurationMs,
            playedNotes: playedNoteCount,
            totalNotes: totalNoteCount
        }
    });

    if (playbackProgressMs >= totalDurationMs) {
        stop(true);
    }
}

function start(data) {
    stop();
    allNotesToPlay = data.allNotesToPlay;
    currentlyActiveTrackIds = new Set(data.initialActiveTrackIds);
    totalDurationMs = data.totalDurationMs;
    totalNoteCount = allNotesToPlay.length;
    playedNoteCount = 0;
    playbackProgressMs = 0;
    nextNoteIndex = 0;
    isPlaying = true;
    isPaused = false;
    tickIntervalId = setInterval(tick, TICK_INTERVAL);
}

function stop(isNaturalEnd = false) {
    isPlaying = false;
    isPaused = false;
    if (tickIntervalId) {
        clearInterval(tickIntervalId);
        tickIntervalId = null;
    }
    if (isNaturalEnd) {
        postMessage({ type: 'playbackEnded' });
    }
}

function pause() {
    if (!isPlaying || isPaused) return;
    isPaused = true;
}

function resume() {
    if (!isPlaying || !isPaused) return;
    isPaused = false;
}

function seek(targetTimeMs) {
    if (!isPlaying) return;
    playbackProgressMs = Math.max(0, Math.min(targetTimeMs, totalDurationMs));
    nextNoteIndex = allNotesToPlay.findIndex(note => note.startTimeMs >= playbackProgressMs);
    if (nextNoteIndex === -1) nextNoteIndex = allNotesToPlay.length;

    playedNoteCount = 0;
    for (let i = 0; i < nextNoteIndex; i++) {
        if (currentlyActiveTrackIds.has(allNotesToPlay[i].trackId)) {
            playedNoteCount++;
        }
    }
    
    postMessage({
        type: 'progressUpdate',
        progress: {
            currentTimeMs: playbackProgressMs,
            totalTimeMs: totalDurationMs,
            playedNotes: playedNoteCount,
            totalNotes: totalNoteCount
        }
    });
}

function updateActiveTracks(newActiveTrackIds) {
    currentlyActiveTrackIds = new Set(newActiveTrackIds);
}

function updateTrackInstrument(data) {
    for (let i = 0; i < allNotesToPlay.length; i++) {
        if (allNotesToPlay[i].trackId === data.trackId) {
            allNotesToPlay[i].instrument = data.newInstrument;
            allNotesToPlay[i].waveform = data.newInstrument.waveform;
        }
    }
}

function rescheduleWithTranspose(transposeOffset) {
    if (!isPlaying) return;
    for (let i = 0; i < allNotesToPlay.length; i++) {
        allNotesToPlay[i].frequency = midiToFreq(allNotesToPlay[i].originalMidi, transposeOffset);
    }
}

self.onmessage = function(e) {
    const { command, data } = e.data;
    switch (command) {
        case 'start':
            start(data);
            break;
        case 'stop':
            stop();
            break;
        case 'pause':
            pause();
            break;
        case 'resume':
            resume();
            break;
        case 'seek':
            seek(data.targetTimeMs);
            break;
        case 'updateActiveTracks':
            updateActiveTracks(data.newActiveTrackIds);
            break;
        case 'updateTrackInstrument':
            updateTrackInstrument(data);
            break;
        case 'rescheduleWithTranspose':
            rescheduleWithTranspose(data.transposeOffset);
            break;
    }
};