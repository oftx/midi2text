//================================================================
// Part 1: New CSV Generation Logic using MIDIFile.js
//================================================================

/**
 * 将 MIDIFile.js 解析出的事件数组转换为 midicsv 格式的字符串。
 * @param {MIDIFile} midiFile - An instance of MIDIFile.
 * @returns {string} - A string in midicsv format.
 */
function midiEventsToCsv(midiFile) {
    const header = midiFile.header;
    const tracks = midiFile.tracks;
    const lines = [];
    let absoluteTime = 0; // Ticks are calculated per track

    // Header record
    lines.push(`0, 0, Header, ${header.getFormat()}, ${header.getTracksCount()}, ${header.getTicksPerBeat()}`);

    // Track records
    tracks.forEach((track, trackIndex) => {
        const trackNum = trackIndex + 1;
        absoluteTime = 0;

        lines.push(`${trackNum}, 0, Start_track`);

        const events = new MIDIFile.Track(track.datas.buffer, track.datas.byteOffset).getTrackEvents();

        events.forEach(event => {
            absoluteTime += event.delta;
            const type = event.type;

            if (type === MIDIEvents.EVENT_MIDI) {
                let eventName = '';
                switch (event.subtype) {
                    case MIDIEvents.EVENT_MIDI_NOTE_ON:
                        eventName = 'Note_on_c';
                        lines.push(`${trackNum}, ${absoluteTime}, ${eventName}, ${event.channel}, ${event.param1}, ${event.param2}`);
                        break;
                    case MIDIEvents.EVENT_MIDI_NOTE_OFF:
                        eventName = 'Note_off_c';
                        lines.push(`${trackNum}, ${absoluteTime}, ${eventName}, ${event.channel}, ${event.param1}, ${event.param2}`);
                        break;
                    case MIDIEvents.EVENT_MIDI_PROGRAM_CHANGE:
                        eventName = 'Program_c';
                        lines.push(`${trackNum}, ${absoluteTime}, ${eventName}, ${event.channel}, ${event.param1}`);
                        break;
                    // Add other MIDI events here if needed
                }
            } else if (type === MIDIEvents.EVENT_META) {
                let eventName = '';
                switch (event.subtype) {
                    case MIDIEvents.EVENT_META_TRACK_NAME:
                        eventName = 'Title_t';
                        lines.push(`${trackNum}, ${absoluteTime}, ${eventName}, "${UTF8.getStringFromBytes(event.data)}"`);
                        break;
                    case MIDIEvents.EVENT_META_SET_TEMPO:
                        eventName = 'Tempo';
                        lines.push(`${trackNum}, ${absoluteTime}, ${eventName}, ${event.tempo}`);
                        break;
                    case MIDIEvents.EVENT_META_END_OF_TRACK:
                        // This will be added manually
                        break;
                    // Add other META events here if needed
                }
            }
        });
        
        lines.push(`${trackNum}, ${absoluteTime}, End_track`);
    });

    lines.push('0, 0, End_of_file');
    return lines.join('\n');
}


//================================================================
// Part 2: Score Generation Logic (Translated from Python - UNCHANGED)
//================================================================

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function midiToNoteName(noteNumber) {
    if (noteNumber < 0 || noteNumber > 127) return "InvalidNote";
    const octave = Math.floor(noteNumber / 12) - 1;
    const name = NOTE_NAMES[noteNumber % 12];
    return `${name}${octave}`;
}

function parseMidiCsv(csvString) {
    let ticksPerQuarterNote = 480;
    let microsecondsPerQuarterNote = 500000;
    const openNotes = new Map();
    const instrumentNotes = {};

    const lines = csvString.split('\n');
    for (const line of lines) {
        const row = line.split(',').map(field => field.trim());
        if (row.length < 3) continue;

        const track = parseInt(row[0], 10);
        const time = parseInt(row[1], 10);
        const eventType = row[2];
        
        if (eventType === 'Header') {
            ticksPerQuarterNote = parseInt(row[5], 10);
        } else if (eventType === 'Tempo') { // simplified tempo logic
            microsecondsPerQuarterNote = parseInt(row[3], 10);
        } else if (eventType === 'Note_on_c' && parseInt(row[5], 10) > 0) {
            const channel = parseInt(row[3], 10);
            const pitch = parseInt(row[4], 10);
            const key = `${track}-${channel}-${pitch}`;
            openNotes.set(key, time);
        } else if (eventType === 'Note_off_c' || (eventType === 'Note_on_c' && parseInt(row[5], 10) === 0)) {
            const channel = parseInt(row[3], 10);
            const pitch = parseInt(row[4], 10);
            const key = `${track}-${channel}-${pitch}`;
            if (openNotes.has(key)) {
                const startTick = openNotes.get(key);
                const endTick = time;
                openNotes.delete(key);
                if (endTick > startTick) {
                    if (!instrumentNotes[track]) instrumentNotes[track] = [];
                    instrumentNotes[track].push({ pitch, start_tick: startTick, end_tick: endTick });
                }
            }
        }
    }
    return { instrumentNotes, ticksPerQuarterNote, microsecondsPerQuarterNote };
}

