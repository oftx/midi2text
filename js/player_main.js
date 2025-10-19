// File: /midi2text/js/player_main.js (Fixed)

document.addEventListener('DOMContentLoaded', () => {
    // ... (UI Elements remain the same)
    const playAllButton = document.getElementById('play-all-button');
    const stopButton = document.getElementById('stop-button');
    const addTrackButton = document.getElementById('add-track-button');
    const tracksContainer = document.getElementById('tracks-container');
    const manageInstrumentsButton = document.getElementById('manage-instruments-button');
    const instrumentModal = document.getElementById('instrument-modal');
    const closeModalButton = document.getElementById('close-modal-button');
    const addInstrumentForm = document.getElementById('add-instrument-form');
    const instrumentListDiv = document.getElementById('instrument-list');
    const nowPlayingZone = document.getElementById('now-playing-zone');
    const nowPlayingOutput = document.getElementById('now-playing-output');
    const toastElement = document.getElementById('toast');
    
    // ... (State and Toast function remain the same)
    let trackCounter = 0;
    let instruments = [
        { id: 1, name: '圆润三角波', waveform: 'triangle' },
        { id: 2, name: '柔和正弦波', waveform: 'sine' },
        { id: 3, name: '芯片方波', waveform: 'square' },
        { id: 4, name: '锐利锯齿波', waveform: 'sawtooth' },
        { id: 5, name: '电子琴音色', waveform: 'sine' },
        { id: 6, name: '贝斯音色', waveform: 'sawtooth' }
    ];
    let nextInstrumentId = 7;
    const activeNotes = new Map();
    let toastTimer;
    function showToast(message) {
        if (toastTimer) clearTimeout(toastTimer);
        toastElement.textContent = message;
        toastElement.classList.add('show');
        toastTimer = setTimeout(() => {
            toastElement.classList.remove('show');
        }, 3000);
    }

    // ... (Instrument and Track management functions remain the same)
    function renderInstruments() {
        instrumentListDiv.innerHTML = '';
        if (instruments.length === 0) {
            instrumentListDiv.innerHTML = '<p>还没有乐器，请添加一个。</p>';
        }
        instruments.forEach(inst => {
            const instEl = document.createElement('div');
            instEl.style.display = 'flex';
            instEl.style.justifyContent = 'space-between';
            instEl.style.marginBottom = '0.5rem';
            instEl.innerHTML = `<span>${inst.name} (${inst.waveform})</span>`;
            const deleteButton = document.createElement('button');
            deleteButton.textContent = '删除';
            deleteButton.className = 'secondary outline';
            deleteButton.style.padding = '0.1rem 0.5rem';
            deleteButton.onclick = () => deleteInstrument(inst.id);
            instEl.appendChild(deleteButton);
            instrumentListDiv.appendChild(instEl);
        });
        updateAllTrackInstrumentSelects();
    }
    function saveInstrument(e) {
        e.preventDefault();
        const nameInput = document.getElementById('instrument-name-input');
        const waveformSelect = document.getElementById('instrument-waveform-select');
        const newInstrument = {
            id: nextInstrumentId++,
            name: nameInput.value,
            waveform: waveformSelect.value
        };
        instruments.push(newInstrument);
        nameInput.value = '';
        renderInstruments();
    }
    function deleteInstrument(id) {
        instruments = instruments.filter(inst => inst.id !== id);
        renderInstruments();
    }
    function updateAllTrackInstrumentSelects() {
        const allSelects = document.querySelectorAll('.instrument-select');
        allSelects.forEach(select => {
            const currentVal = select.value;
            select.innerHTML = '';
            instruments.forEach(inst => {
                const option = document.createElement('option');
                option.value = inst.id;
                option.textContent = inst.name;
                select.appendChild(option);
            });
            const exists = instruments.some(inst => inst.id == currentVal);
            if (currentVal && exists) {
                select.value = currentVal;
            }
        });
    }
    function addNewTrack(instrumentId = null, score = '') {
        trackCounter++;
        const trackId = trackCounter;
        const trackBlock = document.createElement('article');
        trackBlock.className = 'track-block';
        trackBlock.id = `track-${trackId}`;
        trackBlock.style.marginTop = '1.5rem';
        trackBlock.style.paddingTop = '1.2rem';
        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'track-controls';
        const selectLabel = document.createElement('label');
        selectLabel.htmlFor = `instrument-select-${trackId}`;
        selectLabel.textContent = `轨道 ${trackId}`;
        const select = document.createElement('select');
        select.className = 'instrument-select';
        select.id = `instrument-select-${trackId}`;
        const deleteButton = document.createElement('button');
        deleteButton.textContent = '删除';
        deleteButton.className = 'secondary outline track-delete-button';
        deleteButton.onclick = () => trackBlock.remove();
        controlsContainer.appendChild(selectLabel);
        controlsContainer.appendChild(select);
        controlsContainer.appendChild(deleteButton);
        const textarea = document.createElement('textarea');
        textarea.placeholder = '在此输入简单乐谱, 例如: C4/500 D4/500 E4/500';
        textarea.style.height = '150px';
        textarea.value = score;
        trackBlock.appendChild(controlsContainer);
        trackBlock.appendChild(textarea);
        tracksContainer.appendChild(trackBlock);
        updateAllTrackInstrumentSelects();
        if (instrumentId) {
            select.value = instrumentId;
        }
    }

    // --- Playback Logic (MODIFIED functions are here) ---
    function playAll() {
        const tracksToPlay = [];
        const trackBlocks = document.querySelectorAll('.track-block');
        if (trackBlocks.length === 0) {
            showToast("请先添加一个轨道。");
            return;
        }
        trackBlocks.forEach(block => {
            const instrumentId = parseInt(block.querySelector('.instrument-select').value, 10);
            const notesString = block.querySelector('textarea').value;
            const selectedInstrument = instruments.find(i => i.id === instrumentId);
            if (notesString.trim() && selectedInstrument) {
                // MODIFIED: Pass the *entire* selectedInstrument object
                tracksToPlay.push({
                    instrument: selectedInstrument,
                    trackName: `Track ${block.id.split('-')[1]}`,
                    notesString: notesString
                });
            }
        });
        if (tracksToPlay.length > 0) {
            startPlayback(tracksToPlay);
        } else {
            showToast("没有可播放的轨道。请选择乐器并输入乐谱。");
        }
    }
    
    function startPlayback(tracksData) {
        nowPlayingZone.hidden = false;
        nowPlayingOutput.innerHTML = '';
        activeNotes.clear();

        // MODIFIED: Use a Map to get a unique list of instrument objects
        const uniqueInstruments = new Map();
        tracksData.forEach(track => {
            if (!uniqueInstruments.has(track.instrument.id)) {
                uniqueInstruments.set(track.instrument.id, track.instrument);
            }
        });
        
        uniqueInstruments.forEach(inst => {
            const instDiv = document.createElement('div');
            instDiv.className = 'playing-instrument';
            // MODIFIED: Use the unique numeric ID for the DOM ID
            instDiv.id = `playing-${inst.id}`; 
            instDiv.innerHTML = `<span class="playing-instrument-name">${inst.name}:</span><span class="playing-notes">---</span>`;
            nowPlayingOutput.appendChild(instDiv);
            activeNotes.set(inst.name, new Set()); // Keep using name for the Map key
        });
        
        SimpleNotePlayer.play(tracksData, {
            onNoteOn: (instrument, trackName, noteName) => {
                // MODIFIED: `instrument` is now an object
                const notesSet = activeNotes.get(instrument.name);
                if (notesSet) {
                    notesSet.add(noteName);
                    updateNowPlayingDisplay(instrument);
                }
            },
            onNoteOff: (instrument, trackName, noteName) => {
                 // MODIFIED: `instrument` is now an object
                const notesSet = activeNotes.get(instrument.name);
                if (notesSet) {
                    notesSet.delete(noteName);
                    updateNowPlayingDisplay(instrument);
                }
            },
            onPlaybackEnd: () => {
                nowPlayingOutput.innerHTML = '<h4>播放完成！</h4>';
                setTimeout(() => { nowPlayingZone.hidden = true; }, 1000);
            }
        });
    }

    function updateNowPlayingDisplay(instrument) {
        // MODIFIED: Use `instrument.id` to find the element
        const instId = `playing-${instrument.id}`;
        const instDiv = document.getElementById(instId);
        if (instDiv) {
            const notesSpan = instDiv.querySelector('.playing-notes');
            // MODIFIED: Use `instrument.name` to get data from the map
            const notes = Array.from(activeNotes.get(instrument.name) || []);
            notesSpan.textContent = notes.length > 0 ? notes.join(', ') : '---';
        }
    }

    // ... (Event Listeners remain the same)
    playAllButton.addEventListener('click', playAll);
    stopButton.addEventListener('click', () => {
        SimpleNotePlayer.stop();
        nowPlayingZone.hidden = true;
    });
    addTrackButton.addEventListener('click', () => addNewTrack(1, ''));
    manageInstrumentsButton.addEventListener('click', () => instrumentModal.showModal());
    closeModalButton.addEventListener('click', () => instrumentModal.close());
    addInstrumentForm.addEventListener('submit', saveInstrument);

    // ... (Initialization logic remains the same)
    function initializeDefaultScore() {
        const odeToJoyPart1 = "E4/500 E4/500 F4/500 G4/500 G4/500 F4/500 E4/500 D4/500 C4/500 C4/500 D4/500 E4/500 E4/750 D4/250 D4/1000 E4/500 E4/500 F4/500 G4/500 G4/500 F4/500 E4/500 D4/500 C4/500 C4/500 D4/500 E4/500 D4/750 C4/250 C4/1000 D4/500 D4/500 E4/500 C4/500 D4/500 E4/250 F4/250 E4/500 C4/500 D4/500 E4/250 F4/250 E4/500 D4/500 C4/500 D4/500 G3/1000 E4/500 E4/500 F4/500 G4/500 G4/500 F4/500 E4/500 D4/500 C4/500 C4/500 D4/500 E4/500 D4/750 C4/250 C4/1000";
        const odeToJoyPart2 = "C3/1000 G3/1000 C3/1000 G3/1000 C3/500 G3/500 C3/500 G3/500 C3/500 G3/500 C3/500 G3/500 F3/1000 C3/1000 F3/1000 C3/1000 C3/1000 G3/1000 C3/1000 G3/1000 C3/1000 G3/1000 C3/1000 G3/1000 C3/500 G3/500 C3/500 G3/500 C3/500 G3/500 C3/500 G3/500 F3/1000 C3/1000 F3/1000 C3/1000 C3/1000 G3/1000 C3/1000 G3/1000";
        addNewTrack(1, odeToJoyPart1);
        addNewTrack(2, odeToJoyPart2);
    }
    function initializeFromData(data) {
        const existingNames = new Set(instruments.map(i => i.name));
        data.instruments.forEach(importedInst => {
            if (!existingNames.has(importedInst.name)) {
                const newInst = { ...importedInst, id: nextInstrumentId++ };
                instruments.push(newInst);
                existingNames.add(newInst.name);
            }
        });
        nextInstrumentId = Math.max(...instruments.map(i => i.id)) + 1;
        data.tracks.forEach(track => {
            const correspondingInstrument = instruments.find(i => i.name === track.instrumentName);
            if (correspondingInstrument) {
                addNewTrack(correspondingInstrument.id, track.score);
            } else {
                addNewTrack(1, track.score);
            }
        });
    }
    const importedData = sessionStorage.getItem('midiConversionData');
    if (importedData) {
        try {
            const parsedData = JSON.parse(importedData);
            initializeFromData(parsedData);
        } catch (e) {
            console.error("Failed to parse imported data, loading default score.", e);
            initializeDefaultScore();
        } finally {
            sessionStorage.removeItem('midiConversionData');
        }
    } else {
        initializeDefaultScore();
    }
    renderInstruments();
});