
document.addEventListener('DOMContentLoaded', () => {
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
    
    let trackCounter = 0;
    let instruments = [
        { id: 1, name: '圆润三角波', waveform: 'triangle' },
        { id: 2, name: '复古方波', waveform: 'square' }
    ];
    let nextInstrumentId = 3;
    const activeNotes = new Map();
    let finalHideTimer = null;

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
            if (currentVal) {
                select.value = currentVal;
            }
        });
    }

    function addNewTrack() {
        trackCounter++;
        const trackId = trackCounter;
        
        const trackBlock = document.createElement('article');
        trackBlock.className = 'track-block';
        trackBlock.id = `track-${trackId}`;
        trackBlock.style.marginTop = '1.5rem';

        const header = document.createElement('div');
        header.className = 'grid';
        
        const selectContainer = document.createElement('div');
        const selectLabel = document.createElement('label');
        selectLabel.textContent = `轨道 ${trackId} - 乐器`;
        const select = document.createElement('select');
        select.className = 'instrument-select';
        select.id = `instrument-select-${trackId}`;
        selectContainer.appendChild(selectLabel);
        selectContainer.appendChild(select);

        const textarea = document.createElement('textarea');
        textarea.placeholder = '在此输入简单乐谱, 例如: C4/500 D4/500 E4/500';
        textarea.style.height = '120px';
        
        const deleteButton = document.createElement('button');
        deleteButton.textContent = '删除此轨道';
        deleteButton.className = 'secondary outline';
        deleteButton.onclick = () => trackBlock.remove();

        header.appendChild(selectContainer);
        trackBlock.appendChild(header);
        trackBlock.appendChild(textarea);
        trackBlock.appendChild(deleteButton);
        
        tracksContainer.appendChild(trackBlock);
        updateAllTrackInstrumentSelects();
    }

    function playAll() {
        const tracksToPlay = [];
        const trackBlocks = document.querySelectorAll('.track-block');
        
        trackBlocks.forEach(block => {
            const instrumentId = parseInt(block.querySelector('.instrument-select').value, 10);
            const notesString = block.querySelector('textarea').value;
            const selectedInstrument = instruments.find(i => i.id === instrumentId);

            if (notesString.trim() && selectedInstrument) {
                tracksToPlay.push({
                    instrument: { name: selectedInstrument.name, waveform: selectedInstrument.waveform },
                    trackName: `Track ${block.id.split('-')[1]}`,
                    notesString: notesString
                });
            }
        });

        if (tracksToPlay.length > 0) {
            startPlayback(tracksToPlay);
        } else {
            alert("没有可播放的轨道。请添加轨道、选择乐器并输入乐谱。");
        }
    }

    function startPlayback(tracksData) {
        if (finalHideTimer) {
            clearTimeout(finalHideTimer);
            finalHideTimer = null;
        }

        nowPlayingZone.hidden = false;
        nowPlayingOutput.innerHTML = '';
        activeNotes.clear();
        const uniqueInstruments = [...new Set(tracksData.map(t => t.instrument.name))];
        
        uniqueInstruments.forEach(instName => {
            const instDiv = document.createElement('div');
            instDiv.className = 'playing-instrument';
            instDiv.id = `playing-${instName.replace(/[^a-zA-Z0-9]/g, '')}`;
            instDiv.innerHTML = `<span class="playing-instrument-name">${instName}:</span><span class="playing-notes">---</span>`;
            nowPlayingOutput.appendChild(instDiv);
            activeNotes.set(instName, new Set());
        });
        
        SimpleNotePlayer.play(tracksData, {
            onNoteOn: (instrument, trackName, noteName) => {
                const notesSet = activeNotes.get(instrument);
                if (notesSet) {
                    notesSet.add(noteName);
                    updateNowPlayingDisplay(instrument);
                }
            },
            onNoteOff: (instrument, trackName, noteName) => {
                 const notesSet = activeNotes.get(instrument);
                if (notesSet) {
                    notesSet.delete(noteName);
                    updateNowPlayingDisplay(instrument);
                }
            },
            onPlaybackEnd: () => {
                nowPlayingOutput.innerHTML = '<h4>播放完成！</h4>';

                finalHideTimer = setTimeout(() => {
                    nowPlayingZone.hidden = true;
                    finalHideTimer = null;
                }, 1000);
            }
        });
    }

    function updateNowPlayingDisplay(instrumentName) {
        const instId = `playing-${instrumentName.replace(/[^a-zA-Z0-9]/g, '')}`;
        const instDiv = document.getElementById(instId);
        if (instDiv) {
            const notesSpan = instDiv.querySelector('.playing-notes');
            const notes = Array.from(activeNotes.get(instrumentName) || []);
            notesSpan.textContent = notes.length > 0 ? notes.join(', ') : '---';
        }
    }

    playAllButton.addEventListener('click', playAll);
    stopButton.addEventListener('click', () => {
        SimpleNotePlayer.stop();
        nowPlayingZone.hidden = true;
    });
    addTrackButton.addEventListener('click', addNewTrack);
    manageInstrumentsButton.addEventListener('click', () => instrumentModal.showModal());
    closeModalButton.addEventListener('click', () => instrumentModal.close());
    addInstrumentForm.addEventListener('submit', saveInstrument);

    addNewTrack();
    renderInstruments();
});