function generatePolyphonicScore(notesList, msPerTick) {
    const subTracks = [];
    for (const note of notesList) {
        let notePlaced = false;
        for (const subTrack of subTracks) {
            if (subTrack.end_tick <= note.start_tick) {
                const restTicks = note.start_tick - subTrack.end_tick;
                if (restTicks > 0) {
                    const restMs = Math.round(restTicks * msPerTick);
                    if (restMs > 10) subTrack.notes.push(`@/${restMs}`);
                }
                const noteTicks = note.end_tick - note.start_tick;
                const noteMs = Math.round(noteTicks * msPerTick);
                subTrack.notes.push(`${midiToNoteName(note.pitch)}/${noteMs}`);
                subTrack.end_tick = note.end_tick;
                notePlaced = true;
                break;
            }
        }
        if (!notePlaced) {
            const newSubTrack = { notes: [], end_tick: 0 };
            if (note.start_tick > 0) {
                const restMs = Math.round(note.start_tick * msPerTick);
                if (restMs > 10) newSubTrack.notes.push(`@/${restMs}`);
            }
            const noteTicks = note.end_tick - note.start_tick;
            const noteMs = Math.round(noteTicks * msPerTick);
            newSubTrack.notes.push(`${midiToNoteName(note.pitch)}/${noteMs}`);
            newSubTrack.end_tick = note.end_tick;
            subTracks.push(newSubTrack);
        }
    }
    return subTracks;
}

function generateCustomScore(instrumentNotes, ticksPerQuarterNote, microsecondsPerQuarterNote) {
    if (Object.keys(instrumentNotes).length === 0) return "未在文件中找到任何音符事件。";
    const msPerTick = (microsecondsPerQuarterNote / 1000) / ticksPerQuarterNote;
    const outputLines = [];
    const sortedTrackNums = Object.keys(instrumentNotes).map(Number).sort((a, b) => a - b);
    for (const instrumentTrackNum of sortedTrackNums) {
        let notesList = instrumentNotes[instrumentTrackNum];
        notesList.sort((a, b) => a.start_tick - b.start_tick);
        outputLines.push(`【乐器轨道 ${instrumentTrackNum}】`);
        const subTracks = generatePolyphonicScore(notesList, msPerTick);
        subTracks.forEach((subTrack, i) => {
            if (subTrack.notes.length === 0) return;
            outputLines.push(`音轨 ${i + 1}:`);
            outputLines.push(subTrack.notes.join(" "));
            outputLines.push("");
        });
    }
    return outputLines.join("\n");
}

//================================================================
// Part 3: Page Interaction and Application Flow Logic (REVISED)
//================================================================

const dropZone = document.getElementById('drop-zone');
const midiInput = document.getElementById('midi-input');
const statusDiv = document.getElementById('status');
const resultsContainer = document.getElementById('results-container');
const outputText = document.getElementById('output-text');
const copyButton = document.getElementById('copy-button');

dropZone.addEventListener('click', () => midiInput.click());
midiInput.addEventListener('change', handleFileSelect);
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('dragover'); });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) processFile(e.dataTransfer.files[0]);
});

copyButton.addEventListener('click', () => {
    navigator.clipboard.writeText(outputText.innerText).then(() => {
        copyButton.textContent = '已复制!';
        setTimeout(() => { copyButton.textContent = '复制所有'; }, 2000);
    }).catch(err => { console.error('无法复制文本: ', err); copyButton.textContent = '复制失败'; });
});

function handleFileSelect(event) {
    if (event.target.files.length) processFile(event.target.files[0]);
}

function processFile(file) {
    if (!file || !file.type.includes('midi')) {
        statusDiv.innerHTML = `<p><strong>错误:</strong> 请上传一个有效的 MIDI 文件 (.mid or .midi)。</p>`;
        return;
    }

    statusDiv.innerHTML = `<p>正在处理文件: ${file.name} <progress></progress></p>`;
    resultsContainer.hidden = true;

    const reader = new FileReader();
    reader.onload = function(e) {
        const arrayBuffer = e.target.result;
        try {
            // 1. MIDI (ArrayBuffer) -> JS Events (using MIDIFile.js)
            const midiFile = new MIDIFile(arrayBuffer);
            
            // 2. JS Events -> CSV String (using our new function)
            const csvOutput = midiEventsToCsv(midiFile);

            // 3. CSV String -> Simple Score (using existing logic)
            const { instrumentNotes, ticksPerQuarterNote, microsecondsPerQuarterNote } = parseMidiCsv(csvOutput);
            const simpleScore = generateCustomScore(instrumentNotes, ticksPerQuarterNote, microsecondsPerQuarterNote);

            // 4. Display results
            outputText.textContent = simpleScore;
            resultsContainer.hidden = false;
            statusDiv.innerHTML = `<p><strong>转换完成！</strong></p>`;

        } catch (error) {
            console.error("处理过程中发生错误:", error);
            statusDiv.innerHTML = `<p><strong>错误:</strong> ${error.message}。转换失败，请检查文件是否有效。</p>`;
        }
    };
    reader.readAsArrayBuffer(file);
}