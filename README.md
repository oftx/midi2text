# MIDI to Simple Score Converter

This is a client-side web application that converts standard MIDI files (`.mid`, `.midi`) into a human-readable simple score format. The application features a built-in audio player that can play the converted or manually edited scores in real-time, supporting advanced features like live transposition, pause/resume, and progress control.

**Live Demo**: [midi2text.pages.dev](https://midi2text.pages.dev/)

## Features

- **MIDI to Text**: Converts MIDI files into a custom text-based score format (`NoteNameOctave/DurationInMilliseconds`).
- **Two Conversion Modes**:
  - **Monophonic Priority**: Optimizes for readability by prioritizing the main melody.
  - **Polyphonic**: Faithfully preserves all original tracks and concurrent notes.
- **Simple Score Player**: A standalone creative tool that allows you to:
  - Manually write or paste simple scores.
  - Create multiple tracks and assign different digital instruments to each.
  - Play and audition your compositions in real-time.
- **Advanced Playback Controls**:
  - **Real-time Play/Pause** and **Progress Bar Seeking**.
  - **Live Transposition**: Change the pitch of the music on the fly using a slider.
  - **Track Solo/Mute**: Enable or disable specific tracks during playback.
- **Instrument Management**:
  - Includes a variety of preset digital instruments (sine, square, triangle, sawtooth).
  - Supports adding and deleting custom instruments.
- **No Backend Required**: All file processing and audio synthesis happen entirely within the user's browser. No files are uploaded, ensuring user privacy.
- **Responsive Design**: The interface is designed to work on both desktop and mobile devices.

## Technology Stack

- **Core Conversion**: A WebAssembly port of the classic [midicsv](https://www.fourmilab.ch/webtools/midicsv/) tool, used to parse MIDI binary files into a CSV format.
- **Audio Engine**:
  - **Web Audio API**: Used for real-time synthesis of all musical notes.
  - **Web Worker**: Ensures that audio playback remains precise and stable even when the browser tab is in the background, avoiding throttling of the main thread.
- **Frontend Frameworks/Libraries**:
  - **Vanilla JavaScript (ES6+)**: Powers all application logic and user interactions.
  - **Pico.css**: Provides a lightweight, beautiful, and semantic CSS framework.
  - **Plain HTML5/CSS3**: Used for structuring the pages and custom styling.

## File Structure

```
midi2text/
├── css/
│   ├── pico.min.css         # Pico.css framework
│   └── style.css            # Custom application styles
├── js/
│   ├── main.js              # Main logic for the MIDI Converter page
│   ├── player_main.js       # Main logic for the Score Player page
│   ├── simple_note_player.js # Core audio player module (front-end)
│   ├── player_worker.js     # Background scheduler for the player (Web Worker)
│   ├── csv_to_simple_score.js # Logic for converting CSV to simple score format
│   ├── csvmidi.js           # JavaScript interface for the WebAssembly module
│   └── csvmidi.wasm         # The core WebAssembly conversion module
├── index.html               # The MIDI Converter page
└── player.html              # The Simple Score Player page
```

## Credits and Licensing

- The user interface, score conversion logic, and player code for this project were written for this application.
- The core MIDI-to-CSV conversion functionality is based on the [metavee/midi2csv](https://github.com/metavee/midi2csv) project, which is licensed under the `GPL-3.0` License.
- The interface styling uses [Pico.css](https://picocss.com/), which is licensed under the `MIT` License.