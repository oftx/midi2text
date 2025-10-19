const SimpleScoreGenerator = (() => {
    const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    function midi_to_note_name(note_number) {
        if (note_number < 0 || note_number > 127) return "InvalidNote";
        const octave = Math.floor(note_number / 12) - 1;
        const name = NOTE_NAMES[note_number % 12];
        return `${name}${octave}`;
    }

    function parse_midi_csv(csvString) {
        let ticks_per_quarter_note = 480;
        let microseconds_per_quarter_note = 500000;
        const open_notes = {};
        const instrument_notes = {};

        const lines = csvString.trim().split('\n');
        for (const line of lines) {
            const row = line.split(',').map(field => field.trim());
            if (row.length < 3) continue;

            const track = parseInt(row[0], 10);
            const time = parseInt(row[1], 10);
            const event_type = row[2];

            if (event_type === 'Header') {
                ticks_per_quarter_note = parseInt(row[5], 10);
            } else if (event_type === 'Tempo') { // Always take the first tempo
                 if (microseconds_per_quarter_note === 500000) {
                    microseconds_per_quarter_note = parseInt(row[3], 10);
                 }
            } else if (event_type === 'Note_on_c' && parseInt(row[5], 10) > 0) {
                const key = `${track}-${parseInt(row[3], 10)}-${parseInt(row[4], 10)}`;
                open_notes[key] = time;
            } else if (event_type === 'Note_off_c' || (event_type === 'Note_on_c' && parseInt(row[5], 10) === 0)) {
                const key = `${track}-${parseInt(row[3], 10)}-${parseInt(row[4], 10)}`;
                if (key in open_notes) {
                    const start_tick = open_notes[key];
                    delete open_notes[key];
                    if (time > start_tick) {
                        if (!instrument_notes[track]) instrument_notes[track] = [];
                        instrument_notes[track].push({ pitch: parseInt(row[4], 10), start_tick, end_tick: time });
                    }
                }
            }
        }
        return { instrument_notes, ticks_per_quarter_note, microseconds_per_quarter_note };
    }

    function generate_polyphonic_score(notes_list, ms_per_tick) {
        const sub_tracks = [];
        for (const note of notes_list) {
            let note_placed = false;
            for (const sub_track of sub_tracks) {
                if (sub_track.end_tick <= note.start_tick) {
                    const rest_ticks = note.start_tick - sub_track.end_tick;
                    if (rest_ticks > 0) {
                        const rest_ms = Math.round(rest_ticks * ms_per_tick);
                        if (rest_ms > 10) sub_track.notes.push(`@/${rest_ms}`);
                    }
                    const note_ms = Math.round((note.end_tick - note.start_tick) * ms_per_tick);
                    sub_track.notes.push(`${midi_to_note_name(note.pitch)}/${note_ms}`);
                    sub_track.end_tick = note.end_tick;
                    note_placed = true;
                    break;
                }
            }
            if (!note_placed) {
                const new_sub_track = { notes: [], end_tick: 0 };
                if (note.start_tick > 0) {
                    const rest_ms = Math.round(note.start_tick * ms_per_tick);
                    if (rest_ms > 10) new_sub_track.notes.push(`@/${rest_ms}`);
                }
                const note_ms = Math.round((note.end_tick - note.start_tick) * ms_per_tick);
                new_sub_track.notes.push(`${midi_to_note_name(note.pitch)}/${note_ms}`);
                new_sub_track.end_tick = note.end_tick;
                sub_tracks.push(new_sub_track);
            }
        }
        return sub_tracks;
    }

    function generate_monophonic_score(notes_list, ms_per_tick) {
        if (!notes_list || notes_list.length === 0) return [];

        const notes_by_start_time = new Map();
        for (const note of notes_list) {
            if (!notes_by_start_time.has(note.start_tick)) {
                notes_by_start_time.set(note.start_tick, []);
            }
            notes_by_start_time.get(note.start_tick).push(note);
        }
        
        const sorted_start_times = Array.from(notes_by_start_time.keys()).sort((a, b) => a - b);
        
        const main_track = { notes: [], end_tick: 0 };
        const chord_tracks = [];

        for (let i = 0; i < sorted_start_times.length; i++) {
            const start_tick = sorted_start_times[i];
            const notes_at_this_time = notes_by_start_time.get(start_tick);
            
            // --- Main Track ---
            const rest_ticks = start_tick - main_track.end_tick;
            if (rest_ticks > 0) {
                const rest_ms = Math.round(rest_ticks * ms_per_tick);
                if (rest_ms > 10) main_track.notes.push(`@/${rest_ms}`);
            }

            const main_note = notes_at_this_time[0];
            let effective_end_tick = main_note.end_tick;
            if (i + 1 < sorted_start_times.length) {
                const next_start_tick = sorted_start_times[i+1];
                if (effective_end_tick > next_start_tick) {
                    effective_end_tick = next_start_tick;
                }
            }
            
            const duration_ticks = effective_end_tick - main_note.start_tick;
            if (duration_ticks > 0) {
                const note_ms = Math.round(duration_ticks * ms_per_tick);
                main_track.notes.push(`${midi_to_note_name(main_note.pitch)}/${note_ms}`);
            }
            main_track.end_tick = effective_end_tick;

            // --- Chord Tracks ---
            if (notes_at_this_time.length > 1) {
                for (let j = 0; j < notes_at_this_time.length - 1; j++) {
                    const chord_note = notes_at_this_time[j + 1];
                    if (j >= chord_tracks.length) {
                        chord_tracks.push({ notes: [], end_tick: 0 });
                    }
                    const target_track = chord_tracks[j];

                    const chord_rest_ticks = chord_note.start_tick - target_track.end_tick;
                    if (chord_rest_ticks > 0) {
                        const rest_ms = Math.round(chord_rest_ticks * ms_per_tick);
                        if (rest_ms > 10) target_track.notes.push(`@/${rest_ms}`);
                    }

                    let chord_effective_end = chord_note.end_tick;
                    if (i + 1 < sorted_start_times.length) {
                         const next_start_tick = sorted_start_times[i+1];
                         if (chord_effective_end > next_start_tick) {
                            chord_effective_end = next_start_tick;
                         }
                    }
                    
                    const chord_duration_ticks = chord_effective_end - chord_note.start_tick;
                    if (chord_duration_ticks > 0) {
                        const note_ms = Math.round(chord_duration_ticks * ms_per_tick);
                        target_track.notes.push(`${midi_to_note_name(chord_note.pitch)}/${note_ms}`);
                    }
                    target_track.end_tick = chord_effective_end;
                }
            }
        }
        return [main_track, ...chord_tracks];
    }

    // Main public function
    function generate(csvString, { monophonic_mode = false } = {}) {
        const { instrument_notes, ticks_per_quarter_note, microseconds_per_quarter_note } = parse_midi_csv(csvString);

        if (Object.keys(instrument_notes).length === 0) {
            return { error: "未在文件中找到任何有效的音符事件。" };
        }
        
        const ms_per_tick = (microseconds_per_quarter_note / 1000) / ticks_per_quarter_note;
        const result_data = {};
        
        const sorted_tracks = Object.keys(instrument_notes).sort((a, b) => a - b);

        for (const instrument_track_num of sorted_tracks) {
            const instrument_key = `【乐器${instrument_track_num}】`;
            result_data[instrument_key] = [];

            let notes_list = instrument_notes[instrument_track_num];
            notes_list.sort((a, b) => a.start_tick - b.start_tick);
            
            const sub_tracks = monophonic_mode 
                ? generate_monophonic_score(notes_list, ms_per_tick)
                : generate_polyphonic_score(notes_list, ms_per_tick);

            sub_tracks.forEach((sub_track, i) => {
                if (sub_track.notes.length > 0) {
                    const note_count = sub_track.notes.filter(n => !n.startsWith('@')).length;
                    const duration_ms = Math.round(sub_track.end_tick * ms_per_tick);

                    result_data[instrument_key].push({
                        track_name: `Track${i + 1}`,
                        note_count: note_count,
                        duration_ms: duration_ms,
                        notes_string: sub_track.notes.join(' ')
                    });
                }
            });
        }
        return result_data;
    }

    return { generate };
})();