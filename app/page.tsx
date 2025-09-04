"use client";

import { useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay, IPlaybackListener, IAudioMetronomePlayer, Fraction, PlaybackManager, BasicAudioPlayer, LinearTimingSource, PlaybackState } from "opensheetmusicdisplay";

export default function Home() {
  const sheetMusicContainerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);
    const tempoRef = useRef<number | null>(null);
  const [tempo, setTempo] = useState(100); // New state for tempo, initialized to a default
  const offsetRef = useRef(0); // Re-introducing offsetRef
  const [offset, setOffset] = useState(0);
  const audioTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // New refs for Web Audio API components
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null); // New GainNode ref

  // Flag to ensure offset analysis runs only once
  const offsetAnalysisPerformedRef = useRef(false);

  // Instrument related states and refs
  const instrumentMapRef = useRef<Map<string, number>>(new Map()); // Map instrument name to OSMD instrument ID
  const [mutedInstrument, setMutedInstrument] = useState<string | null>(null);

  const instrumentPlayAlongMap: { [key: string]: string } = {
    "Soprano": "/assets/take_it_all_away_playalong_soprano.mp3",
    "Alto": "/assets/take_it_all_away_playalong_alto.mp3",
    "Tenor": "/assets/take_it_all_away_playalong_tenor.mp3",
    "Bari": "/assets/take_it_all_away_playalong_bari.mp3",
  };
  const mainAudioSrc = "/assets/take_it_all_away_EsQ.mp3";

  const handleTempoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newTempo = parseFloat(event.target.value);
    setTempo(newTempo);

    const osmd = osmdRef.current;
    const audio = audioRef.current;

    if (osmd && audio) {
      // Update audio playback rate
      const originalTempo = tempoRef.current || 100; // Use 100 as a fallback if original tempo not found
      const playbackRate = newTempo / originalTempo;
      audio.playbackRate = playbackRate;
      console.log(`Audio playback rate set to: ${playbackRate} (New Tempo: ${newTempo}, Original Tempo: ${originalTempo})`);

      // Attempt to update OSMD playback tempo
      // Pause and reset PlaybackManager, then set new BPM and play
      const wasPlaying = isPlaying; // Store current playing state
      if (wasPlaying) {
        osmd.PlaybackManager.pause();
      }

      osmd.PlaybackManager.timingSource.setBpm(newTempo);

      if (wasPlaying) {
        osmd.PlaybackManager.play();
      }
      console.log(`Tempo changed via slider: ${newTempo} BPM. OSMD PlaybackManager re-configured.`);
    }
  };

  const togglePlayback = () => {
    const osmd = osmdRef.current;
    const audio = audioRef.current;

    if (!osmd || !audio || !isLoaded) return;

    if (isPlaying) {
      osmd.PlaybackManager.pause();
      audio.pause();
    } else {
      // Resume AudioContext on user interaction (always needed for playback)
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      osmd.PlaybackManager.play();
      console.log(`Playback started. Current tempo (from state): ${tempo} BPM`);
      console.log(`Playback started. Current audio playback rate: ${audio.playbackRate}`);
    }
    setIsPlaying(!isPlaying);
  };

  const stop = () => {
    const osmd = osmdRef.current;
    const audio = audioRef.current;

    if (!osmd || !audio) return;

    osmd.PlaybackManager.pause();
    osmd.PlaybackManager.reset();
    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
    // setMutedInstrument(null); // Removed: Retain selected track
    // audio.src = mainAudioSrc; // Removed: Retain selected track
    console.log(`Stop: Audio source retained: ${audio.src}`); // Updated log message
  };

  // New function for silent offset analysis
  const performOffsetAnalysis = () => {
    const audio = audioRef.current;
    const audioContext = audioContextRef.current;
    const analyser = analyserRef.current;
    const source = sourceNodeRef.current;
    const gainNode = gainNodeRef.current;

    if (!audio || !audioContext || !analyser || !source || !gainNode || offsetAnalysisPerformedRef.current) return;

    // Resume AudioContext on user interaction (needed for analysis)
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    // Set gain to 0 for silent analysis
    gainNode.gain.value = 0;

    analyser.fftSize = 2048;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    let soundDetected = false;
    const threshold = 10; // Adjust this value (0-255) based on your audio's silence level

    const analyzeAudio = () => {
      // Only continue if analysis is still needed
      if (!offsetAnalysisPerformedRef.current) {
        requestAnimationFrame(analyzeAudio);
      }

      analyser.getByteTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += Math.abs(dataArray[i] - 128);
      }
      const averageAmplitude = sum / bufferLength;

      if (averageAmplitude > threshold && !soundDetected) {
        soundDetected = true;
        const detectedOffset = audio.currentTime;
        setOffset(detectedOffset); // Update state for UI
        offsetRef.current = detectedOffset; // Update ref for listeners
        console.log(`Detected sound start at: ${detectedOffset} seconds`);

        // Stop analysis and audio playback
        audio.pause();
        // Set gain back to 1 for audible playback
        gainNode.gain.value = 1;
        offsetAnalysisPerformedRef.current = true; // Mark analysis as complete
      }
    };

    // Start audio playback and analysis
    audio.currentTime = 0; // Ensure it starts from the beginning for analysis
    audio.play().catch(e => console.error("Audio play failed for analysis:", e));
    analyzeAudio();

    // Timeout to stop analysis if no sound is detected within a reasonable time
    setTimeout(() => {
      if (!soundDetected && !offsetAnalysisPerformedRef.current) {
        console.warn("Sound not detected within timeout. Stopping analysis.");
        audio.pause();
        // Set gain back to 1 even if no sound detected
        gainNode.gain.value = 1;
        offsetAnalysisPerformedRef.current = true; // Mark analysis as complete
      }
    }, 15000); // 15 seconds timeout
  };

    const handleMuteToggle = async (instrumentName: string) => {
    const osmd = osmdRef.current;
    const audio = audioRef.current;
    if (!osmd || !audio || !isLoaded) return;

    const instrumentId = instrumentMapRef.current.get(instrumentName);
    if (instrumentId === undefined) {
      console.warn(`Instrument ID not found for ${instrumentName}`);
      return;
    }

    // Pause everything before changing audio source
    const wasPlaying = isPlaying;
    if (wasPlaying) {
      osmd.PlaybackManager.pause();
      audio.pause();
      setIsPlaying(false); // Update state immediately
    }

    // Store the current audio time before changing src
    const currentAudioTime = audio.currentTime;

    if (mutedInstrument === instrumentName) {
      // Unmuting the current instrument: show all parts and play main audio
      setMutedInstrument(null);
      audio.src = mainAudioSrc;
      osmd.Sheet.Instruments.forEach(inst => {
        inst.Visible = true;
      });
      osmd.render();
    } else {
      // Muting a new instrument: show only the selected instrument's part and play its audio
      if (mutedInstrument !== null) {
        const prevMutedId = instrumentMapRef.current.get(mutedInstrument);
        if (prevMutedId !== undefined) {
          osmd.PlaybackManager.volumeUnmute(prevMutedId);
        }
      }
      setMutedInstrument(instrumentName);
      audio.src = instrumentPlayAlongMap[instrumentName];
      osmd.Sheet.Instruments.forEach(inst => {
        if (inst.Id === instrumentId) {
          inst.Visible = true;
          osmd.PlaybackManager.volumeUnmute(inst.Id);
        } else {
          inst.Visible = false;
          osmd.PlaybackManager.volumeMute(inst.Id);
        }
      });
      osmd.render();
    }

    // Re-initialize OSMD PlaybackManager after changing audio source
    osmd.PlaybackManager.initialize(osmd.Sheet.MusicPartManager);
    // Re-apply current tempo after re-initialization
    osmd.PlaybackManager.timingSource.setBpm(tempo);

    // If it was playing, restart playback from current position
    if (wasPlaying) {
      // Listen for 'canplaythrough' event before playing and syncing
      const handleCanPlayThrough = () => {
        audio.removeEventListener('canplaythrough', handleCanPlayThrough); // Remove listener to prevent multiple calls

        // Set audio currentTime back to where it was before src change, adjusted by offset
        audio.currentTime = currentAudioTime;

        audio.play().catch(e => console.error("Audio play failed after mute toggle:", e));

        // Re-sync OSMD playback manager with the new audio time
        const targetMs = (audio.currentTime - offsetRef.current) * 1000;
        osmd.PlaybackManager.setPlaybackStart(new Fraction(targetMs, 1));
        osmd.PlaybackManager.play();
        setIsPlaying(true);
      };

      audio.addEventListener('canplaythrough', handleCanPlayThrough);
      audio.load(); // Explicitly load the new audio source
    }
  };

  useEffect(() => {
        if (sheetMusicContainerRef.current && !osmdRef.current) {
      const container = sheetMusicContainerRef.current;
      const initOSMD = async () => {
        console.log("initOSMD called");
        try {
                class DummyMetronomePlayer implements IAudioMetronomePlayer {
          play(bpm: number): void {}
          stop(): void {}
          getVolume(): number { return 0; }
          setVolume(volume: number): void {}
          playFirstBeatSample(): void {}
          playBeatSample(): void {}
        }
        const timingSource = new LinearTimingSource();
                                const playbackManager = new PlaybackManager(timingSource, new DummyMetronomePlayer(), new BasicAudioPlayer(), { MessageOccurred: null });

        const osmd = new OpenSheetMusicDisplay(container, {
          autoResize: true,
          backend: "svg",
          drawTitle: true,
          followCursor: true, // Enable auto-scrolling
        });
        osmdRef.current = osmd;

        // Initialize Web Audio API components here
        const audio = audioRef.current;
        if (audio) {
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext || (window as any).mozAudioContext || (window as any).oAudioContext || (window as any).msAudioContext)();
          const source = audioContext.createMediaElementSource(audio);
          const analyser = audioContext.createAnalyser();
          const gainNode = audioContext.createGain(); // Create GainNode

          analyser.fftSize = 2048;

          // Connect for audible playback
          source.connect(analyser);
          analyser.connect(gainNode); // Connect analyser to gainNode
          gainNode.connect(audioContext.destination); // Connect gainNode to destination

          // Store in refs for later use
          audioContextRef.current = audioContext;
          analyserRef.current = analyser;
          sourceNodeRef.current = source;
          gainNodeRef.current = gainNode; // Store gainNode in ref
        }

                                osmd.PlaybackManager = playbackManager;
        osmd.PlaybackManager.DoPlayback = true;

        console.log("Attempting to load MXL file:", "/assets/take_it_all_away_sax_quartet_SATB.mxl");
        await osmd.load("/assets/take_it_all_away_sax_quartet_SATB.mxl");
        console.log("MXL file loaded successfully.");

        // Populate instrumentMapRef
        if (osmd.Sheet?.Instruments) {
          osmd.Sheet.Instruments.forEach((instrument, index) => {
            // Assuming a consistent order or a way to map names to IDs
            // For SATB, we might need to rely on the order or a specific property
            // Let's try to map based on common names or index for now
            let instrumentName: string;
            switch (index) {
              case 0: instrumentName = "Soprano"; break;
              case 1: instrumentName = "Alto"; break;
              case 2: instrumentName = "Tenor"; break;
              case 3: instrumentName = "Bari"; break;
              default: instrumentName = `Instrument ${index}`; break;
            }
            instrumentMapRef.current.set(instrumentName, instrument.Id); // Assuming instrument.Id is the correct ID for PlaybackManager
            console.log(`Mapped instrument: ${instrumentName} to ID: ${instrument.Id}`);
          });
        }

        // Extract tempo
        if (osmd.Sheet?.DefaultStartTempoInBpm) {
          tempoRef.current = osmd.Sheet.DefaultStartTempoInBpm;
          console.log(`Found Tempo (from MXL): ${tempoRef.current} BPM`);
        }

                osmd.PlaybackManager.initialize(osmd.Sheet.MusicPartManager);
        osmd.PlaybackManager.timingSource.Settings = osmd.Sheet.SheetPlaybackSetting;

        // Set initial tempo for PlaybackManager after initialization
        if (tempoRef.current) {
          osmd.PlaybackManager.timingSource.setBpm(tempoRef.current);
          setTempo(tempoRef.current); // Set tempo state here after PlaybackManager is initialized
          console.log("Tempo state updated to (after MXL load):", tempoRef.current);
        } // Closing brace for if (tempoRef.current)

        osmd.render();
        osmd.PlaybackManager.addListener(osmd.cursor);

        // Custom Playback Listener
        class MyPlaybackListener implements IPlaybackListener {
          private offsetRef: React.MutableRefObject<number>;
          private osmdRef: React.MutableRefObject<OpenSheetMusicDisplay | null>;
          private tempoRef: React.MutableRefObject<number | null>;
          private lastMeasureNumber: number = -1; // New property to track the last measure logged

          constructor(
            offsetRef: React.MutableRefObject<number>,
            osmdRef: React.MutableRefObject<OpenSheetMusicDisplay | null>,
            tempoRef: React.MutableRefObject<number | null>
          ) {
            this.offsetRef = offsetRef;
            this.osmdRef = osmdRef;
            this.tempoRef = tempoRef;
          }

          cursorPositionChanged() {
            console.log("cursorPositionChanged called!"); // Simple log to see if it's triggered
            if (this.osmdRef.current) {
              const osmd = this.osmdRef.current;
              const playbackManager = osmd.PlaybackManager;

              // Check if playbackManager is available and actively playing
              if (playbackManager && playbackManager.RunningState === PlaybackState.Running) {
                // Now check if currentMeasure and tempo are available
                if (playbackManager.CursorIterator?.CurrentMeasure && playbackManager.currentBPM) {
                  const currentMeasure = playbackManager.CursorIterator.CurrentMeasure.MeasureNumber;
                  const currentBpm = this.tempoRef.current;

                  console.log(`Debug: currentMeasure = ${currentMeasure}, lastMeasureNumber = ${this.lastMeasureNumber}`);

                  if (currentMeasure !== this.lastMeasureNumber) {
                    console.log(`--- Measure Start --- Measure: ${currentMeasure}, Current Playback BPM: ${currentBpm}`);
                    this.lastMeasureNumber = currentMeasure;
                  }
                } else {
                  console.log("Debug: playbackManager.iterator.currentMeasure or playbackManager.tempo are null/undefined (while playing).");
                }
              } else {
                console.log("Debug: PlaybackManager is not available or not playing.");
              }
            } else {
              console.log("Debug: osmdRef.current is null/undefined.");
            }
          }
          pauseOccurred() { }
          selectionEndReached() { }
          resetOccurred() { }
          notesPlaybackEventOccurred() {
            const audio = audioRef.current;
            if (audio && !audio.paused) {
              // Audio is already playing, do nothing
            } else if (audio) {
              audio.currentTime = this.offsetRef.current; // Use offsetRef.current
              audio.play();
            }

            // This log is already here, it logs for each note, which is fine.
            // The new log in cursorPositionChanged will be for measure starts.
            // if (this.osmdRef.current && this.osmdRef.current.cursor.currentMeasure) {
            //   console.log(`Note Playback - Measure: ${this.osmdRef.current.cursor.currentMeasure.measureNumber}, Tempo: ${this.tempoRef.current} BPM`);
            // }
          }
          metronomeSoundOccurred() { }
          soundLoaded() { }
          allSoundsLoaded() { }
        }
        osmd.PlaybackManager.addListener(new MyPlaybackListener(offsetRef, osmdRef, tempoRef));

        // Removed audio.current.addEventListener("timeupdate", ...) block

        setIsLoaded(true);
        console.log("OSMD and audio components loaded. Current tempo state:", tempo);
      } catch (err) {
        console.error("Error during OSMD initialization or MXL loading:", err);
      }
    };

      initOSMD().catch((err) => {
        console.error("Error initializing OSMD:", err);
      });
    }
  }, []);

  // Cleanup for Web Audio API components when component unmounts
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
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
        <button onClick={performOffsetAnalysis} disabled={!isLoaded || offsetAnalysisPerformedRef.current} className="ml-4 px-4 py-2 text-white bg-blue-500 rounded hover:bg-blue-700 disabled:bg-gray-400">
          Get Offset
        </button>
        <input
          type="number"
          value={offset}
          onChange={(e) => {
            const newOffset = parseFloat(e.target.value);
            setOffset(newOffset); // Update state for UI
            offsetRef.current = newOffset; // Update ref for listeners
          }}
          step="0.1"
          className="ml-4 px-2 py-1 border rounded w-24 text-black"
          placeholder="Offset (s)"
        />
        <div className="ml-4 flex items-center">
          <label htmlFor="tempo-slider" className="mr-2 text-black">Tempo:</label>
          <input
            id="tempo-slider"
            type="range"
            min="50"
            max="200"
            value={tempo}
            onChange={handleTempoChange}
            className="w-32"
          />
          <span className="ml-2 text-black">{tempo} BPM</span>
        </div>
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
