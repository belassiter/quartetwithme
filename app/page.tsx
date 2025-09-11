'use client';

import { useEffect, useRef, useState, useMemo } from "react";
import { OpenSheetMusicDisplay, IPlaybackListener } from "opensheetmusicdisplay";
import * as Tone from "tone";

export default function Home() {
  const sheetMusicContainerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const tempoRef = useRef<number | null>(null);
  const [tempo, setTempo] = useState(100);
  const [tempoMin, setTempoMin] = useState(50);
  const [tempoMax, setTempoMax] = useState(200);
  const playersRef = useRef<Tone.Players | null>(null);
  const pitchShiftRef = useRef<Tone.PitchShift | null>(null);
  const [windowSize, setWindowSize] = useState(0.1);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [mainAudioSrc, setMainAudioSrc] = useState<string>("/assets/take_it_all_away_EsQ.mp3");

  const instrumentMapRef = useRef<Map<string, number>>(new Map());
  const [mutedInstrument, setMutedInstrument] = useState<string | null>(null);

  const [noteSyncData, setNoteSyncData] = useState<any[]>([]);
  const animationFrameId = useRef<number | null>(null);
  const currentNoteIndex = useRef(0);

  const instrumentPlayAlongMap = useMemo(() => ({
    "Soprano": "/assets/take_it_all_away_playalong_soprano.mp3",
    "Alto": "/assets/take_it_all_away_playalong_alto.mp3",
    "Tenor": "/assets/take_it_all_away_playalong_tenor.mp3",
    "Bari": "/assets/take_it_all_away_playalong_bari.mp3",
    "Main": "/assets/take_it_all_away_EsQ.mp3"
  }), []);

  const handleTempoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newTempo = parseFloat(event.target.value);
    setTempo(newTempo);

    // Update transport BPM for cursor sync
    Tone.Transport.bpm.value = newTempo;

    if (playersRef.current && tempoRef.current && pitchShiftRef.current) {
      const originalTempo = tempoRef.current;
      const playbackRate = newTempo / originalTempo;

      // Update playback rate for all players
      Object.keys(instrumentPlayAlongMap).forEach(name => {
        const player = playersRef.current!.player(name);
        player.playbackRate = playbackRate;
      });

      // Update pitch shift to compensate
      const semitones = -12 * Math.log2(playbackRate);
      pitchShiftRef.current.pitch = semitones;
    }
  };

  const resetTempo = () => {
    if (tempoRef.current) {
      const event = {
        target: { value: tempoRef.current.toString() },
      } as React.ChangeEvent<HTMLInputElement>;
      handleTempoChange(event);
    }
  };

  const handleWindowSizeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseFloat(event.target.value);
    setWindowSize(newSize);
    if (pitchShiftRef.current) {
      pitchShiftRef.current.windowSize = newSize;
    }
  };

  const updateCursor = () => {
    const currentTicks = Tone.Transport.ticks;
    let nextNoteIndex = currentNoteIndex.current + 1;
    while (nextNoteIndex < noteSyncData.length && currentTicks >= noteSyncData[nextNoteIndex].ticks) {
      osmdRef.current?.cursor.next();
      currentNoteIndex.current = nextNoteIndex;
      nextNoteIndex++;
    }
    animationFrameId.current = requestAnimationFrame(updateCursor);
  };

  const togglePlayback = async () => {
    if (!isLoaded || !playersRef.current) return;

    if (isPlaying) {
      Tone.Transport.pause();
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    } else {
      await Tone.start();
      Tone.Transport.start();
      osmdRef.current?.cursor.show();
      currentNoteIndex.current = 0;
      osmdRef.current?.cursor.reset();
      animationFrameId.current = requestAnimationFrame(updateCursor);
    }
    setIsPlaying(!isPlaying);
  };

  const stop = () => {
    if (!isLoaded || !playersRef.current) return;

    Tone.Transport.stop();
    // Explicitly seek transport to the beginning.
    Tone.Transport.position = 0;

    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
    }
    osmdRef.current?.cursor.reset();
    osmdRef.current?.cursor.hide();
    currentNoteIndex.current = 0;
    setIsPlaying(false);
  };

  const handleMuteToggle = (instrumentName: string) => {
    if (!isLoaded) return;

    if (mutedInstrument === instrumentName) {
      setMutedInstrument(null);
    } else {
      setMutedInstrument(instrumentName);
    }
  };

  const prepareSyncData = (osmd: OpenSheetMusicDisplay) => {
    const allNotes: any[] = [];
    const timestamps = new Set<number>();
    const iterator = osmd.cursor.Iterator;
    const ppq = Tone.Transport.PPQ;

    while (!iterator.EndReached) {
        const timestamp = iterator.currentTimeStamp.RealValue;
        if (timestamp >= 0 && !timestamps.has(timestamp)) {
            let hasVisibleEntry = false;
            const voiceEntries = iterator.CurrentVoiceEntries;
            if (voiceEntries) {
                for (const voiceEntry of voiceEntries) {
                    if (voiceEntry.ParentVoice.Parent.Visible) {
                        hasVisibleEntry = true;
                        break;
                    }
                }
            }

            if (hasVisibleEntry) {
                const timeSignature = iterator.CurrentMeasure.ActiveTimeSignature;
                const quarterNotes = timestamp * timeSignature.Numerator * (4 / timeSignature.Denominator);
                const ticks = quarterNotes * ppq;
                allNotes.push({ timestamp, ticks });
                timestamps.add(timestamp);
            }
        }
        iterator.moveToNext();
    }
    
    setNoteSyncData(allNotes);
  };

  useEffect(() => {
    if (sheetMusicContainerRef.current && !osmdRef.current) {
      const container = sheetMusicContainerRef.current;
      const initOSMD = async () => {
        try {
          const osmd = new OpenSheetMusicDisplay(container, {
            autoResize: true,
            backend: "svg",
            drawTitle: true,
            followCursor: true,
          });
          osmdRef.current = osmd;

          await osmd.load("/assets/take_it_all_away_sax_quartet_SATB.mxl");

          if (osmd.Sheet?.Instruments) {
            osmd.Sheet.Instruments.forEach((instrument, index) => {
              let instrumentName: string;
              switch (index) {
                case 0: instrumentName = "Soprano"; break;
                case 1: instrumentName = "Alto"; break;
                case 2: instrumentName = "Tenor"; break;
                case 3: instrumentName = "Bari"; break;
                default: instrumentName = `Instrument ${index}`; break;
              }
              instrumentMapRef.current.set(instrumentName, instrument.Id);
            });
          }

          if (osmd.Sheet?.DefaultStartTempoInBpm) {
            const initialTempo = osmd.Sheet.DefaultStartTempoInBpm;
            tempoRef.current = initialTempo;
            setTempo(initialTempo);
            Tone.Transport.bpm.value = initialTempo;

            // Calculate and set dynamic slider range
            setTempoMin(Math.round(initialTempo * (2/3)));
            setTempoMax(Math.round(initialTempo * 1.15));
          }

          osmd.render();
          // Initial sync data preparation
          osmd.cursor.resetIterator();
          prepareSyncData(osmd);

          const pitchShift = new Tone.PitchShift({
            pitch: 0,
            // windowSize: 0.1 // Initial value
          }).toDestination();
          pitchShiftRef.current = pitchShift;

          const urls = Object.fromEntries(
            Object.entries(instrumentPlayAlongMap).map(([name, url]) => [name, new Tone.Buffer(url)])
          );

          playersRef.current = new Tone.Players(urls, () => {
            // When all players are loaded, sync and start them
            Object.keys(instrumentPlayAlongMap).forEach(name => {
              const player = playersRef.current!.player(name);
              player.sync().start(0);
              // Mute all except the main track initially
              if (name !== "Main") {
                player.mute = true;
              }
            });
            setIsLoaded(true);
            console.log("All audio files loaded.");
          }).connect(pitchShift);

          // Set initial cursor state
          osmd.cursor.reset();
          osmd.cursor.hide();

        } catch (err) {
          console.error("Error during OSMD initialization or MXL loading:", err);
        }
      };

      initOSMD().catch((err) => {
        console.error("Error initializing OSMD:", err);
      });
    }
  }, [instrumentPlayAlongMap]);

  useEffect(() => {
    if (!isLoaded || !playersRef.current || !osmdRef.current) return;

    // --- Mute Logic ---
    const playerToEnable = mutedInstrument ? mutedInstrument : "Main";
    Object.keys(instrumentPlayAlongMap).forEach(name => {
        const player = playersRef.current!.player(name);
        player.mute = (name !== playerToEnable);
    });

    // --- OSMD Visibility Logic ---
    osmdRef.current.Sheet.Instruments.forEach(inst => {
        if (mutedInstrument) {
            // If an instrument is soloed, only show that one
            const soloInstId = instrumentMapRef.current.get(mutedInstrument);
            inst.Visible = (inst.Id === soloInstId);
        } else {
            // Otherwise (main playback), show all instruments
            inst.Visible = true;
        }
    });

    osmdRef.current.render();

    // Force the cursor's internal iterator to be rebuilt from the new state
    osmdRef.current.cursor.resetIterator(); 

    // Re-calculate the sync data based on the new visibility
    prepareSyncData(osmdRef.current);

  }, [mutedInstrument, isLoaded]);

  useEffect(() => {
    return () => {
      if (osmdRef.current) {
        osmdRef.current.clear();
      }
      if (playersRef.current) {
        playersRef.current.dispose();
      }
      if (pitchShiftRef.current) {
        pitchShiftRef.current.dispose();
      }
      Tone.Transport.stop();
      setMutedInstrument(null);
    };
  }, []);

  return (
    <div>
      <div className="sticky top-0 z-10 p-4 bg-white flex justify-center border-b border-gray-300">
        <button onClick={togglePlayback} disabled={!isLoaded} className="ml-4 px-4 py-2 text-white bg-green-500 rounded hover:bg-green-700 disabled:bg-gray-400">
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button onClick={stop} disabled={!isLoaded} className="ml-4 px-4 py-2 text-white bg-red-500 rounded hover:bg-red-700 disabled:bg-gray-400">
          Stop
        </button>
        <div className="ml-4 flex items-center">
          <label htmlFor="tempo-slider" className="mr-2 text-black">Tempo:</label>
          <input
            id="tempo-slider"
            type="range"
            min={tempoMin}
            max={tempoMax}
            value={tempo}
            onChange={handleTempoChange}
            className="w-32"
          />
          <span className="ml-2 text-black">{tempo} BPM</span>
          <button onClick={resetTempo} className="ml-2 text-sm text-blue-500 hover:underline">(Reset)</button>
        </div>
        {/* Removed Audio Quality Slider */}
        {/* Instrument Mute Toggles */}
        <button
          onClick={() => handleMuteToggle("Soprano")}
          disabled={!isLoaded || isPlaying}
          className={`ml-4 px-4 py-2 rounded ${!isLoaded || isPlaying ? 'opacity-50 cursor-not-allowed' : (mutedInstrument === "Soprano" ? "bg-yellow-500 text-black" : "bg-gray-500 text-white hover:bg-gray-700")}`}
        >
          Soprano
        </button>
        <button
          onClick={() => handleMuteToggle("Alto")}
          disabled={!isLoaded || isPlaying}
          className={`ml-4 px-4 py-2 rounded ${!isLoaded || isPlaying ? 'opacity-50 cursor-not-allowed' : (mutedInstrument === "Alto" ? "bg-yellow-500 text-black" : "bg-gray-500 text-white hover:bg-gray-700")}`}
        >
          Alto
        </button>
        <button
          onClick={() => handleMuteToggle("Tenor")}
          disabled={!isLoaded || isPlaying}
          className={`ml-4 px-4 py-2 rounded ${!isLoaded || isPlaying ? 'opacity-50 cursor-not-allowed' : (mutedInstrument === "Tenor" ? "bg-yellow-500 text-black" : "bg-gray-500 text-white hover:bg-gray-700")}`}
        >
          Tenor
        </button>
        <button
          onClick={() => handleMuteToggle("Bari")}
          disabled={!isLoaded || isPlaying}
          className={`ml-4 px-4 py-2 rounded ${!isLoaded || isPlaying ? 'opacity-50 cursor-not-allowed' : (mutedInstrument === "Bari" ? "bg-yellow-500 text-black" : "bg-gray-500 text-white hover:bg-gray-700")}`}
        >
          Bari
        </button>
      </div>
      <audio ref={audioRef} src={mainAudioSrc} /> {/* Set initial src to mainAudioSrc */}
      <div className="flex justify-center p-4">
        <div ref={sheetMusicContainerRef} className="w-full" />
      </div>
    </div>
  );
}