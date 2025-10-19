document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const statusDiv = document.getElementById('status');
    const resultsContainer = document.getElementById('results-container');
    const resultsOutput = document.getElementById('results-output');
    const switcherOptions = document.querySelectorAll('.switcher-option');

    let polyphonicResult = null;
    let monophonicResult = null;

    // --- 事件监听 ---
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });

    // 更新事件监听器以适应新的切换器
    switcherOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            e.preventDefault();
            if (e.currentTarget.classList.contains('active')) return;

            switcherOptions.forEach(opt => opt.classList.remove('active'));
            e.currentTarget.classList.add('active');

            const selectedMode = e.currentTarget.getAttribute('data-mode');
            displayResults(selectedMode === 'poly' ? polyphonicResult : monophonicResult);
        });
    });

    // --- 核心处理函数 ---
    function handleFile(file) {
        if (!wasmReady) {
            statusDiv.textContent = '错误：Wasm 模块仍在加载中，请稍后再试。';
            return;
        }
        if (!file.type.includes('midi') && !file.name.endsWith('.mid')) {
            statusDiv.textContent = '错误：请上传一个有效的 MIDI 文件 (.mid, .midi)';
            return;
        }

        statusDiv.textContent = `正在处理文件: ${file.name}...`;
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
                
                // **设置默认显示为单音优先模式**
                document.querySelector('.switcher-option[data-mode="poly"]').classList.remove('active');
                document.querySelector('.switcher-option[data-mode="mono"]').classList.add('active');
                displayResults(monophonicResult);

                statusDiv.textContent = '处理完成！';

            } catch (error) {
                console.error('转换过程中发生错误:', error);
                statusDiv.textContent = `处理失败: ${error.message}`;
            }
        };
        reader.onerror = () => { statusDiv.textContent = '读取文件失败。'; };
        reader.readAsArrayBuffer(file);
    }

    function displayResults(resultData) {
        resultsOutput.innerHTML = ''; 

        if (resultData.error) {
            resultsOutput.innerHTML = `<p>${resultData.error}</p>`;
            resultsContainer.hidden = false;
            return;
        }

        for (const instrumentName in resultData) {
            const instrumentTracks = resultData[instrumentName];
            const instrumentDiv = document.createElement('div');
            instrumentDiv.className = 'instrument-block';
            instrumentDiv.innerHTML = `<h4>${instrumentName}</h4>`;
            
            instrumentTracks.forEach(track => {
                const durationInSeconds = (track.duration_ms / 1000).toFixed(2);
                
                const trackHTML = `
                    <div class="track-block">
                        <div class="track-header">
                            <strong>${track.track_name}</strong>
                            <div class="track-meta">
                                <span>音符数: ${track.note_count}</span>
                                <span>时长: ${durationInSeconds}s</span>
                            </div>
                        </div>
                        <textarea class="track-textarea" readonly>${track.notes_string}</textarea>
                    </div>
                `;
                instrumentDiv.innerHTML += trackHTML;
            });

            resultsOutput.appendChild(instrumentDiv);
        }

        resultsContainer.hidden = false;
    }
});