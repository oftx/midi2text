// File: /midi2text/js/main.js (Updated)

document.addEventListener('DOMContentLoaded', () => {
    // ... (UI elements)
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const statusDiv = document.getElementById('status');
    const resultsContainer = document.getElementById('results-container');
    const resultsOutput = document.getElementById('results-output');
    const switcherOptions = document.querySelectorAll('.switcher-option');
    const playAllButton = document.getElementById('play-all-button');
    const nowPlayingZone = document.getElementById('now-playing-zone');
    const nowPlayingOutput = document.getElementById('now-playing-output');
    const stopButton = document.getElementById('stop-button');
    // NEW: Get the new button
    const sendToPlayerButton = document.getElementById('send-to-player-button');

    // ... (State variables)
    let polyphonicResult = null;
    let monophonicResult = null;
    let currentResult = null;

    // --- Event Listeners ---
    // ... (drag/drop listeners remain the same)
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]); });

    switcherOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            e.preventDefault();
            if (e.currentTarget.classList.contains('active')) return;
            switcherOptions.forEach(opt => opt.classList.remove('active'));
            e.currentTarget.classList.add('active');
            const selectedMode = e.currentTarget.getAttribute('data-mode');
            currentResult = selectedMode === 'poly' ? polyphonicResult : monophonicResult;
            displayResults(currentResult);
        });
    });

    playAllButton.addEventListener('click', () => {
        const allTracksData = [];
        for (const instrumentName in currentResult) {
            currentResult[instrumentName].forEach(track => {
                allTracksData.push({
                    instrument: { name: instrumentName, waveform: 'triangle' },
                    trackName: track.track_name,
                    notesString: track.notes_string
                });
            });
        }
        startPlayback(allTracksData);
    });

    stopButton.addEventListener('click', () => {
        SimpleNotePlayer.stop();
        endPlayback();
    });
    
    // NEW: Event listener for sending data to the player
    sendToPlayerButton.addEventListener('click', () => {
        if (!currentResult) return;

        const instruments = [];
        const tracks = [];
        let instrumentIdCounter = 1;

        // Create instrument definitions
        for (const instrumentName in currentResult) {
            instruments.push({
                id: instrumentIdCounter++,
                name: instrumentName.replace(/【|】/g, ''), // Clean up name
                waveform: 'triangle' // Default to triangle
            });
        }
        
        // Create tracks and link to instruments
        for (const instrumentName in currentResult) {
            const instrumentData = currentResult[instrumentName];
            instrumentData.forEach(track => {
                tracks.push({
                    instrumentName: instrumentName.replace(/【|】/g, ''),
                    score: track.notes_string
                });
            });
        }
        
        const dataForPlayer = { instruments, tracks };

        sessionStorage.setItem('midiConversionData', JSON.stringify(dataForPlayer));
        window.location.href = 'player.html';
    });

    // --- Core Functions ---
    // ... (handleFile remains the same)
    function handleFile(file) {
        if (!wasmReady) { statusDiv.textContent = '错误：Wasm 模块仍在加载中...'; return; }
        if (!file.type.includes('midi') && !file.name.endsWith('.mid')) { statusDiv.textContent = '错误：请上传有效的 MIDI 文件'; return; }
        statusDiv.textContent = `正在处理: ${file.name}...`;
        resultsContainer.hidden = true;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const byteArray = new Uint8Array(e.target.result);
                FS.writeFile('/input.midi', byteArray);
                Module._midicsv();
                const csvData = FS.readFile('/output.csv', { encoding: 'utf8' });
                polyphonicResult = SimpleScoreGenerator.generate(csvData, { monophonic_mode: false });
                monophonicResult = SimpleScoreGenerator.generate(csvData, { monophonic_mode: true });
                document.querySelector('.switcher-option[data-mode="poly"]').classList.remove('active');
                document.querySelector('.switcher-option[data-mode="mono"]').classList.add('active');
                currentResult = monophonicResult;
                displayResults(currentResult);
                statusDiv.textContent = '处理完成！';
            } catch (error) { console.error('转换失败:', error); statusDiv.textContent = `处理失败: ${error.message}`; }
        };
        reader.onerror = () => { statusDiv.textContent = '读取文件失败。'; };
        reader.readAsArrayBuffer(file);
    }

    // --- UI & Playback ---
    function displayResults(resultData) {
        resultsOutput.innerHTML = ''; 
        if (!resultData || resultData.error) {
            resultsOutput.innerHTML = `<p>${resultData ? resultData.error : '无数据'}</p>`;
            resultsContainer.hidden = false;
            sendToPlayerButton.hidden = true; // Hide button if no data
            return;
        }

        // ... (The rest of the displayResults function remains the same)
        for (const instrumentName in resultData) {
            const instrumentTracks = resultData[instrumentName];
            const instrumentDiv = document.createElement('div');
            instrumentDiv.className = 'instrument-block';
            instrumentDiv.innerHTML = `<h4>${instrumentName}</h4>`;
            instrumentTracks.forEach(track => {
                const durationInSeconds = (track.duration_ms / 1000).toFixed(2);
                const trackBlock = document.createElement('div');
                trackBlock.className = 'track-block';
                const trackHeader = document.createElement('div');
                trackHeader.className = 'track-header';
                const playButton = document.createElement('button');
                playButton.className = 'track-play-button';
                playButton.textContent = '▶';
                playButton.onclick = () => {
                    startPlayback([{
                        instrument: { name: instrumentName, waveform: 'triangle' },
                        trackName: track.track_name,
                        notesString: track.notes_string
                    }]);
                };
                trackHeader.innerHTML = `
                    <strong>${track.track_name}</strong>
                    <div class="track-meta">
                        <span>音符数: ${track.note_count}</span>
                        <span>时长: ${durationInSeconds}s</span>
                    </div>
                `;
                trackHeader.appendChild(playButton);
                const textarea = document.createElement('textarea');
                textarea.className = 'track-textarea';
                textarea.readOnly = true;
                textarea.value = track.notes_string;
                trackBlock.appendChild(trackHeader);
                trackBlock.appendChild(textarea);
                instrumentDiv.appendChild(trackBlock);
            });
            resultsOutput.appendChild(instrumentDiv);
        }
        resultsContainer.hidden = false;
        // MODIFIED: Show the button when results are displayed
        sendToPlayerButton.hidden = false;
    }
    
    // ... (startPlayback, updateNowPlayingDisplay, endPlayback functions remain the same)
    const activeNotes = new Map();
    function startPlayback(tracksData) {
        dropZone.hidden = true;
        nowPlayingZone.hidden = false;
        nowPlayingOutput.innerHTML = '';
        activeNotes.clear();
        const uniqueInstruments = [...new Set(tracksData.map(t => t.instrument.name))];
        uniqueInstruments.forEach(inst => {
            const instDiv = document.createElement('div');
            instDiv.className = 'playing-instrument';
            instDiv.id = `playing-${inst.replace(/[^a-zA-Z0-9]/g, '')}`;
            instDiv.innerHTML = `<span class="playing-instrument-name">${inst}:</span><span class="playing-notes">---</span>`;
            nowPlayingOutput.appendChild(instDiv);
            activeNotes.set(inst, new Set());
        });
        SimpleNotePlayer.play(tracksData, {
            onNoteOn: (instrument, trackName, noteName) => {
                const notesSet = activeNotes.get(instrument);
                if (notesSet) { notesSet.add(noteName); updateNowPlayingDisplay(instrument); }
            },
            onNoteOff: (instrument, trackName, noteName) => {
                const notesSet = activeNotes.get(instrument);
                if (notesSet) { notesSet.delete(noteName); updateNowPlayingDisplay(instrument); }
            },
            onPlaybackEnd: () => {
                nowPlayingOutput.innerHTML = '<h4>播放完成！</h4>';
                setTimeout(() => { endPlayback(); }, 1000);
            }
        });
    }
    function updateNowPlayingDisplay(instrument) {
        const instId = `playing-${instrument.replace(/[^a-zA-Z0-9]/g, '')}`;
        const instDiv = document.getElementById(instId);
        if (instDiv) {
            const notesSpan = instDiv.querySelector('.playing-notes');
            const notes = Array.from(activeNotes.get(instrument) || []);
            notesSpan.textContent = notes.length > 0 ? notes.join(', ') : '---';
        }
    }
    function endPlayback() {
        dropZone.hidden = false;
        nowPlayingZone.hidden = true;
    }
});