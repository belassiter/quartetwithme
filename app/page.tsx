"use client";

import { useEffect, useRef, useState } from "react";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

export default function Home() {
  const sheetMusicContainerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const tempoRef = useRef<number | null>(null);
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

  const handleMuteToggle = (instrumentName: string) => {
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

    if (mutedInstrument === instrumentName) {
      // Unmuting the current instrument
      setMutedInstrument(null);
      audio.src = mainAudioSrc; // Switch back to main audio
      osmd.PlaybackManager.volumeUnmute(instrumentId); // Unmute in OSMD
      console.log(`Unmuted ${instrumentName}. Audio source set to: ${audio.src}`);
    } else {
      // Muting a new instrument
      if (mutedInstrument !== null) {
        // Unmute previously muted instrument first
        const prevMutedId = instrumentMapRef.current.get(mutedInstrument);
        if (prevMutedId !== undefined) {
          osmd.PlaybackManager.volumeUnmute(prevMutedId);
          console.log(`Unmuted previous instrument: ${mutedInstrument}`);
        }
      }
      setMutedInstrument(instrumentName);
      audio.src = instrumentPlayAlongMap[instrumentName]; // Switch to play-along audio
      osmd.PlaybackManager.volumeMute(instrumentId); // Mute in OSMD
      console.log(`Muted ${instrumentName}. Audio source set to: ${audio.src}`);
    }

    // Re-initialize OSMD PlaybackManager after changing audio source
    // This is crucial to refresh its internal references to the audio element
    osmd.PlaybackManager.initialize(osmd.Sheet.MusicPartManager);

    // If it was playing, restart playback from current position
    if (wasPlaying) {
      // We need to ensure the audio is ready before playing
      // A small timeout or listening for 'canplay' event might be needed
      // For now, let's try a simple play
      audio.play().catch(e => console.error("Audio play failed after mute toggle:", e));
      osmd.PlaybackManager.play(); // Restart OSMD playback
      setIsPlaying(true); // Update state
    }
  };

  useEffect(() => {
    if (sheetMusicContainerRef.current && !osmdRef.current) {
      const initOSMD = async () => {
        const { OpenSheetMusicDisplay, LinearTimingSource, PlaybackManager, BasicAudioPlayer } = await import("opensheetmusicdisplay");

        const osmd = new OpenSheetMusicDisplay(sheetMusicContainerRef.current, {
          autoResize: true,
          backend: "svg",
          drawTitle: true,
          followCursor: true, // Enable auto-scrolling
        });
        osmdRef.current = osmd;

        // Initialize Web Audio API components here
        const audio = audioRef.current;
        if (audio) {
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
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

        const timingSource = new LinearTimingSource();
        const playbackManager = new PlaybackManager(timingSource, undefined, new BasicAudioPlayer(), undefined);
        osmd.PlaybackManager = playbackManager;
        osmd.PlaybackManager.DoPlayback = true;

        await osmd.load("/assets/take_it_all_away_sax_quartet_SATB.mxl");

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
        if (osmd.sheet?.SourceMeasures) {
          for (const staffline of osmd.sheet.SourceMeasures) {
            if (staffline.VerticalSourceStaffEntries) {
              for (const staffEntry of staffline.VerticalSourceStaffEntries) {
                if (staffEntry.Directions) {
                  for (const direction of staffEntry.Directions) {
                    if (direction.Metronome) {
                      tempoRef.current = direction.Metronome.TempoInBpm;
                      console.log(`Found Tempo: ${tempoRef.current} BPM`);
                      break; // Assuming we only need the first tempo marking
                    }
                  }
                }
                if (tempoRef.current) break;
              }
            }
            if (tempoRef.current) break;
          }
        }

        osmd.PlaybackManager.initialize(osmd.Sheet.MusicPartManager);
        osmd.PlaybackManager.timingSource.Settings = osmd.Sheet.SheetPlaybackSetting;

        osmd.render();
        osmd.PlaybackManager.addListener(osmd.cursor);

        // Custom Playback Listener
        class MyPlaybackListener implements IPlaybackListener {
          private offsetRef: React.MutableRefObject<number>; // Added offsetRef

          constructor(offsetRef: React.MutableRefObject<number>) { // Constructor now accepts offsetRef
            this.offsetRef = offsetRef;
          }

          cursorPositionChanged() { }
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
          }
          metronomeSoundOccurred() { }
          soundLoaded() { }
          allSoundsLoaded() { }
        }
        osmd.PlaybackManager.addListener(new MyPlaybackListener(offsetRef)); // Pass offsetRef

        if (audioRef.current) {
          audioRef.current.addEventListener("timeupdate", () => {
            const osmd = osmdRef.current;
            const audio = audioRef.current;
            if (!osmd || !audio || !tempoRef.current) return;

            const targetMs = (audio.currentTime - offsetRef.current) * 1000; // Use offsetRef.current
            osmd.PlaybackManager.setPlaybackStart(targetMs);
          });
        }

        setIsLoaded(true);
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
        {/* Instrument Mute Toggles */}
        <button
          onClick={() => handleMuteToggle("Soprano")}
          disabled={!isLoaded}
          className={`ml-4 px-4 py-2 rounded ${mutedInstrument === "Soprano" ? "bg-yellow-500 text-black" : "bg-gray-500 text-white hover:bg-gray-700"}`}
        >
          Soprano
        </button>
        <button
          onClick={() => handleMuteToggle("Alto")}
          disabled={!isLoaded}
          className={`ml-4 px-4 py-2 rounded ${mutedInstrument === "Alto" ? "bg-yellow-500 text-black" : "bg-gray-500 text-white hover:bg-gray-700"}`}
        >
          Alto
        </button>
        <button
          onClick={() => handleMuteToggle("Tenor")}
          disabled={!isLoaded}
          className={`ml-4 px-4 py-2 rounded ${mutedInstrument === "Tenor" ? "bg-yellow-500 text-black" : "bg-gray-500 text-white hover:bg-gray-700"}`}
        >
          Tenor
        </button>
        <button
          onClick={() => handleMuteToggle("Bari")}
          disabled={!isLoaded}
          className={`ml-4 px-4 py-2 rounded ${mutedInstrument === "Bari" ? "bg-yellow-500 text-black" : "bg-gray-500 text-white hover:bg-gray-700"}`}
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
