'use client';

import { useEffect, useRef, useState, useMemo } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import * as Tone from "tone";
import SongSelectionModal from "./components/SongSelectionModal";
import { Song } from "./interfaces/Song";
import LoadingSpinner from "./components/LoadingSpinner";

interface NoteSyncData {
  timestamp: number;
  ticks: number;
}

// Helper for sorting instrument parts
const instrumentOrder: { [key: string]: number } = { "Soprano": 1, "Alto": 2, "Tenor": 3, "Bari": 4 };

const sortInstrumentParts = (a: string, b: string): number => {
  const aBase = a.split(' ')[0];
  const bBase = b.split(' ')[0];
  const aOrder = instrumentOrder[aBase] || 5;
  const bOrder = instrumentOrder[bBase] || 5;

  if (aOrder !== bOrder) {
    return aOrder - bOrder;
  }
  return a.localeCompare(b, undefined, { numeric: true });
};

export default function Home() {
  // Refs
  const sheetMusicContainerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const playersRef = useRef<Tone.Players | null>(null);
  const metronomePlayerRef = useRef<Tone.Player | null>(null);
  const pitchShiftRef = useRef<Tone.PitchShift | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const currentNoteIndex = useRef(0);
  const tempoRef = useRef<number | null>(null);
  const instrumentMapRef = useRef<Map<string, number>>(new Map());

  // State
  const [songs, setSongs] = useState<Song[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [tempo, setTempo] = useState(100);
  const [tempoMin, setTempoMin] = useState(50);
  const [tempoMax, setTempoMax] = useState(200);
  const [mutedInstrument, setMutedInstrument] = useState<string | null>(null);
  const [noteSyncData, setNoteSyncData] = useState<NoteSyncData[]>([]);

  // Derived State
  const instrumentParts = useMemo(() => {
    if (!currentSong?.instruments) return [];
    return Object.keys(currentSong.instruments)
      .filter(name => name !== 'Main')
      .sort(sortInstrumentParts);
  }, [currentSong]);

  const instrumentPlayAlongMap = useMemo(() => {
    if (!currentSong || !currentSong.instruments) return {};
    return currentSong.instruments;
  }, [currentSong]);

  // Fetch song list
  useEffect(() => {
    fetch('/songs-data.json')
      .then(res => res.json())
      .then((data: Song[]) => {
        setSongs(data);
        const defaultSong = data.find(song => song.name === "Take It All Away");
        if (defaultSong) {
          setCurrentSong(defaultSong);
        } else if (data.length > 0) {
          setCurrentSong(data[0]);
        }
      })
      .catch(err => console.error("Failed to load songs data:", err));
  }, []);

  // Main loading effect
  useEffect(() => {
    if (!currentSong || !sheetMusicContainerRef.current) {
      console.log("useEffect: currentSong or sheetMusicContainerRef.current is null, skipping load.");
      return;
    }

    console.log("useEffect: currentSong changed to", currentSong.name, ". Starting load process.");
    playersRef.current?.dispose();
    pitchShiftRef.current?.dispose();
    setIsLoaded(false); // <-- Spinner should show here
    console.log("Loading started: isLoaded = false");
    osmdRef.current?.clear(); // Moved after setIsLoaded(false)

    const container = sheetMusicContainerRef.current;

    const init = async () => {
      try {
        const osmd = new OpenSheetMusicDisplay(container, { autoResize: true, backend: "svg", drawTitle: true, followCursor: true });
        osmdRef.current = osmd;

        metronomePlayerRef.current = new Tone.Player({ url: "/assets/250552__druminfected__metronome.mp3", volume: -2 }).toDestination();

        const players: { [key: string]: InstanceType<typeof Tone.Buffer> } = {};
        const bufferPromises = Object.entries(currentSong.instruments)
          .filter(([, url]) => url)
          .map(([, url]) => {
            return new Promise((resolve, reject) => {
              const buffer = new Tone.Buffer(url as string, () => resolve(buffer), () => reject(new Error(`Failed to load: ${url}`)));
            });
          });
        
        const loadedBuffers = await Promise.all(bufferPromises);
        const instrumentEntries = Object.entries(currentSong.instruments).filter(([, url]) => url);

        instrumentEntries.forEach(([name], index) => {
            if(loadedBuffers[index]) {
                players[name] = loadedBuffers[index] as InstanceType<typeof Tone.Buffer>;
            }
        });

        if (Object.keys(players).length > 0) {
          playersRef.current = new Tone.Players(players);
          const pitchShift = new Tone.PitchShift({ pitch: 0 });
          pitchShiftRef.current = pitchShift;
          playersRef.current.connect(pitchShift);
          pitchShift.toDestination();

          Object.keys(players).forEach(name => {
              playersRef.current?.player(name).sync().start(0);
              if (name !== "Main") playersRef.current?.player(name).set({ mute: true });
          });
        }

        if (currentSong.sheetMusic) {
          await osmd.load(currentSong.sheetMusic);
          osmd.render();
          instrumentMapRef.current.clear();
          instrumentParts.forEach((partName, index) => {
            if (osmd.Sheet.Instruments[index]) {
              instrumentMapRef.current.set(partName, osmd.Sheet.Instruments[index].Id);
            }
          });
          osmd.cursor.resetIterator();
          prepareSyncData(osmd);
          osmd.cursor.hide();
        } else {
          osmd.clear(); // Clear if no sheet music
        }

        const tempoFromSheet = osmd.Sheet?.DefaultStartTempoInBpm;
        const initialTempo = currentSong.tempo || tempoFromSheet || 120;
        tempoRef.current = initialTempo;
        setTempo(initialTempo);
        Tone.Transport.bpm.value = initialTempo;
        setTempoMin(Math.round(initialTempo * 0.66));
        setTempoMax(Math.round(initialTempo * 1.15));

        console.log("Loading finished: isLoaded = true");
        setIsLoaded(true); // <-- Spinner should hide here

      } catch (err) {
        console.error("Error during initialization:", err);
      }
    };

    init().catch(err => console.error("Error initializing song:", err));

  }, [currentSong, instrumentParts]);

  // Mute logic
  useEffect(() => {
    if (!isLoaded || !playersRef.current) return;

    const playerToEnable = mutedInstrument || 'Main';
    instrumentParts.concat('Main').forEach(name => {
      if (playersRef.current?.has(name)) {
        playersRef.current.player(name).mute = (name !== playerToEnable);
      }
    });

    if (osmdRef.current?.Sheet) {
      osmdRef.current.Sheet.Instruments.forEach(inst => {
        inst.Visible = !mutedInstrument || inst.Id === instrumentMapRef.current.get(mutedInstrument);
      });
      osmdRef.current.render();
      osmdRef.current.cursor.resetIterator();
      prepareSyncData(osmdRef.current);
    }
  }, [mutedInstrument, isLoaded, instrumentParts]);

  // Cleanup
  useEffect(() => {
    return () => {
      osmdRef.current?.clear();
      playersRef.current?.dispose();
      pitchShiftRef.current?.dispose();
      metronomePlayerRef.current?.dispose();
      Tone.Transport.stop();
    };
  }, []);

  const handleSelectSong = (song: Song) => {
    stop();
    setCurrentSong(song);
    setMutedInstrument(null);
  };

  const handleTempoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newTempo = parseFloat(event.target.value);
    setTempo(newTempo);
    Tone.Transport.bpm.value = newTempo;
    if (playersRef.current && tempoRef.current && pitchShiftRef.current) {
      const playbackRate = newTempo / tempoRef.current;
      Object.keys(instrumentPlayAlongMap).forEach(name => {
        if (playersRef.current?.has(name)) {
          playersRef.current.player(name).playbackRate = playbackRate;
        }
      });
      pitchShiftRef.current.pitch = -12 * Math.log2(playbackRate);
    }
  };

  const resetTempo = () => {
    if (tempoRef.current) {
      handleTempoChange({ target: { value: tempoRef.current.toString() } } as React.ChangeEvent<HTMLInputElement>);
    }
  };

  const updateCursor = () => {
    if (osmdRef.current?.cursor && osmdRef.current.Sheet) {
      const currentTicks = Tone.Transport.ticks;
      let nextNoteIndex = currentNoteIndex.current + 1;
      while (noteSyncData[nextNoteIndex] && currentTicks >= noteSyncData[nextNoteIndex].ticks) {
        osmdRef.current.cursor.next();
        currentNoteIndex.current = nextNoteIndex++;
      }
      animationFrameId.current = requestAnimationFrame(updateCursor);
    }
  };

  const togglePlayback = async () => {
    if (!isLoaded) return;
    if (isPlaying) {
      Tone.Transport.pause();
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    } else {
      await Tone.start();
      if (Tone.Transport.state === "stopped" && metronomePlayerRef.current && tempoRef.current) {
        const oneBeatDuration = 60 / tempoRef.current;
        const countInDuration = oneBeatDuration * 8;
        const now = Tone.now();
        for (let i = 0; i < 8; i++) {
          if (i === 1 || i === 3) {
            continue;
          }
          metronomePlayerRef.current.start(now + i * oneBeatDuration);
        }
        Tone.Transport.start(now + countInDuration);
      } else {
        Tone.Transport.start();
      }

      if (osmdRef.current?.cursor && osmdRef.current.Sheet) {
        osmdRef.current.cursor.show();
        currentNoteIndex.current = 0;
        osmdRef.current.cursor.reset();
        animationFrameId.current = requestAnimationFrame(updateCursor);
      }
    }
    setIsPlaying(!isPlaying);
  };

  const stop = () => {
    if (!isLoaded) return;
    Tone.Transport.stop();
    if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    if (osmdRef.current?.cursor) {
      osmdRef.current.cursor.reset();
      osmdRef.current.cursor.hide();
    }
    currentNoteIndex.current = 0;
    setIsPlaying(false);
  };

  const handleMuteToggle = (instrumentName: string) => {
    setMutedInstrument(mutedInstrument === instrumentName ? null : instrumentName);
  };

  const prepareSyncData = (osmd: OpenSheetMusicDisplay) => {
    if (!osmd.Sheet) return;
    const allNotes: NoteSyncData[] = [];
    const timestamps = new Set<number>();
    const iterator = osmd.cursor.Iterator;
    const ppq = Tone.Transport.PPQ;
    while (!iterator.EndReached) {
      const timestamp = iterator.currentTimeStamp.RealValue;
      if (timestamp >= 0 && !timestamps.has(timestamp) && iterator.CurrentVoiceEntries?.some(ve => ve.ParentVoice.Parent.Visible)) {
        const timeSignature = iterator.CurrentMeasure.ActiveTimeSignature;
        const ticks = (timestamp * timeSignature.Numerator * (4 / timeSignature.Denominator)) * ppq;
        allNotes.push({ timestamp, ticks });
        timestamps.add(timestamp);
      }
      iterator.moveToNext();
    }
    setNoteSyncData(allNotes);
  };

  return (
    <div>
      <SongSelectionModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSelectSong={handleSelectSong} songs={songs} />
      <div className="sticky top-0 z-10 p-4 bg-white flex justify-center border-b border-gray-300">
        <button onClick={() => setIsModalOpen(true)} className="ml-4 px-4 py-2 text-white bg-blue-500 rounded hover:bg-blue-700">Select Song</button>
        <button onClick={togglePlayback} disabled={!isLoaded} className="ml-4 px-4 py-2 text-white bg-green-500 rounded hover:bg-green-700 disabled:bg-gray-400">{isPlaying ? 'Pause' : 'Play'}</button>
        <button onClick={stop} disabled={!isLoaded} className="ml-4 px-4 py-2 text-white bg-red-500 rounded hover:bg-red-700 disabled:bg-gray-400">Stop</button>
        <div className="ml-4 flex items-center">
          <label htmlFor="tempo-slider" className="mr-2 text-black">Tempo:</label>
          <input id="tempo-slider" type="range" min={tempoMin} max={tempoMax} value={tempo} onChange={handleTempoChange} className="w-32" />
          <span className="ml-2 text-black">{tempo} BPM</span>
          <button onClick={resetTempo} className="ml-2 text-sm text-blue-500 hover:underline">(Reset)</button>
        </div>
        {instrumentParts.map(part => (
          <button
            key={part}
            onClick={() => handleMuteToggle(part)}
            disabled={!isLoaded || isPlaying}
            className={`ml-4 px-4 py-2 rounded ${!isLoaded || isPlaying ? 'opacity-50 cursor-not-allowed' : (mutedInstrument === part ? "bg-yellow-500 text-black" : "bg-gray-500 text-white hover:bg-gray-700")}`}
          >
            {part}
          </button>
        ))}
      </div>
      <div className="flex justify-center p-4">
        {!isLoaded && <LoadingSpinner />}
        <div ref={sheetMusicContainerRef} className="w-full" />
      </div>
    </div>
  );
}
