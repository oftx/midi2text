
// File: /midi2text/js/player_main.js (Updated)

document.addEventListener('DOMContentLoaded', () => {
    const playAllButton = document.getElementById('play-all-button');
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
    const selectAllTracksButton = document.getElementById('select-all-tracks');
    const invertSelectionTracksButton = document.getElementById('invert-selection-tracks');
    const playPauseButton = document.getElementById('play-pause-button');
    const progressBar = document.getElementById('progress-bar');
    const timeProgress = document.getElementById('time-progress');
    const noteProgress = document.getElementById('note-progress');

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
    let isSeeking = false;
    let currentTracksData = [];
    let totalDurationMsForSeek = 0;

    function formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    function showToast(message) {
        if (toastTimer) clearTimeout(toastTimer);
        toastElement.textContent = message;
        toastElement.classList.add('show');
        toastTimer = setTimeout(() => {
            toastElement.classList.remove('show');
        }, 3000);
    }
    
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
        const trackId = `player-track-${trackCounter}`;
        const trackBlock = document.createElement('article');
        trackBlock.className = 'track-block';
        trackBlock.id = trackId;
        trackBlock.style.marginTop = '1.5rem';
        trackBlock.style.paddingTop = '1.2rem';
        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'track-controls';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'track-checkbox';
        checkbox.checked = true;
        checkbox.dataset.trackId = trackId;
        controlsContainer.appendChild(checkbox);
        const selectLabel = document.createElement('label');
        selectLabel.htmlFor = `instrument-select-${trackId}`;
        selectLabel.textContent = `轨道 ${trackCounter}`;
        controlsContainer.appendChild(selectLabel);
        const select = document.createElement('select');
        select.className = 'instrument-select';
        select.id = `instrument-select-${trackId}`;
        controlsContainer.appendChild(select);
        const deleteButton = document.createElement('button');
        deleteButton.textContent = '删除';
        deleteButton.className = 'secondary outline track-delete-button';
        deleteButton.onclick = () => trackBlock.remove();
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

    function updateNowPlayingInstrumentsUI() {
        const activeInstruments = new Map();
        document.querySelectorAll('.track-block').forEach(block => {
            const checkbox = block.querySelector('.track-checkbox');
            if (checkbox && checkbox.checked) {
                const instrumentId = parseInt(block.querySelector('.instrument-select').value, 10);
                const instrument = instruments.find(i => i.id === instrumentId);
                if (instrument && !activeInstruments.has(instrument.id)) {
                    activeInstruments.set(instrument.id, instrument);
                }
            }
        });
    
        const displayedDivs = nowPlayingOutput.querySelectorAll('.playing-instrument');
    
        displayedDivs.forEach(div => {
            const instId = parseInt(div.id.split('-')[1], 10);
            if (!activeInstruments.has(instId)) {
                const removedInstrument = instruments.find(i => i.id === instId);
                if (removedInstrument) {
                    activeNotes.delete(removedInstrument.name);
                }
                div.remove();
            }
        });
    
        activeInstruments.forEach(inst => {
            const instId = `playing-${inst.id}`;
            if (!document.getElementById(instId)) {
                const instDiv = document.createElement('div');
                instDiv.className = 'playing-instrument';
                instDiv.id = instId;
                instDiv.innerHTML = `<span class="playing-instrument-name">${inst.name}:</span><span class="playing-notes">---</span>`;
                nowPlayingOutput.appendChild(instDiv);
                if (!activeNotes.has(inst.name)) {
                    activeNotes.set(inst.name, new Set());
                }
            }
        });
    }

    function updatePlayerForSelectionChange() {
        const activeIds = new Set();
        document.querySelectorAll('.track-checkbox:checked').forEach(cb => {
            activeIds.add(cb.dataset.trackId);
        });
        SimpleNotePlayer.updateActiveTracks(activeIds);

        const state = SimpleNotePlayer.getPlaybackState();
        if (state.isPlaying) {
            updateNowPlayingInstrumentsUI();
        }
    }
    
    playAllButton.addEventListener('click', () => {
        const state = SimpleNotePlayer.getPlaybackState();
        if (state.isPlaying) {
            SimpleNotePlayer.stop();
        }

        const tracksToPlay = [];
        const activeTrackIds = new Set();
        const trackBlocks = document.querySelectorAll('.track-block');

        if (trackBlocks.length === 0) {
            showToast("请先添加一个轨道。");
            return;
        }

        trackBlocks.forEach(block => {
            const checkbox = block.querySelector('.track-checkbox');
            if (checkbox.checked) {
                activeTrackIds.add(checkbox.dataset.trackId);
            }
        });

        if (activeTrackIds.size === 0) {
            showToast("请至少选择一个轨道来播放。");
            return;
        }

        trackBlocks.forEach(block => {
            const instrumentId = parseInt(block.querySelector('.instrument-select').value, 10);
            const notesString = block.querySelector('textarea').value;
            const selectedInstrument = instruments.find(i => i.id === instrumentId);
            if (notesString.trim() && selectedInstrument) {
                tracksToPlay.push({
                    instrument: selectedInstrument,
                    trackName: `Track ${block.id.split('-')[2]}`,
                    notesString: notesString,
                    trackId: block.id
                });
            }
        });

        if (tracksToPlay.length > 0) {
            currentTracksData = tracksToPlay;
            startPlayback(currentTracksData, activeTrackIds);
        } else {
            showToast("没有可播放的轨道。");
        }
    });
    
    playPauseButton.addEventListener('click', () => {
        const state = SimpleNotePlayer.getPlaybackState();
        if (state.isPaused) {
            SimpleNotePlayer.resume();
            playPauseButton.textContent = '⏸️';
        } else if (state.isPlaying) {
            SimpleNotePlayer.pause();
            playPauseButton.textContent = '▶️';
        } else {
            playAllButton.click();
        }
    });
    
    progressBar.addEventListener('mousedown', () => isSeeking = true);
    progressBar.addEventListener('mouseup', () => isSeeking = false);
    progressBar.addEventListener('input', () => {
        if (!isSeeking) return;
        const progress = progressBar.value / 1000;
        const targetTimeMs = totalDurationMsForSeek * progress;
        SimpleNotePlayer.seek(targetTimeMs);
    });

    addTrackButton.addEventListener('click', () => addNewTrack(1, ''));
    manageInstrumentsButton.addEventListener('click', () => instrumentModal.showModal());
    closeModalButton.addEventListener('click', () => instrumentModal.close());
    addInstrumentForm.addEventListener('submit', saveInstrument);

    tracksContainer.addEventListener('change', (e) => {
        if (e.target.matches('.track-checkbox')) {
            updatePlayerForSelectionChange();
        }
        if (e.target.matches('.instrument-select')) {
            const state = SimpleNotePlayer.getPlaybackState();
            if (state.isPlaying) {
                const trackBlock = e.target.closest('.track-block');
                const trackId = trackBlock.id;
                const newInstrumentId = parseInt(e.target.value, 10);
                const newInstrument = instruments.find(i => i.id === newInstrumentId);
                if (newInstrument) {
                    SimpleNotePlayer.updateTrackInstrument(trackId, newInstrument);
                    updateNowPlayingInstrumentsUI();
                }
            }
        }
    });

    selectAllTracksButton.addEventListener('click', () => {
        document.querySelectorAll('.track-checkbox').forEach(cb => cb.checked = true);
        updatePlayerForSelectionChange();
    });

    invertSelectionTracksButton.addEventListener('click', () => {
        document.querySelectorAll('.track-checkbox').forEach(cb => cb.checked = !cb.checked);
        updatePlayerForSelectionChange();
    });
    
    function startPlayback(tracksData, activeTrackIds) {
        nowPlayingZone.hidden = false;
        playPauseButton.textContent = '⏸️';
        nowPlayingOutput.innerHTML = '';
        activeNotes.clear();
        
        const uniqueInstruments = new Map();
        tracksData.forEach(track => {
            if (activeTrackIds.has(track.trackId) && !uniqueInstruments.has(track.instrument.id)) {
                uniqueInstruments.set(track.instrument.id, track.instrument);
            }
        });
        
        uniqueInstruments.forEach(inst => {
            const instDiv = document.createElement('div');
            instDiv.className = 'playing-instrument';
            instDiv.id = `playing-${inst.id}`;
            instDiv.innerHTML = `<span class="playing-instrument-name">${inst.name}:</span><span class="playing-notes">---</span>`;
            nowPlayingOutput.appendChild(instDiv);
            activeNotes.set(inst.name, new Set());
        });
        
        SimpleNotePlayer.play(tracksData, {
            onNoteOn: (instrument, trackName, noteName) => {
                const notesSet = activeNotes.get(instrument.name);
                if (notesSet) {
                    notesSet.add(noteName);
                    updateNowPlayingDisplay(instrument);
                }
            },
            onNoteOff: (instrument, trackName, noteName) => {
                const notesSet = activeNotes.get(instrument.name);
                if (notesSet) {
                    notesSet.delete(noteName);
                    updateNowPlayingDisplay(instrument);
                }
            },
            onPlaybackEnd: () => {
                nowPlayingOutput.innerHTML = '<h4>播放完成！</h4>';
                playPauseButton.textContent = '▶️';
                setTimeout(() => {
                    nowPlayingZone.hidden = true;
                    progressBar.value = 0;
                    timeProgress.textContent = '00:00 / 00:00';
                    noteProgress.textContent = '0 / 0';
                }, 1000);
            },
            onProgressUpdate: (progress) => {
                if (!isSeeking) {
                    progressBar.value = progress.totalTimeMs > 0 ? (progress.currentTimeMs / progress.totalTimeMs) * 1000 : 0;
                }
                totalDurationMsForSeek = progress.totalTimeMs;
                timeProgress.textContent = `${formatTime(progress.currentTimeMs)} / ${formatTime(progress.totalTimeMs)}`;
                noteProgress.textContent = `${progress.playedNotes} / ${progress.totalNotes}`;
            },
            onMute: (currentActiveIds) => {
                const allPlayingDivs = nowPlayingOutput.querySelectorAll('.playing-instrument');
                allPlayingDivs.forEach(div => {
                    const instId = div.id.split('-')[1];
                    let isMuted = true;
                    for (const track of currentTracksData) {
                        if (track.instrument.id == instId && currentActiveIds.has(track.trackId)) {
                            isMuted = false;
                            break;
                        }
                    }
                    if (isMuted) {
                        const notesSpan = div.querySelector('.playing-notes');
                        if (notesSpan) notesSpan.textContent = '---';
                    }
                });
            }
        }, activeTrackIds);
    }

    function updateNowPlayingDisplay(instrument) {
        const instId = `playing-${instrument.id}`;
        const instDiv = document.getElementById(instId);
        if (instDiv) {
            const notesSpan = instDiv.querySelector('.playing-notes');
            const notes = Array.from(activeNotes.get(instrument.name) || []);
            notesSpan.textContent = notes.length > 0 ? notes.join(', ') : '---';
        }
    }

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
                const newInst = { ...importedInst,
                    id: nextInstrumentId++
                };
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